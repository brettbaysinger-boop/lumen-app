"""Client for the RMC application gateway (Lumen side only).

Transport: HTTP/1.1 over an owner-only Unix domain socket created by the RMC
installation. No TCP address is accepted, so this client can never be pointed
at raw Hindsight (port 8888) or PostgreSQL (5432).

Each request carries a host assertion (installation, verified Lumen user,
owned companion, conversation session, fresh nonce and time) signed with the
Lumen host key. The gateway is expected to verify that signature, then issue
its own short-lived RMC grants internally and run the existing RMC
SessionGuardedWriter / SessionGuardedReadGateway, privacy coordinator and
durable write ledger. This module never sees or creates RMC grants.

Every outcome is a fixed code. Errors never carry memory text, keys or
tokens.
"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import hmac
import json
import os
import re
import secrets
import stat
import time

import httpx

ASSERTION_VERSION = 1
SIGNATURE_HEADER = "X-RMC-Host-Signature"
REMEMBER_PATH = "/v1/host/remember"
RECALL_PATH = "/v1/host/recall"
_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$")
_MAX_RESPONSE_BYTES = 512 * 1024
_DENIED_STATUSES = frozenset((400, 403, 404, 405))
# Gateway limits (RMC scripts/rmc_app_gateway_protocol.py).
MAX_MEMORY_TEXT = 10000
MAX_QUESTION = 2000

# Write outcomes. Only STORED and ALREADY_STORED mean the fact is durable.
STORED = "stored"
ALREADY_STORED = "already_stored"
UNCERTAIN = "uncertain"            # may or may not have been stored
PRIVACY_DENIED = "privacy_denied"  # current policy refuses this write/read
DENIED = "denied"                  # identity/ownership/grant refused
UNAVAILABLE = "unavailable"        # nothing was sent or nothing was stored
WRITE_OUTCOMES = frozenset((STORED, ALREADY_STORED, UNCERTAIN,
                            PRIVACY_DENIED, DENIED, UNAVAILABLE))
# Read outcomes.
OK = "ok"
READ_OUTCOMES = frozenset((OK, PRIVACY_DENIED, DENIED, UNAVAILABLE))


class RmcConfigError(RuntimeError):
    """The RMC backend is selected but not safely configured."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class RmcConfig:
    installation_id: str
    socket_path: str
    host_key: bytes
    timeout_s: float


@dataclass(frozen=True)
class WriteResult:
    outcome: str


@dataclass(frozen=True)
class ReadResult:
    outcome: str
    context: dict | None = None


def valid_id(value) -> bool:
    return isinstance(value, str) and bool(_ID.fullmatch(value))


def _require_private_parent(path: str, code: str):
    parent = os.path.dirname(path)
    try:
        info = os.stat(parent)
    except OSError as exc:
        raise RmcConfigError(code) from exc
    if not stat.S_ISDIR(info.st_mode) or info.st_mode & 0o022:
        # A group/world-writable directory would let another account swap
        # the socket or key file.
        raise RmcConfigError(code)


def _require_owner_only_dir(path: str, code: str):
    """Directory must be a real (non-symlink) dir owned by us, mode 0700."""
    try:
        info = os.lstat(path)
    except OSError as exc:
        raise RmcConfigError(code) from exc
    if (not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid()
            or info.st_mode & 0o077):
        raise RmcConfigError(code)


def validate_socket(path: str):
    """The gateway socket must be exactly what the RMC installation created.

    * absolute path with no symlink anywhere in it (realpath == path), so a
      link cannot redirect the client to another socket;
    * its directory is a real directory owned by this uid, mode 0700, so no
      other account can replace the socket between check and connect;
    * the socket itself is a socket (lstat, not followed), owned by this
      uid, and not accessible to group or others.
    """
    if not path or not os.path.isabs(path) or os.path.normpath(path) != path:
        raise RmcConfigError("RMC_GATEWAY_SOCKET_PATH_INVALID")
    if os.path.realpath(path) != path:
        raise RmcConfigError("RMC_GATEWAY_SOCKET_SYMLINK")
    _require_owner_only_dir(os.path.dirname(path), "RMC_GATEWAY_SOCKET_DIR_UNSAFE")
    try:
        info = os.lstat(path)
    except OSError as exc:
        raise RmcConfigError("RMC_GATEWAY_SOCKET_MISSING") from exc
    if not stat.S_ISSOCK(info.st_mode):
        raise RmcConfigError("RMC_GATEWAY_SOCKET_NOT_SOCKET")
    if info.st_uid != os.geteuid():
        raise RmcConfigError("RMC_GATEWAY_SOCKET_OWNER_MISMATCH")
    if info.st_mode & 0o077:
        raise RmcConfigError("RMC_GATEWAY_SOCKET_MODE_UNSAFE")


def load_host_key(path: str) -> bytes:
    if not path or not os.path.isabs(path) or os.path.normpath(path) != path:
        raise RmcConfigError("RMC_HOST_KEY_PATH_INVALID")
    if os.path.realpath(path) != path:
        raise RmcConfigError("RMC_HOST_KEY_SYMLINK")
    _require_private_parent(path, "RMC_HOST_KEY_DIR_UNSAFE")
    try:
        info = os.lstat(path)
    except OSError as exc:
        raise RmcConfigError("RMC_HOST_KEY_MISSING") from exc
    if not stat.S_ISREG(info.st_mode):
        raise RmcConfigError("RMC_HOST_KEY_NOT_REGULAR_FILE")
    if info.st_mode & 0o077:
        raise RmcConfigError("RMC_HOST_KEY_MODE_UNSAFE")
    if info.st_uid != os.geteuid():
        raise RmcConfigError("RMC_HOST_KEY_OWNER_MISMATCH")
    with open(path, "rb") as handle:
        key = handle.read(4097).strip()
    if not 32 <= len(key) <= 4096:
        raise RmcConfigError("RMC_HOST_KEY_LENGTH_INVALID")
    return key


def load_config(settings) -> RmcConfig:
    installation = getattr(settings, "rmc_installation_id", "")
    if not valid_id(installation):
        raise RmcConfigError("RMC_INSTALLATION_ID_INVALID")
    socket_path = getattr(settings, "rmc_gateway_socket", "")
    if not socket_path or not os.path.isabs(socket_path):
        raise RmcConfigError("RMC_GATEWAY_SOCKET_PATH_INVALID")
    key = load_host_key(getattr(settings, "rmc_host_key_file", ""))
    timeout = float(getattr(settings, "rmc_timeout_seconds", 10.0))
    return RmcConfig(installation, socket_path, key, timeout)


def canonical(value) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=True, allow_nan=False).encode("ascii")


def signature(key: bytes, path: str, body: bytes) -> str:
    mac = hmac.new(key, b"rmc-host-v1\0" + path.encode("ascii") + b"\0" + body,
                   hashlib.sha256)
    return "hmac-sha256=" + mac.hexdigest()


class RmcGatewayClient:
    def __init__(self, config: RmcConfig, *, transport=None, clock=time.time):
        self.config = config
        self._transport = transport
        self._clock = clock
        self.last_socket_error: str | None = None

    def _assertion(self, user_id, companion_id, session_id, session_mode):
        for value in (user_id, companion_id, session_id):
            if not valid_id(value):
                raise ValueError("Invalid identifier")
        if session_mode not in ("normal", "private"):
            raise ValueError("Invalid session mode")
        return {
            "v": ASSERTION_VERSION,
            "host": "lumen",
            "installation_id": self.config.installation_id,
            "user_id": user_id,
            "companion_id": companion_id,
            "session_id": session_id,
            "session_mode": session_mode,
            "issued_at": int(self._clock()),
            "nonce": secrets.token_hex(16),
        }

    def _socket_ok(self) -> bool:
        # Re-checked before every request: the gateway may have restarted.
        try:
            validate_socket(self.config.socket_path)
            return True
        except RmcConfigError as exc:
            self.last_socket_error = exc.code
            return False

    async def _post(self, path, payload):
        body = canonical(payload)
        transport = self._transport or httpx.AsyncHTTPTransport(
            uds=self.config.socket_path, retries=0)
        async with httpx.AsyncClient(
                transport=transport, base_url="http://rmc-gateway",
                timeout=self.config.timeout_s, follow_redirects=False,
                trust_env=False) as client:
            response = await client.post(path, content=body, headers={
                "Content-Type": "application/json",
                SIGNATURE_HEADER: signature(self.config.host_key, path, body),
            })
        if len(response.content) > _MAX_RESPONSE_BYTES:
            raise _BadResponse()
        try:
            data = json.loads(response.content)
        except ValueError as exc:
            raise _BadResponse() from exc
        if not isinstance(data, dict):
            raise _BadResponse()
        if response.status_code == 200:
            return data
        # The RMC gateway (D01-16) refuses unauthenticated, malformed or
        # unadmitted requests with 400/403/404/405 and exactly
        # {"outcome":"denied"}, always BEFORE any memory operation, so that
        # is a definite "not stored". Every other status (503 included) may
        # follow a write and stays uncertain.
        if response.status_code in _DENIED_STATUSES and data == {"outcome": DENIED}:
            return data
        raise _BadResponse()

    async def remember(self, *, user_id, companion_id, session_id,
                       session_mode, source_id, timestamp, text) -> WriteResult:
        if self._transport is None and not self._socket_ok():
            return WriteResult(UNAVAILABLE)  # nothing was sent
        payload = {
            "assertion": self._assertion(user_id, companion_id, session_id,
                                         session_mode),
            "event": {"source_id": source_id, "timestamp": timestamp,
                      "text": text},
        }
        try:
            data = await self._post(REMEMBER_PATH, payload)
        except httpx.ConnectError:
            return WriteResult(UNAVAILABLE)  # connection refused: not sent
        except (httpx.HTTPError, _BadResponse):
            # The request may have reached the gateway: never claim either
            # outcome. The same source_id is idempotent on retry.
            return WriteResult(UNCERTAIN)
        outcome = data.get("outcome")
        if set(data) != {"outcome"} or outcome not in WRITE_OUTCOMES:
            return WriteResult(UNCERTAIN)
        return WriteResult(outcome)

    async def recall(self, *, user_id, companion_id, session_id,
                     session_mode, question) -> ReadResult:
        if self._transport is None and not self._socket_ok():
            return ReadResult(UNAVAILABLE)
        payload = {
            "assertion": self._assertion(user_id, companion_id, session_id,
                                         session_mode),
            "question": question,
        }
        try:
            data = await self._post(RECALL_PATH, payload)
        except (httpx.HTTPError, _BadResponse):
            return ReadResult(UNAVAILABLE)
        outcome = data.get("outcome")
        if outcome not in READ_OUTCOMES:
            return ReadResult(UNAVAILABLE)
        if outcome == OK:
            context = data.get("context")
            if set(data) != {"outcome", "context"} or not isinstance(context, dict):
                return ReadResult(UNAVAILABLE)
            return ReadResult(OK, context)
        if set(data) != {"outcome"}:
            return ReadResult(UNAVAILABLE)
        return ReadResult(outcome)


class _BadResponse(Exception):
    pass

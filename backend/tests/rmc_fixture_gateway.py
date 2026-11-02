"""TEST FIXTURE ONLY: a stand-in for the missing RMC application gateway.

It serves the Lumen host contract (lumen/rmc/client.py) on a real Unix domain
socket and, behind it, runs the UNMODIFIED RMC code from a read-only RMC
checkout (LUMEN_RMC_SOURCE_DIR, expected at bd64be1):

  ReferenceHost -> signed V2 grants -> SessionGuardedWriter /
  SessionGuardedReadGateway, PrivacyCoordinator, PrivacyGate, PrivacyLog.

What it is NOT: Hindsight (the scripted CR1-D FixtureBackend stands in) or
PostgreSQL (the CR1-D FixtureLedger has the PostgresWriteLedger contract but
is in-process). It is not deployable and is not the production gateway; the
installed RMC has no such service yet (see docs/rmc-integration.md).

All identities and keys are fictional and random per run.
"""
from __future__ import annotations

from http.server import BaseHTTPRequestHandler
import hashlib
import hmac
import json
import os
import secrets
import socketserver
import subprocess
import sys
import tempfile
import threading
import time

EXPECTED_RMC_SHA = "bd64be1644c6401b67cf6bdceeafb8aa31245184"
SIGNATURE_HEADER = "X-RMC-Host-Signature"
_ASSERTION_KEYS = {"v", "host", "installation_id", "user_id", "companion_id",
                   "session_id", "session_mode", "issued_at", "nonce"}
_MAX_SKEW_S = 60


def rmc_source_dir():
    return os.environ.get("LUMEN_RMC_SOURCE_DIR", "")


def rmc_source_sha(path):
    try:
        return subprocess.run(["git", "-C", path, "rev-parse", "HEAD"],
                              capture_output=True, text=True, check=True,
                              timeout=10).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""


def import_rmc(path):
    for sub in ("scripts", "", "src"):
        entry = os.path.join(path, sub) if sub else path
        if entry not in sys.path:
            sys.path.insert(0, entry)
    from rmc_core.auth import AccessDenied
    from rmc_core.core import Principal, RMCError
    from rmc_core.protected_write import LedgerError, ReplayDenied
    from reference_host.app import ReferenceHost
    from reference_host.coordination import GuardUnavailable, PolicyChanged
    from reference_host.memory_store import MemoryStore
    from reference_host.privacy_gate import PrivacyReadDenied
    from reference_host.privacy_log import PrivacyLog
    from rmc_cr1d_fictional_acceptance import FixtureBackend, FixtureLedger
    return dict(locals())


def _unique(pairs):
    out = {}
    for key, value in pairs:
        if key in out:
            raise ValueError("duplicate key")
        out[key] = value
    return out


class FixtureGateway:
    def __init__(self, *, installation_id, host_key, socket_dir):
        self.m = import_rmc(rmc_source_dir())
        self.installation_id = installation_id
        self.host_key = host_key
        self.backend = self.m["FixtureBackend"]()
        self.ledger = self.m["FixtureLedger"]()
        self.store = self.m["MemoryStore"](installation_id,
                                           recovery_key=secrets.token_bytes(32))
        self._tmp = tempfile.mkdtemp(prefix="rmc-plog-")
        plog = self.m["PrivacyLog"](os.path.join(self._tmp, "privacy.log"),
                                    os.path.join(self._tmp, "privacy.witness"),
                                    secrets.token_bytes(32))
        plog.initialize()
        self.host = self.m["ReferenceHost"](
            store=self.store, backend=self.backend, ledger=self.ledger,
            key=secrets.token_bytes(32), installation_id=installation_id,
            lock_timeout_s=2.0, privacy_log=plog)
        self._nonces = set()
        self._credentials = {}
        self.requests = []          # (path, outcome) for assertions
        self.down = False           # simulate a gateway-level 5xx
        self.socket_path = os.path.join(socket_dir, "gateway.sock")
        self._server = None

    # -- identity binding (host assertion -> reference-host state) ----------
    def _bind(self, a):
        s, user, companion, session = self.store, a["user_id"], a["companion_id"], a["session_id"]
        with s._mutex:
            owner = s.companions.get(companion, "__absent__")
            if owner not in ("__absent__", user):
                return None  # companion is bound to a different owner
            known = s.sessions.get(session)
            if known is not None and (known["user"], known["companion"]) != (user, companion):
                return None  # session id belongs to another pair
            if user not in s.users:
                s.add_user(user)
            if owner == "__absent__":
                s.add_companion(companion, user)
            if (user, companion) not in s.pairs:
                s.add_pair(user, companion)
            if known is None:
                credential = "lumen-fixture-" + secrets.token_hex(24)
                s.add_session(session, user, companion, credential,
                              mode=a["session_mode"])
                self._credentials[session] = credential
            elif known["mode"] != a["session_mode"]:
                return None
        return self._credentials[session]

    def _verify(self, path, raw, signature):
        expected = "hmac-sha256=" + hmac.new(
            self.host_key, b"rmc-host-v1\0" + path.encode() + b"\0" + raw,
            hashlib.sha256).hexdigest()
        if not isinstance(signature, str) or not hmac.compare_digest(signature, expected):
            return None
        try:
            body = json.loads(raw, object_pairs_hook=_unique)
        except ValueError:
            return None
        a = body.get("assertion") if isinstance(body, dict) else None
        if not isinstance(a, dict) or set(a) != _ASSERTION_KEYS:
            return None
        if (a["v"] != 1 or a["host"] != "lumen"
                or a["installation_id"] != self.installation_id
                or type(a["issued_at"]) is not int
                or abs(time.time() - a["issued_at"]) > _MAX_SKEW_S
                or not isinstance(a["nonce"], str) or a["nonce"] in self._nonces):
            return None
        self._nonces.add(a["nonce"])
        return body

    # -- operations ---------------------------------------------------------
    def remember(self, body):
        m = self.m
        event = body.get("event")
        if set(body) != {"assertion", "event"} or not isinstance(event, dict):
            return "denied"
        credential = self._bind(body["assertion"])
        if credential is None:
            return "denied"
        bank = self.host.rmc.bank_for(m["Principal"](
            body["assertion"]["user_id"], body["assertion"]["companion_id"]))
        source = event.get("source_id")
        before = self.ledger.state(self.installation_id, bank, source)
        try:
            result = self.host.handle_write(credential, event)
        except m["ReplayDenied"]:
            state = self.ledger.state(self.installation_id, bank, source)
            return "already_stored" if state and state[0] == "stored" else "uncertain"
        except (m["PolicyChanged"],):
            return "privacy_denied"
        except m["GuardUnavailable"]:
            return "unavailable"
        except m["AccessDenied"] as exc:
            return "privacy_denied" if "policy denied" in str(exc) else "denied"
        except (m["LedgerError"], m["RMCError"]):
            after = self.ledger.state(self.installation_id, bank, source)
            return "uncertain" if after != before else "unavailable"
        return "stored" if isinstance(result, dict) and result.get("stored") is True else "uncertain"

    def recall(self, body):
        m = self.m
        if set(body) != {"assertion", "question"} or not isinstance(body["question"], str):
            return {"outcome": "denied"}
        credential = self._bind(body["assertion"])
        if credential is None:
            return {"outcome": "denied"}
        try:
            context = self.host.handle_read(credential, body["question"])
        except m["PrivacyReadDenied"]:
            return {"outcome": "privacy_denied"}
        except m["AccessDenied"] as exc:
            return {"outcome": "privacy_denied" if "policy denied" in str(exc) else "denied"}
        except (m["RMCError"], ValueError):
            return {"outcome": "unavailable"}
        return {"outcome": "ok", "context": context}

    # -- transport ----------------------------------------------------------
    def start(self):
        gateway = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, *args):
                pass

            def address_string(self):
                return "uds"

            def _send(self, status, payload):
                data = json.dumps(payload).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Connection", "close")
                self.end_headers()
                self.wfile.write(data)
                self.close_connection = True

            def do_POST(self):
                length = int(self.headers.get("Content-Length") or 0)
                raw = self.rfile.read(min(length, 65536))
                if gateway.down:
                    gateway.requests.append((self.path, "http_503"))
                    return self._send(503, {"error": "unavailable"})
                if self.path not in ("/v1/host/remember", "/v1/host/recall"):
                    return self._send(404, {"error": "not_found"})
                body = gateway._verify(self.path, raw, self.headers.get(SIGNATURE_HEADER))
                if body is None:
                    gateway.requests.append((self.path, "denied"))
                    return self._send(200, {"outcome": "denied"})
                if self.path == "/v1/host/remember":
                    outcome = gateway.remember(body)
                    gateway.requests.append((self.path, outcome))
                    return self._send(200, {"outcome": outcome})
                payload = gateway.recall(body)
                gateway.requests.append((self.path, payload["outcome"]))
                return self._send(200, payload)

        class Server(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
            daemon_threads = True

        self._server = Server(self.socket_path, Handler)
        os.chmod(self.socket_path, 0o600)
        threading.Thread(target=self._server.serve_forever, daemon=True).start()
        return self

    def stop(self):
        if self._server is not None:
            self._server.shutdown()
            self._server.server_close()
            self._server = None
        try:
            os.unlink(self.socket_path)
        except FileNotFoundError:
            pass

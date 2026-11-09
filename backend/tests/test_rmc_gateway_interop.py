"""Lumen client <-> the REAL RMC application gateway boundary (offline).

Runs the unmodified gateway transport and authentication code from the RMC
gateway candidate (LUMEN_RMC_SOURCE_DIR, expected at 345edd0):
`OwnerUnixHTTPServer` (owner-only Unix socket, SO_PEERCRED),
`ApplicationBoundary` (canonical JSON, HMAC, freshness, fixed outcomes) and
`read_owner_key` (the gateway's own host-key reader), on a real socket.

Only the PostgreSQL registry and the guarded Hindsight engine are stand-ins
here; those were accepted live on Forge and are not re-proved by this file.
All identities, keys and facts are fictional and random per run.
"""
import os
import secrets
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import AsyncMock, Mock

from lumen.config import Settings
from lumen.rmc import client as rmc_client
from lumen.rmc.adapter import LumenRmcMemory
from lumen.runtime import CognitionRuntime

EXPECTED_GATEWAY_SHA = "345edd0b9231fe506f561449bad8d0702ec132f4"
INSTALL = "lumen-rmc02-fixture"
ADA = "00000000-0000-4000-8000-00000000ada1"
BEN = "00000000-0000-4000-8000-00000000be11"
ADA_COMPANION = "00000000-0000-4000-8000-0000000c0a01"
BEN_COMPANION = "00000000-0000-4000-8000-0000000c0b01"
CHAT = "00000000-0000-4000-8000-0000000000c1"
FACT = "Fictional Ada keeps a teal kayak named Pebble"


def gateway_source():
    path = os.environ.get("LUMEN_RMC_SOURCE_DIR", "")
    if not path or not os.path.isfile(os.path.join(path, "scripts", "rmc_app_gateway_socket.py")):
        raise unittest.SkipTest("LUMEN_RMC_SOURCE_DIR does not point at the RMC gateway candidate")
    try:
        sha = subprocess.run(["git", "-C", path, "rev-parse", "HEAD"], capture_output=True,
                             text=True, check=True, timeout=10).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        sha = ""
    if sha != EXPECTED_GATEWAY_SHA and os.environ.get("LUMEN_RMC_ALLOW_OTHER_SHA") != "YES":
        raise AssertionError(f"RMC gateway checkout is {sha or 'unknown'}, expected {EXPECTED_GATEWAY_SHA}")
    for entry in (os.path.join(path, "src"), path):
        if entry not in sys.path:
            sys.path.insert(0, entry)
    from scripts import rmc_app_gateway_pg as pg
    from scripts import rmc_app_gateway_protocol as protocol
    from scripts import rmc_app_gateway_socket as sock
    for module in (pg, protocol, sock):
        if not os.path.realpath(module.__file__).startswith(os.path.realpath(path) + os.sep):
            raise AssertionError("gateway module imported from outside LUMEN_RMC_SOURCE_DIR")
    return pg, protocol, sock


def private_dir(parent=None, name=None):
    if name:
        path = os.path.join(parent, name)
        os.mkdir(path, 0o700)
    else:
        path = os.path.realpath(tempfile.mkdtemp(prefix="lumen-gw-", dir=parent))
    os.chmod(path, 0o700)
    return path


class StandInRegistry:
    """Same admission rules the PG registry enforces (nonce, first owner)."""

    def __init__(self, pg, protocol, key_dir):
        self.pg, self.protocol, self.key_dir = pg, protocol, key_dir
        self.nonces, self.owners, self.admitted = set(), {}, 0

    def host_key(self, host):
        try:
            return self.pg.read_owner_key(os.path.join(self.key_dir, host + "-host.key"))
        except OSError:
            raise self.protocol.GatewayStop("HOST_NOT_REGISTERED") from None

    def admit(self, assertion, key):
        stop = self.protocol.GatewayStop
        if (assertion.host, assertion.nonce) in self.nonces:
            raise stop("REPLAY")
        self.nonces.add((assertion.host, assertion.nonce))
        owner = self.owners.setdefault((assertion.host, assertion.companion), assertion.user)
        if owner != assertion.user:
            raise stop("OWNER_MISMATCH")
        self.admitted += 1
        return (assertion.host, assertion.user, assertion.companion)


class StandInEngine:
    """Records what the boundary lets through. NOT Hindsight."""

    def __init__(self):
        self.saved, self.calls, self.fail = {}, [], None

    def remember(self, principal, event):
        self.calls.append(("remember", principal))
        if self.fail == "raise":
            raise RuntimeError("engine crashed after admission")
        if self.fail:
            return self.fail
        key = (principal, event["source_id"])
        if key in self.saved:
            return "already_stored"
        self.saved[key] = event["text"]
        return "stored"

    def recall(self, principal, question):
        self.calls.append(("recall", principal))
        if self.fail == "raise":
            raise RuntimeError("engine crashed")
        claims = [{"memory_id": source, "type": "world", "text": text,
                   "source_document_ids": [source]}
                  for (p, source), text in self.saved.items() if p == principal]
        return {"outcome": "ok", "context": {"candidate_claims": claims, "source_documents": []}}


class GatewayInterop(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        pg, protocol, sock = gateway_source()
        self.protocol, self.sock = protocol, sock
        self.root = private_dir()
        self.addCleanup(shutil.rmtree, self.root, True)
        # Same layout the D01-16 installer creates under rmc-<id>/.
        run = private_dir(private_dir(self.root, "run"), "gateway")
        hosts = private_dir(private_dir(self.root, "keys"), "gateway-hosts")
        self.socket_path = os.path.join(run, "gateway.sock")
        self.key_file = os.path.join(hosts, "lumen-host.key")
        with open(self.key_file, "wb") as handle:
            handle.write(secrets.token_hex(32).encode("ascii"))  # installer format
        os.chmod(self.key_file, 0o600)
        self.registry = StandInRegistry(pg, protocol, hosts)
        self.engine = StandInEngine()
        self.serve()
        self.settings = Settings(
            supabase_url="http://supabase.invalid", supabase_service_role_key="fictional",
            lumen_memory_backend="rmc", rmc_installation_id=INSTALL,
            rmc_gateway_socket=self.socket_path, rmc_host_key_file=self.key_file,
            rmc_timeout_seconds=5)

    def serve(self, **owner):
        boundary = self.protocol.ApplicationBoundary(INSTALL, self.registry, self.engine)
        self.server = self.sock.OwnerUnixHTTPServer(self.socket_path, boundary, **owner)
        thread = threading.Thread(target=self.server.serve_forever,
                                  kwargs={"poll_interval": 0.05}, daemon=True)
        thread.start()

        server = self.server

        def stop():
            server.shutdown()
            try:
                server.server_close()
            except FileNotFoundError:
                pass  # already closed by the test
        self.addCleanup(stop)

    def memory(self, user=ADA):
        return LumenRmcMemory(self.settings, user)

    def companion(self, cid=ADA_COMPANION, owner=ADA):
        return {"id": cid, "owner_user_id": owner, "name": "Lumen"}

    async def test_save_retry_and_recall_through_real_boundary(self):
        memory = self.memory()
        self.assertEqual(await memory.remember(self.companion(), CHAT, "req-1", FACT), "saved")
        self.assertEqual(await memory.remember(self.companion(), CHAT, "req-1", FACT), "existing")
        status, rows = await memory.relevant(self.companion(), CHAT, "What is Ada's kayak called?")
        self.assertEqual(status, "ok")
        self.assertEqual([r["content"] for r in rows], [FACT])
        self.assertEqual(self.registry.admitted, 3)

    async def test_full_lumen_turns_streaming_and_not(self):
        from test_rmc_integration import FakeSupabase
        runtime = CognitionRuntime(self.settings, "fictional-token", ADA)
        runtime.db = FakeSupabase(ADA)
        runtime.provider = Mock(generate=AsyncMock())
        runtime.provider.name = "ollama"
        runtime.request_key = "turn-1"
        saved = await runtime.respond(ADA_COMPANION, None, "Remember: " + FACT)
        self.assertEqual(saved.memory_status, "saved")
        later = CognitionRuntime(self.settings, "fictional-token", ADA)
        later.db = FakeSupabase(ADA)
        later.request_key = "turn-2"
        later.provider = Mock()
        later.provider.name = "ollama"

        async def stream(model, messages, emit, *args, **kwargs):
            later.prompt = "\n".join(m["content"] for m in messages)
            await emit({"type": "delta", "text": "Pebble."})
            return dict(content="Pebble.", model="m", latency_ms=1, tokens_in=1, tokens_out=1)
        later.provider.generate_stream = AsyncMock(side_effect=stream)
        events = []

        async def emit(event):
            events.append(event)
        await later.respond(ADA_COMPANION, None, "What is my kayak called?", emit=emit)
        self.assertIn("named Pebble", later.prompt)
        for r in (runtime, later):
            r.db.remember.assert_not_awaited()
            self.assertEqual(r.db.memory_table_calls(), [])

    async def test_gateway_denials_are_reported_as_not_saved(self):
        await self.memory().remember(self.companion(), CHAT, "req-1", FACT)
        # Ben claims Ada's companion: first-owner binding refuses (HTTP 403).
        ben = self.memory(BEN)
        self.assertEqual(await ben.remember(self.companion(owner=BEN), CHAT, "b-1", FACT), "not_saved")
        self.assertEqual(await ben.relevant(self.companion(owner=BEN), CHAT, "kayak?"), ("denied", []))
        # Ben's own companion is a separate bank with nothing in it.
        self.assertEqual(await ben.relevant(self.companion(BEN_COMPANION, BEN), CHAT, "kayak?"), ("ok", []))
        self.assertEqual(len([c for c in self.engine.calls if c[1][1] == BEN and c[1][2] == ADA_COMPANION]), 0)

    async def test_wrong_key_unregistered_host_and_stale_clock_are_denied(self):
        config = rmc_client.load_config(self.settings)
        args = dict(user_id=ADA, companion_id=ADA_COMPANION, session_id=CHAT, session_mode="normal",
                    source_id="lumen-x", timestamp="2026-11-09T01:00:00Z", text=FACT)
        wrong = rmc_client.RmcGatewayClient(rmc_client.RmcConfig(
            INSTALL, self.socket_path, secrets.token_hex(32).encode(), 5))
        self.assertEqual((await wrong.remember(**args)).outcome, "denied")
        stale = rmc_client.RmcGatewayClient(config, clock=lambda: time.time() - 600)
        self.assertEqual((await stale.remember(**args)).outcome, "denied")
        other = rmc_client.RmcGatewayClient(rmc_client.RmcConfig("lumen-rmc01", self.socket_path,
                                                                  config.host_key, 5))
        self.assertEqual((await other.remember(**args)).outcome, "denied")
        os.unlink(self.key_file)      # revoked: the installer removes the key
        self.assertEqual((await rmc_client.RmcGatewayClient(config).remember(**args)).outcome, "denied")
        self.assertEqual(self.engine.calls, [])

    async def test_private_session_is_privacy_denied(self):
        client = rmc_client.RmcGatewayClient(rmc_client.load_config(self.settings))
        wrote = await client.remember(user_id=ADA, companion_id=ADA_COMPANION, session_id=CHAT,
                                      session_mode="private", source_id="lumen-p",
                                      timestamp="2026-11-09T01:00:00Z", text=FACT)
        self.assertEqual(wrote.outcome, "privacy_denied")
        self.assertEqual(self.engine.calls, [])

    async def test_engine_failures_never_read_as_saved(self):
        memory = self.memory()
        self.engine.fail = "raise"     # gateway answers 503 after admission
        self.assertEqual(await memory.remember(self.companion(), CHAT, "req-1", FACT), "unconfirmed")
        self.assertEqual(await memory.relevant(self.companion(), CHAT, "kayak?"), ("unavailable", []))
        for outcome, status in (("uncertain", "unconfirmed"), ("unavailable", "not_saved"),
                                ("privacy_denied", "memory_off"), ("denied", "not_saved"),
                                ("SAVED!", "unconfirmed")):
            self.engine.fail = outcome
            self.assertEqual(await memory.remember(self.companion(), CHAT, "r-" + outcome, FACT), status)

    async def test_oversized_memory_is_not_sent(self):
        memory = self.memory()
        self.assertEqual(await memory.remember(self.companion(), CHAT, "big", "x" * 10001), "not_saved")
        self.assertEqual(self.engine.calls, [])
        self.assertEqual(self.registry.admitted, 0)

    async def test_peer_with_another_gid_is_refused(self):
        self.server.shutdown()
        self.server.server_close()
        self.addCleanup(lambda: None)
        self.serve(owner_gid=os.getgid() + 1)
        self.assertEqual(await self.memory().remember(self.companion(), CHAT, "g", FACT), "not_saved")
        self.assertEqual(self.registry.admitted, 0)


if __name__ == "__main__":
    unittest.main()

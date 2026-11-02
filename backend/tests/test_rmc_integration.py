"""Lumen <-> RMC integration acceptance (offline, fictional data only).

The Lumen side is the real code path (CognitionRuntime, routes, adapter,
gateway client over a real Unix socket). Behind the socket runs the
unmodified RMC SDK and reference host from a read-only RMC checkout
(LUMEN_RMC_SOURCE_DIR) with the CR1-D scripted stand-ins for Hindsight and
the PostgreSQL ledger. See tests/rmc_fixture_gateway.py for what that is not.
"""
import json
import os
import shutil
import stat
import tempfile
import time
import unittest
from unittest.mock import AsyncMock, Mock, patch

from pydantic import ValidationError

from lumen.config import Settings
from lumen.memory_backend import memory_backend, supabase_memory_enabled
from lumen.rmc import client as rmc_client
from lumen.rmc.adapter import LumenRmcMemory, source_id_for
from lumen.runtime import CognitionRuntime

from rmc_fixture_gateway import (
    EXPECTED_RMC_SHA, FixtureGateway, rmc_source_dir, rmc_source_sha,
)

INSTALL = "lumen-rmc01-fixture"
# Fictional identities only.
ADA = "00000000-0000-4000-8000-00000000ada1"
BEN = "00000000-0000-4000-8000-00000000be11"
ADA_COMPANION = "00000000-0000-4000-8000-0000000c0a01"
BEN_COMPANION = "00000000-0000-4000-8000-0000000c0b01"
FACT = "Fictional Ada keeps a teal kayak named Pebble"
QUESTION = "What is the name of Ada's kayak?"
SUPABASE_MEMORY_TABLES = ("memories", "memory_revisions", "memory_observations",
                          "memory_suggestions", "rpc/correct_user_memory",
                          "rpc/propose_memory", "rpc/auto_save_memory_suggestion",
                          "rpc/claim_memory_observation", "rpc/lumen_")


def require_rmc_source(testcase):
    path = rmc_source_dir()
    if not path or not os.path.isdir(os.path.join(path, "src", "rmc_core")):
        raise unittest.SkipTest("LUMEN_RMC_SOURCE_DIR does not point at an RMC checkout")
    sha = rmc_source_sha(path)
    if sha != EXPECTED_RMC_SHA and os.environ.get("LUMEN_RMC_ALLOW_OTHER_SHA") != "YES":
        testcase.fail(f"RMC checkout is {sha or 'unknown'}, expected {EXPECTED_RMC_SHA}")


def private_dir(parent=None):
    # realpath: the socket check refuses any symlinked path component.
    path = os.path.realpath(tempfile.mkdtemp(prefix="lumen-rmc-", dir=parent))
    os.chmod(path, 0o700)
    return path


class FakeSupabase:
    """Supabase stand-in with RLS semantics: rows are visible to their owner only."""

    def __init__(self, user_id):
        self.user_id = user_id
        self.companions = {
            ADA_COMPANION: {"id": ADA_COMPANION, "name": "Lumen", "owner_user_id": ADA},
            BEN_COMPANION: {"id": BEN_COMPANION, "name": "Lumen", "owner_user_id": BEN},
        }
        self.headers = {}
        self.counter = 0
        self.get_relevant_memories = AsyncMock(return_value=[])
        self.remember = AsyncMock(return_value="saved")
        self.get_state = AsyncMock(return_value={})
        self.get_recent_messages = AsyncMock(return_value=[])
        self.get_profile = AsyncMock(return_value={"display_name": "Ada"})
        self.touch_conversation = AsyncMock()
        self.messages = []
        self.request_log = []

    async def get_companion(self, companion_id):
        row = self.companions.get(companion_id)
        return dict(row) if row and row["owner_user_id"] == self.user_id else None

    async def get_conversation(self, conversation_id, companion_id):
        return {"id": conversation_id, "companion_id": companion_id, "title": "Chat"}

    async def create_conversation(self, companion_id, title):
        self.counter += 1
        return {"id": f"00000000-0000-4000-8000-{self.counter:012d}", "companion_id": companion_id,
                "title": title}

    async def create_message(self, payload):
        self.messages.append(payload)
        return {"id": f"msg-{len(self.messages)}", **payload}

    async def _request(self, method, table, **kwargs):
        self.request_log.append((method, table))
        return []

    def memory_table_calls(self):
        return [c for c in self.request_log if c[1].startswith(SUPABASE_MEMORY_TABLES)]


class RmcIntegration(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        require_rmc_source(self)
        self.root = private_dir()
        self.addCleanup(shutil.rmtree, self.root, True)
        self.key = os.urandom(32).hex().encode()
        self.key_file = os.path.join(self.root, "host.key")
        with open(self.key_file, "wb") as handle:
            handle.write(self.key)
        os.chmod(self.key_file, 0o600)
        self.sock_dir = private_dir(self.root)
        self.gateway = FixtureGateway(installation_id=INSTALL, host_key=self.key,
                                      socket_dir=self.sock_dir).start()
        self.addCleanup(self.gateway.stop)
        self.settings = self.make_settings()

    def make_settings(self, **overrides):
        values = dict(supabase_url="http://supabase.invalid", supabase_service_role_key="fictional",
                      lumen_memory_backend="rmc", rmc_installation_id=INSTALL,
                      rmc_gateway_socket=self.gateway.socket_path, rmc_host_key_file=self.key_file,
                      rmc_timeout_seconds=5, memory_observations_enabled=True,
                      semantic_memory_enabled=True, semantic_index_after_chat=True)
        values.update(overrides)
        return Settings(**values)

    def runtime(self, user_id, settings=None, request_key="req-1"):
        runtime = CognitionRuntime(settings or self.settings, "fictional-token", user_id)
        runtime.db = FakeSupabase(user_id)
        runtime.provider = Mock(generate=AsyncMock(return_value=dict(
            content="Here is my reply.", model="test-model", latency_ms=1, tokens_in=1, tokens_out=1)))
        runtime.provider.name = "ollama"

        async def stream(model, messages, emit, *args, **kwargs):
            await emit({"type": "delta", "text": "Here is my reply."})
            return dict(content="Here is my reply.", model="test-model", latency_ms=1,
                        tokens_in=1, tokens_out=1)
        runtime.provider.generate_stream = AsyncMock(side_effect=stream)
        runtime.request_key = request_key
        return runtime

    def prompt(self, runtime):
        calls = runtime.provider.generate_stream.call_args or runtime.provider.generate.call_args
        return "\n".join(m["content"] for m in calls.args[1])

    def outcomes(self, path):
        return [o for p, o in self.gateway.requests if p == path]

    def stored_rows(self):
        return [r for r in self.gateway.ledger.rows.values() if r[0] == "stored"]

    def assert_supabase_memory_untouched(self, *runtimes):
        for r in runtimes:
            r.db.remember.assert_not_awaited()
            r.db.get_relevant_memories.assert_not_awaited()
            self.assertEqual(r.db.memory_table_calls(), [])

    # -- acceptance ---------------------------------------------------------
    async def test_save_then_recall_in_a_later_request(self):
        save = self.runtime(ADA)
        reply = await save.respond(ADA_COMPANION, None, "Remember: " + FACT)
        self.assertEqual(reply.memory_status, "saved")
        self.assertTrue(reply.content.startswith("Saved to my long-term memories"))
        self.assertEqual(self.outcomes("/v1/host/remember"), ["stored"])
        self.assertEqual(len(self.stored_rows()), 1)
        self.assertEqual(save.db.messages[-1]["metadata"]["memory_status"], "saved")

        later = self.runtime(ADA, request_key="req-2")
        await later.respond(ADA_COMPANION, None, QUESTION)
        self.assertIn("named Pebble", self.prompt(later))
        self.assertEqual(self.outcomes("/v1/host/recall")[-1], "ok")
        self.assert_supabase_memory_untouched(save, later)

    async def test_streaming_turn_reports_the_same_outcome(self):
        events = []

        async def emit(event):
            events.append(event)
        reply = await self.runtime(ADA).respond(ADA_COMPANION, None, "Remember: " + FACT, emit=emit)
        self.assertEqual(reply.memory_status, "saved")
        self.assertIn("Checking memories…", [e.get("text") for e in events])
        self.assertNotIn("delta", [e["type"] for e in events])  # explicit command: one final content
        later = self.runtime(ADA, request_key="req-2")
        events.clear()
        await later.respond(ADA_COMPANION, None, QUESTION, emit=emit)
        self.assertIn("named Pebble", self.prompt(later))

    async def test_other_user_cannot_recall_and_cannot_use_foreign_companion(self):
        await self.runtime(ADA).respond(ADA_COMPANION, None, "Remember: " + FACT)
        ben = self.runtime(BEN, request_key="req-b")
        await ben.respond(BEN_COMPANION, None, QUESTION)
        self.assertNotIn("Pebble", self.prompt(ben))
        before = list(self.gateway.requests)
        with self.assertRaises(ValueError):          # RLS hides Ada's companion from Ben
            await self.runtime(BEN).respond(ADA_COMPANION, None, QUESTION)
        self.assertEqual(self.gateway.requests, before)

    async def test_adapter_refuses_a_companion_row_owned_by_someone_else(self):
        # Even if a Supabase policy bug returned Ada's companion to Ben.
        memory = LumenRmcMemory(self.settings, BEN)
        row = {"id": ADA_COMPANION, "owner_user_id": ADA}
        conversation = "00000000-0000-4000-8000-000000000001"
        self.assertEqual(await memory.remember(row, conversation, "k", FACT), "not_saved")
        self.assertEqual(await memory.relevant(row, conversation, QUESTION), ("denied", []))
        self.assertEqual(self.gateway.requests, [])

    async def test_gateway_binds_companion_to_first_owner(self):
        await self.runtime(ADA).respond(ADA_COMPANION, None, "Remember: " + FACT)
        client = rmc_client.RmcGatewayClient(rmc_client.load_config(self.settings))
        forged = await client.recall(user_id=BEN, companion_id=ADA_COMPANION,
                                     session_id="00000000-0000-4000-8000-0000000000b9",
                                     session_mode="normal", question=QUESTION)
        self.assertEqual(forged.outcome, "denied")

    async def test_wrong_key_stale_and_replayed_assertions_are_denied(self):
        wrong = rmc_client.RmcConfig(INSTALL, self.gateway.socket_path, b"x" * 64, 5)
        conversation = "00000000-0000-4000-8000-000000000001"
        args = dict(user_id=ADA, companion_id=ADA_COMPANION, session_id=conversation,
                    session_mode="normal", source_id="lumen-src-1",
                    timestamp="2026-11-02T08:00:00Z", text=FACT)
        self.assertEqual((await rmc_client.RmcGatewayClient(wrong).remember(**args)).outcome, "denied")
        stale = rmc_client.RmcGatewayClient(rmc_client.load_config(self.settings),
                                            clock=lambda: time.time() - 3600)
        self.assertEqual((await stale.remember(**args)).outcome, "denied")
        good = rmc_client.RmcGatewayClient(rmc_client.load_config(self.settings))
        fixed = good._assertion
        captured = {}

        def same_nonce(*a):
            value = captured.setdefault("a", fixed(*a))
            return dict(value)
        good._assertion = same_nonce
        self.assertEqual((await good.remember(**args)).outcome, "stored")
        self.assertEqual((await good.remember(**{**args, "source_id": "lumen-src-2"})).outcome, "denied")
        self.assertEqual(len(self.stored_rows()), 1)

    async def test_unauthenticated_route_never_reaches_rmc(self):
        from fastapi.testclient import TestClient
        from lumen.main import app
        app.dependency_overrides.clear()
        with TestClient(app) as http:
            for path in ("/v0.1/respond", "/v0.2/respond/stream"):
                status = http.post(path, json={"companion_id": ADA_COMPANION,
                                               "message": "Remember: " + FACT}).status_code
                self.assertEqual(status, 401)
            self.assertEqual(http.get("/v0.2/memory/backend").status_code, 401)
        self.assertEqual(self.gateway.requests, [])

    async def test_privacy_switches_deny_writes_and_reads(self):
        await self.runtime(ADA).respond(ADA_COMPANION, None, "Remember: " + FACT)
        self.gateway.host.set_learning(ADA, ADA_COMPANION, False)
        blocked = await self.runtime(ADA, request_key="req-2").respond(
            ADA_COMPANION, None, "Remember: Fictional Ada's tent is orange")
        self.assertEqual(blocked.memory_status, "memory_off")
        self.assertNotIn("Saved", blocked.content)
        self.assertIsNone(blocked.memory_subject)
        self.assertEqual(len(self.stored_rows()), 1)

        self.gateway.host.set_recall(ADA, ADA_COMPANION, False)
        recall = self.runtime(ADA, request_key="req-3")
        await recall.respond(ADA_COMPANION, None, QUESTION)
        self.assertNotIn("Pebble", self.prompt(recall))
        self.assertIn("could not be checked", self.prompt(recall))
        self.assertEqual(self.outcomes("/v1/host/recall")[-1], "privacy_denied")
        listing = await self.runtime(ADA, request_key="req-4").respond(
            ADA_COMPANION, None, "What do you remember about me?")
        self.assertIn("couldn't check my memories", listing.content)
        self.assertIn("turned off", listing.content)

    async def test_forgotten_source_blocks_reads_of_the_bank(self):
        await self.runtime(ADA).respond(ADA_COMPANION, None, "Remember: " + FACT)
        source = source_id_for(INSTALL, ADA, ADA_COMPANION, "req-1")
        self.gateway.host.forget_source(ADA, ADA_COMPANION, source)
        later = self.runtime(ADA, request_key="req-2")
        await later.respond(ADA_COMPANION, None, QUESTION)
        self.assertNotIn("Pebble", self.prompt(later))
        self.assertEqual(self.outcomes("/v1/host/recall")[-1], "privacy_denied")

    async def test_private_session_denies_write_and_read(self):
        client = rmc_client.RmcGatewayClient(rmc_client.load_config(self.settings))
        session = "00000000-0000-4000-8000-00000000f001"
        wrote = await client.remember(user_id=ADA, companion_id=ADA_COMPANION, session_id=session,
                                      session_mode="private", source_id="lumen-private-1",
                                      timestamp="2026-11-02T08:00:00Z", text=FACT)
        self.assertEqual(wrote.outcome, "privacy_denied")
        read = await client.recall(user_id=ADA, companion_id=ADA_COMPANION, session_id=session,
                                   session_mode="private", question=QUESTION)
        self.assertEqual(read.outcome, "privacy_denied")
        self.assertEqual(self.stored_rows(), [])

    async def test_retried_request_is_idempotent(self):
        first = await self.runtime(ADA, request_key="same").respond(ADA_COMPANION, None, "Remember: " + FACT)
        again = await self.runtime(ADA, request_key="same").respond(ADA_COMPANION, None, "Remember: " + FACT)
        self.assertEqual((first.memory_status, again.memory_status), ("saved", "existing"))
        self.assertEqual(self.gateway.backend.retain_calls, 1)
        self.assertEqual(len(self.stored_rows()), 1)

    async def test_backend_failures_are_never_reported_as_saved(self):
        # Hindsight stand-in down after the ledger claim: outcome unknown.
        self.gateway.backend.outage = True
        down = await self.runtime(ADA).respond(ADA_COMPANION, None, "Remember: " + FACT)
        self.assertEqual(down.memory_status, "unconfirmed")
        self.assertIn("couldn't confirm", down.content)
        self.assertNotIn("Saved", down.content)
        # Retrying the same request does not double-store or claim success.
        again = await self.runtime(ADA).respond(ADA_COMPANION, None, "Remember: " + FACT)
        self.assertEqual(again.memory_status, "unconfirmed")
        self.gateway.backend.outage = False

        # Lost reply after Hindsight stored it.
        self.gateway.backend.late_commit = True
        late = await self.runtime(ADA, request_key="req-late").respond(ADA_COMPANION, None, "Remember: a late fact")
        self.assertEqual(late.memory_status, "unconfirmed")
        self.gateway.backend.late_commit = False

        # Gateway answers 5xx.
        self.gateway.down = True
        failed = await self.runtime(ADA, request_key="req-503").respond(ADA_COMPANION, None, "Remember: x is y")
        self.assertEqual(failed.memory_status, "unconfirmed")
        self.gateway.down = False

        # Gateway not running at all: nothing was sent.
        self.gateway.stop()
        gone = await self.runtime(ADA, request_key="req-gone").respond(ADA_COMPANION, None, "Remember: " + FACT)
        self.assertEqual(gone.memory_status, "not_saved")
        self.assertIn("nothing was saved", gone.content)
        chat = self.runtime(ADA, request_key="req-chat")
        reply = await chat.respond(ADA_COMPANION, None, QUESTION)
        self.assertEqual(reply.content, "Here is my reply.")     # chat continues without memory
        self.assertIn("could not be checked", self.prompt(chat))
        self.assert_supabase_memory_untouched(chat)

    async def test_read_outage_degrades_to_chat_without_memory(self):
        await self.runtime(ADA).respond(ADA_COMPANION, None, "Remember: " + FACT)
        self.gateway.backend.outage = True
        chat = self.runtime(ADA, request_key="req-2")
        reply = await chat.respond(ADA_COMPANION, None, QUESTION)
        self.assertEqual(reply.content, "Here is my reply.")
        self.assertEqual(reply.memory_count, 0)
        self.assertNotIn("Pebble", self.prompt(chat))

    async def test_unsafe_configuration_fails_closed_without_contacting_rmc(self):
        os.chmod(self.key_file, 0o644)
        reply = await self.runtime(ADA).respond(ADA_COMPANION, None, "Remember: " + FACT)
        self.assertEqual(reply.memory_status, "not_saved")
        os.chmod(self.key_file, 0o600)
        for override in ({"rmc_gateway_socket": "relative.sock"}, {"rmc_installation_id": ""},
                         {"rmc_host_key_file": ""}, {"rmc_gateway_socket": "/nonexistent/rmc.sock"}):
            r = self.runtime(ADA, settings=self.make_settings(**override))
            self.assertEqual((await r.respond(ADA_COMPANION, None, "Remember: " + FACT)).memory_status,
                             "not_saved")
            r.db.remember.assert_not_awaited()
        short = os.path.join(self.root, "short.key")
        with open(short, "wb") as handle:
            handle.write(b"too-short")
        os.chmod(short, 0o600)
        with self.assertRaises(rmc_client.RmcConfigError):
            rmc_client.load_host_key(short)
        self.assertEqual(self.gateway.requests, [])

    async def test_supabase_only_paths_are_off_in_rmc_mode(self):
        from lumen.observations import observe
        from lumen.semantic_worker import queue_semantic_index
        background = Mock()
        self.assertFalse(queue_semantic_index(background, self.settings, "t", ADA_COMPANION))
        background.add_task.assert_not_called()
        with patch("lumen.observations._observe", new=AsyncMock()) as inner:
            await observe(self.settings, "t", "msg")
            inner.assert_not_awaited()
        with patch("lumen.runtime.natural_memory_update", new=AsyncMock(side_effect=AssertionError)), \
             patch("lumen.runtime.correct_memory", new=AsyncMock(side_effect=AssertionError)), \
             patch("lumen.runtime.memory_turn_context", new=AsyncMock(side_effect=AssertionError)):
            r = self.runtime(ADA)
            reply = await r.respond(ADA_COMPANION, None, "Actually, my favorite color is green, not blue.")
        self.assertIsNone(reply.observation_message_id)
        self.assert_supabase_memory_untouched(r)

    async def test_routes_in_rmc_mode_stream_and_nonstream(self):
        from fastapi.testclient import TestClient
        from lumen import main
        from lumen.auth import AuthUser, require_user
        main.app.dependency_overrides[require_user] = lambda: AuthUser(id=ADA, token="fictional-token")
        self.addCleanup(main.app.dependency_overrides.clear)
        runtimes = iter([self.runtime(ADA, request_key="r1"), self.runtime(ADA, request_key="r2"),
                         self.runtime(ADA, request_key="r3")])
        with patch.object(main, "settings", self.settings), \
             patch("lumen.main.CognitionRuntime", side_effect=lambda *a, **k: next(runtimes)), \
             patch("lumen.main.observe") as observe, patch("lumen.main.queue_semantic_index") as index, \
             TestClient(main.app) as http:
            self.assertEqual(http.get("/v0.2/memory/backend").json(), {"backend": "rmc"})
            plain = http.post("/v0.1/respond", json={"companion_id": ADA_COMPANION,
                                                     "message": "Remember: " + FACT}).json()
            self.assertEqual(plain["memory_status"], "saved")
            stream = http.post("/v0.2/respond/stream", json={"companion_id": ADA_COMPANION,
                                                             "message": QUESTION})
            events = [json.loads(line) for line in stream.text.splitlines()]
            self.assertEqual(events[-1]["type"], "done")
            self.assertEqual(events[-1]["response"]["content"], "Here is my reply.")
            self.assertEqual(http.post("/v0.2/memory-observations/retry").json(), {"queued": 0})
            observe.assert_not_called()
            index.assert_not_called()


class FeatureFlag(unittest.IsolatedAsyncioTestCase):
    def base(self, **values):
        return Settings(supabase_url="http://supabase.invalid", supabase_service_role_key="fictional", **values)

    def test_default_is_the_existing_supabase_backend(self):
        settings = self.base()
        self.assertEqual(memory_backend(settings), "supabase")
        self.assertTrue(supabase_memory_enabled(settings))
        self.assertIsNone(CognitionRuntime(settings, "t", ADA).rmc_memory)

    def test_unknown_backend_is_refused_not_guessed(self):
        with self.assertRaises(ValidationError):
            self.base(lumen_memory_backend="both")
        with self.assertRaises(ValidationError):
            self.base(lumen_memory_backend="RMC")

    async def test_rollback_to_supabase_uses_only_supabase(self):
        # RMC settings left in place; only the flag is flipped back.
        settings = self.base(lumen_memory_backend="supabase", rmc_installation_id=INSTALL,
                             rmc_gateway_socket="/nonexistent/rmc.sock", rmc_host_key_file="/nonexistent/key")
        runtime = CognitionRuntime(settings, "t", ADA)
        runtime.db = FakeSupabase(ADA)
        runtime.provider = Mock(generate=AsyncMock())
        runtime.provider.name = "ollama"
        with patch("lumen.rmc.client.RmcGatewayClient", side_effect=AssertionError("RMC contacted")):
            reply = await runtime.respond(ADA_COMPANION, None, "Remember: " + FACT)
        self.assertEqual(reply.memory_status, "saved")
        runtime.db.remember.assert_awaited_once()
        runtime.db.get_relevant_memories.assert_awaited_once()

    def test_semantic_and_observation_hooks_unchanged_in_supabase_mode(self):
        from lumen.semantic_worker import queue_semantic_index
        background = Mock()
        settings = self.base(semantic_memory_enabled=True, semantic_index_after_chat=True)
        self.assertTrue(queue_semantic_index(background, settings, "t", ADA_COMPANION))
        background.add_task.assert_called_once()


class ClientUnit(unittest.IsolatedAsyncioTestCase):
    """Response parsing does not need the RMC checkout."""

    def client(self, handler):
        import httpx
        config = rmc_client.RmcConfig(INSTALL, "/unused.sock", b"k" * 32, 5)
        return rmc_client.RmcGatewayClient(config, transport=httpx.MockTransport(handler))

    def args(self):
        return dict(user_id=ADA, companion_id=ADA_COMPANION, session_id="s-1", session_mode="normal",
                    source_id="lumen-1", timestamp="2026-11-02T08:00:00Z", text=FACT)

    async def test_unexpected_responses_are_uncertain_for_writes(self):
        import httpx
        cases = [httpx.Response(200, json={"outcome": "stored", "extra": 1}),
                 httpx.Response(200, json={"outcome": "STORED"}),
                 httpx.Response(200, content=b"not json"),
                 httpx.Response(500, json={"outcome": "stored"}),
                 httpx.Response(302, headers={"Location": "http://127.0.0.1:8888/"})]
        for response in cases:
            result = await self.client(lambda request, r=response: r).remember(**self.args())
            self.assertEqual(result.outcome, "uncertain")

        def timeout(request):
            raise httpx.ReadTimeout("slow", request=request)
        self.assertEqual((await self.client(timeout).remember(**self.args())).outcome, "uncertain")

        def refused(request):
            raise httpx.ConnectError("refused", request=request)
        self.assertEqual((await self.client(refused).remember(**self.args())).outcome, "unavailable")

    async def test_request_is_signed_and_carries_no_bearer_token(self):
        import httpx
        seen = {}

        def handler(request):
            seen["request"] = request
            return httpx.Response(200, json={"outcome": "stored"})
        await self.client(handler).remember(**self.args())
        request = seen["request"]
        self.assertNotIn("authorization", {k.lower() for k in request.headers})
        body = request.content
        self.assertEqual(request.headers[rmc_client.SIGNATURE_HEADER],
                         rmc_client.signature(b"k" * 32, rmc_client.REMEMBER_PATH, body))
        self.assertEqual(json.loads(body)["assertion"]["installation_id"], INSTALL)

    async def test_read_requires_exact_shape(self):
        import httpx
        for payload in ({"outcome": "ok"}, {"outcome": "ok", "context": []},
                        {"outcome": "denied", "context": {}}, {"outcome": "maybe"}):
            result = await self.client(lambda r, p=payload: httpx.Response(200, json=p)).recall(
                user_id=ADA, companion_id=ADA_COMPANION, session_id="s-1", session_mode="normal",
                question=QUESTION)
            self.assertEqual(result.outcome, "unavailable")

    def test_tcp_addresses_are_not_accepted(self):
        for socket in ("127.0.0.1:8888", "http://127.0.0.1:8888", "tcp://hindsight:8888"):
            settings = Settings(supabase_url="http://x", supabase_service_role_key="f",
                                lumen_memory_backend="rmc", rmc_installation_id=INSTALL,
                                rmc_gateway_socket=socket, rmc_host_key_file="/k")
            with self.assertRaises(rmc_client.RmcConfigError):
                rmc_client.load_config(settings)

    def test_group_writable_key_directory_is_refused(self):
        root = private_dir()
        self.addCleanup(shutil.rmtree, root, True)
        os.chmod(root, 0o770)
        path = os.path.join(root, "host.key")
        with open(path, "wb") as handle:
            handle.write(b"k" * 40)
        os.chmod(path, 0o600)
        with self.assertRaises(rmc_client.RmcConfigError) as caught:
            rmc_client.load_host_key(path)
        self.assertEqual(caught.exception.code, "RMC_HOST_KEY_DIR_UNSAFE")
        self.assertTrue(stat.S_IMODE(os.stat(path).st_mode) == 0o600)


class SocketValidation(unittest.IsolatedAsyncioTestCase):
    """Gateway socket checks: ownership, permissions, symlink safety."""

    def setUp(self):
        import socket as socketlib
        self.root = private_dir()
        self.addCleanup(shutil.rmtree, self.root, True)
        self.dir = private_dir(self.root)
        self.path = os.path.join(self.dir, "gateway.sock")
        self.listener = socketlib.socket(socketlib.AF_UNIX, socketlib.SOCK_STREAM)
        self.addCleanup(self.listener.close)
        self.listener.bind(self.path)
        os.chmod(self.path, 0o600)

    def code(self, path):
        try:
            rmc_client.validate_socket(path)
        except rmc_client.RmcConfigError as exc:
            return exc.code
        return "OK"

    def test_owner_only_socket_in_owner_only_dir_is_accepted(self):
        self.assertEqual(self.code(self.path), "OK")

    def test_symlinks_are_refused(self):
        link = os.path.join(self.dir, "link.sock")
        os.symlink(self.path, link)
        self.assertEqual(self.code(link), "RMC_GATEWAY_SOCKET_SYMLINK")
        linked_dir = os.path.join(self.root, "linked-dir")
        os.symlink(self.dir, linked_dir)
        self.assertEqual(self.code(os.path.join(linked_dir, "gateway.sock")), "RMC_GATEWAY_SOCKET_SYMLINK")
        self.assertEqual(self.code(self.dir + "/../" + os.path.basename(self.dir) + "/gateway.sock"),
                         "RMC_GATEWAY_SOCKET_PATH_INVALID")

    def test_permissions_are_enforced(self):
        for mode in (0o660, 0o606, 0o666, 0o777):
            os.chmod(self.path, mode)
            self.assertEqual(self.code(self.path), "RMC_GATEWAY_SOCKET_MODE_UNSAFE", oct(mode))
        os.chmod(self.path, 0o600)
        for mode in (0o750, 0o705, 0o755, 0o1777):
            os.chmod(self.dir, mode)
            self.assertEqual(self.code(self.path), "RMC_GATEWAY_SOCKET_DIR_UNSAFE", oct(mode))
        os.chmod(self.dir, 0o700)
        self.assertEqual(self.code(self.path), "OK")

    def test_wrong_kind_or_missing_is_refused(self):
        regular = os.path.join(self.dir, "plain")
        with open(regular, "w") as handle:
            handle.write("x")
        os.chmod(regular, 0o600)
        self.assertEqual(self.code(regular), "RMC_GATEWAY_SOCKET_NOT_SOCKET")
        self.assertEqual(self.code(os.path.join(self.dir, "absent.sock")), "RMC_GATEWAY_SOCKET_MISSING")
        self.assertEqual(self.code("relative.sock"), "RMC_GATEWAY_SOCKET_PATH_INVALID")

    def test_foreign_owner_is_refused(self):
        if os.geteuid() != 0:
            self.skipTest("changing ownership needs root")
        os.chown(self.path, 65534, 65534)
        self.assertEqual(self.code(self.path), "RMC_GATEWAY_SOCKET_OWNER_MISMATCH")
        os.chown(self.path, 0, 0)
        os.chown(self.dir, 65534, 65534)
        self.assertEqual(self.code(self.path), "RMC_GATEWAY_SOCKET_DIR_UNSAFE")

    async def test_client_sends_nothing_to_an_unsafe_socket(self):
        link = os.path.join(self.dir, "link.sock")
        os.symlink(self.path, link)
        client = rmc_client.RmcGatewayClient(rmc_client.RmcConfig(INSTALL, link, b"k" * 32, 2))
        result = await client.remember(user_id=ADA, companion_id=ADA_COMPANION, session_id="s-1",
                                       session_mode="normal", source_id="lumen-1",
                                       timestamp="2026-11-02T08:00:00Z", text=FACT)
        self.assertEqual(result.outcome, "unavailable")
        self.assertEqual(client.last_socket_error, "RMC_GATEWAY_SOCKET_SYMLINK")
        self.listener.settimeout(0.2)
        self.listener.listen(1)
        import socket as socketlib
        with self.assertRaises(socketlib.timeout):
            self.listener.accept()  # nothing connected

    def test_symlinked_host_key_is_refused(self):
        key = os.path.join(self.dir, "host.key")
        with open(key, "wb") as handle:
            handle.write(b"k" * 40)
        os.chmod(key, 0o600)
        link = os.path.join(self.dir, "key-link")
        os.symlink(key, link)
        with self.assertRaises(rmc_client.RmcConfigError) as caught:
            rmc_client.load_host_key(link)
        self.assertEqual(caught.exception.code, "RMC_HOST_KEY_SYMLINK")
        self.assertEqual(rmc_client.load_host_key(key), b"k" * 40)


if __name__ == "__main__":
    unittest.main()

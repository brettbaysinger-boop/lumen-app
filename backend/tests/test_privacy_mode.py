"""Public / Private mode (Issue #39): private data must not reach the model, the reply, the
stream or the voice in Public mode. All data is fictional and synthetic.

A fake Supabase (httpx MockTransport) holds one secret in every private place: memories, profile,
an earlier Private-mode message, a chat handoff, companion state, My Day, documents and search RPCs.
A fake model records every message it is sent. Each test then looks for the secret everywhere.
"""
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from urllib.parse import urlsplit, parse_qs

import httpx
from fastapi import HTTPException
from pydantic import ValidationError

from lumen import privacy_mode as pm
from lumen.runtime import CognitionRuntime
from lumen.schemas import ImageGenerateRequest, RespondRequest

USER_ID = "44444444-4444-4444-4444-444444444444"
COMPANION_ID = "11111111-1111-1111-1111-111111111111"
CONVERSATION_ID = "22222222-2222-2222-2222-222222222222"

# Fictional secrets. Each is unique so a leak can be traced to its source.
SECRETS = {
    "memory": "vintage brass telescope",
    "profile": "Brettonius Quillfeather",
    "private_message": "hidden under the attic stairs",
    "handoff": "Sam's 40th at Juniper Hall",
    "state": "wrap the surprise before Friday",
    "my_day": "collect the engraved compass",
    "document": "lease renewal clause 14b",
    "search": "pharmacy refill for Ortavex",
    "companion_description": "knows Brett's divorce papers",
    "companion_persona": "teases Brett about the Lisbon apartment",
    "companion_system_prompt": "Brett's therapist is Dr. Vell",
    "companion_visual": "wears the Quillfeather family locket",
}


def settings():
    return SimpleNamespace(supabase_url="http://supabase.test", supabase_service_role_key="service",
                           ollama_url="http://ollama.test", conversation_model="test-model",
                           memory_observations_enabled=True, lumen_memory_backend="supabase")


class FakeSupabase:
    def __init__(self):
        self.requests = []
        self.messages = [
            {"id": "m-private", "role": "user", "created_at": "2026-11-15T10:00:00Z", "metadata": {},
             "content": f"The gift is {SECRETS['private_message']}."},
            {"id": "m-public", "role": "assistant", "created_at": "2026-11-15T11:00:00Z",
             "metadata": {"privacy_mode": "public"}, "content": "Happy to chat about the weather."},
        ]
        self.next_id = 0

    def rows(self, table):
        return {
            "companions": [{"id": COMPANION_ID, "name": "Lumen", "pronouns": "she/her",
                            "persona": f"Warm, playful and curious; {SECRETS['companion_persona']}.",
                            "description": f"A companion who {SECRETS['companion_description']}.",
                            "system_prompt": f"Remember: {SECRETS['companion_system_prompt']}.",
                            "visual_identity": f"silver hair, {SECRETS['companion_visual']}"}],
            "companion_state": [{"companion_id": COMPANION_ID, "current_goal": SECRETS["state"],
                                 "current_context": SECRETS["state"]}],
            "conversations": [{"id": CONVERSATION_ID, "companion_id": COMPANION_ID, "title": "Chat",
                               "message_count": 2, "goal_item_id": None,
                               "handoff": {"summary": f"Planning {SECRETS['handoff']}."}}],
            "profiles": [{"id": USER_ID, "display_name": SECRETS["profile"]}],
            "memories": [{"id": "mem1", "type": "semantic", "subject": "user", "is_active": True,
                          "importance": 0.9, "updated_at": "2026-11-15T09:00:00Z",
                          "content": f"Surprise gift for Sam is a {SECRETS['memory']}"}],
            "my_day_items": [{"id": "d1", "kind": "reminder", "title": SECRETS["my_day"], "status": "open",
                              "due_at": None, "checklist": [], "done": False}],
            "documents": [{"id": "doc1", "title": SECRETS["document"]}],
            "rpc/search_my_information": [{"id": "s1", "kind": "note", "content": SECRETS["search"]}],
        }.get(table, [{"secret": SECRETS["document"]}])

    def handler(self, request: httpx.Request):
        table = urlsplit(str(request.url)).path.split("/rest/v1/", 1)[1]
        body = json.loads(request.content) if request.content else None
        self.requests.append((request.method, table, body))
        if request.method == "POST" and table == "messages":
            self.next_id += 1
            row = {"id": f"new-{self.next_id}", **body}
            self.messages.insert(0, row)
            return httpx.Response(200, json=[row])
        if request.method == "POST" and table == "conversations":
            return httpx.Response(200, json=[{"id": "33333333-3333-3333-3333-333333333333", **body,
                                              "handoff": {"summary": SECRETS["handoff"]}}])
        if request.method == "PATCH":
            return httpx.Response(200, json=[])
        if request.method == "GET" and table == "messages":
            query = parse_qs(urlsplit(str(request.url)).query)
            if "id" in query:
                wanted = query["id"][0].removeprefix("eq.")
                return httpx.Response(200, json=[m for m in self.messages if m["id"] == wanted])
            return httpx.Response(200, json=self.messages)
        return httpx.Response(200, json=self.rows(table))


class FakeModel:
    name = "ollama"
    base_url = "http://ollama.test"

    def __init__(self, reply="Sounds lovely! Tell me more."):
        self.reply = reply
        self.calls = []
        self.effort = "default"

    def _result(self):
        return {"content": self.reply, "model": "test-model", "latency_ms": 1, "tokens_in": 1, "tokens_out": 1}

    async def generate(self, model, messages, *a, **k):
        self.calls.append(messages)
        return self._result()

    async def generate_stream(self, model, messages, emit, *a, **k):
        self.calls.append(messages)
        await emit({"type": "delta", "text": self.reply})
        return self._result()

    async def structured(self, model, messages, *a, **k):
        self.calls.append(messages)
        return {}

    async def supports_vision(self, model):
        return True


def leaks(*values) -> list[str]:
    blob = json.dumps(values, default=str)
    return [name for name, secret in SECRETS.items() if secret in blob]


class PrivacyModeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.supabase = FakeSupabase()
        original = httpx.AsyncClient
        self.patch = patch("lumen.db.httpx.AsyncClient",
                           side_effect=lambda **kw: original(transport=httpx.MockTransport(self.supabase.handler), **kw))
        self.patch.start()
        self.events = []

    async def asyncTearDown(self):
        self.patch.stop()

    async def emit(self, event):
        self.events.append(event)

    async def turn(self, mode, message, *, model_reply="Sounds lovely! Tell me more.", conversation_id=CONVERSATION_ID,
                   document_id=None):
        runtime = pm.runtime_for(mode)(settings(), "user-token", USER_ID)
        runtime.provider = FakeModel(model_reply)
        runtime.request_key = "req-1"
        response = await runtime.respond(COMPANION_ID, conversation_id, message, emit=self.emit,
                                         document_id=document_id)
        return runtime, response

    def written(self):
        return [body for method, table, body in self.supabase.requests if method in ("POST", "PATCH")]

    # --- Control: Private mode is the existing behaviour --------------------------------------
    async def test_private_mode_is_unchanged_and_still_sees_private_context(self):
        self.assertIs(pm.runtime_for("private"), CognitionRuntime)
        runtime, _ = await self.turn("private", "How are you today?")
        sent = runtime.provider.calls[0]
        self.assertIn(SECRETS["memory"], json.dumps(sent))         # proves the fixture is real
        self.assertIn(SECRETS["profile"], json.dumps(sent))
        self.assertIn(SECRETS["private_message"], json.dumps(sent))
        for field in ("companion_description", "companion_persona", "companion_system_prompt", "companion_visual"):
            self.assertIn(SECRETS[field], json.dumps(sent), field)      # Private keeps the owner's own companion

    # --- Public mode: ordinary chat stays natural, nothing private reaches the model ---------
    async def test_public_ordinary_chat_reaches_the_model_without_private_context(self):
        runtime, response = await self.turn("public", "What a rainy evening. Any cozy ideas?")
        self.assertEqual(len(runtime.provider.calls), 1)
        sent = runtime.provider.calls[0]
        self.assertEqual(leaks(sent), [])
        self.assertIn(pm.PUBLIC_PERSONA, sent[0]["content"])            # a personality, not a blank
        self.assertIn("You are Lumen", sent[0]["content"])
        self.assertIn("she/her", sent[0]["content"])
        self.assertIn("Public mode (people may be nearby)", sent[0]["content"])
        self.assertEqual(response.content, "Sounds lovely! Tell me more.")
        self.assertEqual(leaks(self.events, response.model_dump(), self.written()), [])

    async def test_public_mode_denies_private_tables_before_any_request_is_made(self):
        await self.turn("public", "Tell me something fun.")
        touched = {(method, table) for method, table, _ in self.supabase.requests}
        for method, table in touched:
            self.assertTrue(pm.public_access_allowed(method, table), f"{method} {table}")
        for table in ("memories", "profiles", "my_day_items", "documents", "memory_observations"):
            self.assertNotIn(table, {t for _, t in touched})

    async def test_public_turn_writes_no_memory_or_observation_and_tags_messages(self):
        await self.turn("public", "Hello there!")
        tables = [(method, table) for method, table, _ in self.supabase.requests if method == "POST"]
        self.assertEqual({t for _, t in tables}, {"messages"})
        for method, table, body in self.supabase.requests:
            if method == "POST" and table == "messages":
                self.assertEqual(body["metadata"]["privacy_mode"], "public")

    # --- Owner acceptance examples -------------------------------------------------------------
    async def test_public_secret_gift_question_is_discreet(self):
        for question in ("What's the surprise gift I discussed privately?",
                         "Lumen, what do you remember about me?",
                         "What have you saved about me?"):
            self.events.clear()
            runtime, response = await self.turn("public", question,
                                                model_reply="I'd rather keep that between us for now.")
            self.assertEqual(leaks(runtime.provider.calls, response.model_dump(), self.events, self.written()), [],
                             question)

    async def test_public_private_commands_get_a_discreet_reply_without_the_model(self):
        cases = {
            "Search my documents: lease": "documents",
            "Remember that the surprise is a telescope": "memory_save",
            "What's on my plate today?": "my_day",
            "Search my history: gift": "my_day",
        }
        for message, kind in cases.items():
            self.events.clear()
            runtime, response = await self.turn("public", message)
            self.assertEqual(runtime.provider.calls, [], message)
            self.assertEqual(response.model, "public-mode-discretion", message)
            self.assertEqual(response.content, pm.DISCREET_REPLIES[kind], message)
            self.assertEqual(leaks(response.model_dump(), self.events), [], message)
        self.assertNotIn("memories", {t for _, t, _ in self.supabase.requests})
        self.assertNotIn("rpc/search_my_information", {t for _, t, _ in self.supabase.requests})

    async def test_public_selected_document_is_never_opened(self):
        runtime, response = await self.turn("public", "Explain this document in plain language.",
                                            document_id="55555555-5555-5555-5555-555555555555")
        self.assertEqual(response.content, pm.DISCREET_REPLIES["documents"])
        self.assertNotIn("documents", {t for _, t, _ in self.supabase.requests})

    async def test_data_layer_denial_is_the_backstop_when_routing_misses(self):
        # Pretend the router missed a private request: the repository still refuses the read.
        with patch.object(pm, "private_request_kind", return_value=None):
            runtime, response = await self.turn("public", "Search my history: gift")
        self.assertEqual(response.content, pm.DISCREET_REPLIES["private_data"])
        self.assertIn("POST rpc/search_my_information", runtime.db.denied)
        self.assertEqual(leaks(response.model_dump(), self.events, runtime.provider.calls), [])

    async def test_public_new_conversation_drops_handoff_and_works(self):
        runtime, response = await self.turn("public", "Hi!", conversation_id=None)
        self.assertEqual(leaks(runtime.provider.calls, response.model_dump()), [])

    async def test_switching_back_to_private_restores_normal_behaviour(self):
        await self.turn("public", "Hi!")
        runtime, _ = await self.turn("private", "Hi again!")
        self.assertIn(SECRETS["memory"], json.dumps(runtime.provider.calls[0]))

    async def test_public_companion_images_are_not_uploaded(self):
        reply = ('Here you go. <lumen_image_action>{"action":"generate_image","action_input":"me","subject":"self"}'
                 '</lumen_image_action>')
        async def fake_image(settings_, db, *a, **k):
            await db.upload_storage("chat-media", "x.png", b"", "image/png")
        with patch("lumen.runtime.create_companion_image", side_effect=fake_image):
            runtime, response = await self.turn("public", "Show me a picture of you", model_reply=reply)
        self.assertIn("storage chat-media", runtime.db.denied)
        self.assertNotIn("lumen_image_action", response.content)

    # --- Mode contract ---------------------------------------------------------------------------
    def test_unknown_mode_is_rejected_not_treated_as_private(self):
        base = {"companion_id": COMPANION_ID, "message": "hi"}
        self.assertEqual(RespondRequest(**base).privacy_mode, "private")   # older clients
        self.assertEqual(RespondRequest(**base, privacy_mode="public").privacy_mode, "public")
        for value in ("PUBLIC", "company", "", None, 1):
            with self.assertRaises(ValidationError):
                RespondRequest(**base, privacy_mode=value)
        with self.assertRaises(ValueError):
            pm.runtime_for("company")
        with self.assertRaises(ValidationError):
            ImageGenerateRequest(companion_id=COMPANION_ID, prompt="cat", privacy_mode="unknown")

    # --- TTS -------------------------------------------------------------------------------------
    async def test_public_speech_only_reads_public_replies(self):
        from lumen.db import SupabaseRepository
        db = SupabaseRepository(settings(), "user-token")
        self.supabase.messages.append({"id": "m-private-reply", "role": "assistant", "metadata": {},
                                       "content": f"It's a {SECRETS['memory']}."})
        allowed = pm.public_speech_allowed
        self.assertTrue(await allowed(db, "m-public", "Happy to chat about the weather."))
        self.assertTrue(await allowed(db, "m-public", "Happy to chat"))                # one chunk of it
        self.assertFalse(await allowed(db, "m-private-reply", f"It's a {SECRETS['memory']}."))
        self.assertFalse(await allowed(db, "m-public", SECRETS["memory"]))             # text not in that reply
        self.assertFalse(await allowed(db, None, "Happy to chat"))
        self.assertFalse(await allowed(db, "m-private", SECRETS["private_message"]))     # user row, private
        self.assertFalse(await allowed(db, "missing", "anything"))

    async def test_speak_endpoint_refuses_private_text_in_public_mode(self):
        from lumen import voice
        request = voice.SpeechRequest(text=f"It's a {SECRETS['memory']}.", privacy_mode="public")
        with patch.object(voice, "speech_settings", return_value=SimpleNamespace(
                speech_voice="v", speech_url="http://helios.test", speech_model="m", **vars(settings()))), \
             patch("lumen.voice.get_settings", return_value=settings()):
            with self.assertRaises(HTTPException) as caught:
                await voice.speak(request, SimpleNamespace(id=USER_ID, token="user-token"))
        self.assertEqual(caught.exception.status_code, 403)


class PrivacyModeRouteTests(unittest.TestCase):
    """The real FastAPI routes, signed in as the owner, against the same fake Supabase and model."""

    def setUp(self):
        from fastapi.testclient import TestClient
        from lumen.auth import AuthUser, require_user
        from lumen.main import app
        self.app = app
        app.dependency_overrides[require_user] = lambda: AuthUser(id=USER_ID, token="user-token")
        self.supabase = FakeSupabase()
        original = httpx.AsyncClient
        self.patches = [patch("lumen.db.httpx.AsyncClient",
                              side_effect=lambda **kw: original(transport=httpx.MockTransport(self.supabase.handler), **kw))]
        self.model = FakeModel()

        def public_runtime(*args):
            runtime = pm.PublicCognitionRuntime(settings(), "user-token", USER_ID)
            runtime.provider = self.model
            return runtime
        self.patches.append(patch("lumen.main.PublicCognitionRuntime", side_effect=public_runtime))
        for item in self.patches:
            item.start()
        self.client = TestClient(app)

    def tearDown(self):
        for item in self.patches:
            item.stop()
        self.app.dependency_overrides.clear()

    def test_unknown_mode_is_refused_by_both_chat_routes(self):
        for path in ("/v0.1/respond", "/v0.2/respond/stream"):
            result = self.client.post(path, json={"companion_id": COMPANION_ID, "message": "hi",
                                                  "privacy_mode": "company"})
            self.assertEqual(result.status_code, 422, path)

    def test_public_stream_route_never_carries_private_data(self):
        for message in ("What's the surprise gift I discussed privately?", "Nice weather today!",
                        "What's on my plate today?", "Search my documents: lease"):
            result = self.client.post("/v0.2/respond/stream", json={
                "companion_id": COMPANION_ID, "conversation_id": CONVERSATION_ID, "message": message,
                "privacy_mode": "public"})
            self.assertEqual(result.status_code, 200)
            events = [json.loads(line) for line in result.text.splitlines()]
            self.assertEqual(events[-1]["type"], "done", message)
            self.assertEqual(leaks(result.text), [], message)
        self.assertEqual(leaks(self.model.calls), [])
        self.assertTrue(self.model.calls)          # ordinary chat still reached the model

    def test_public_blocking_route_never_carries_private_data(self):
        result = self.client.post("/v0.1/respond", json={
            "companion_id": COMPANION_ID, "conversation_id": CONVERSATION_ID,
            "message": "Lumen, what do you remember about me?", "privacy_mode": "public"})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["content"], pm.DISCREET_REPLIES["memory_recall"])
        self.assertEqual(leaks(result.text), [])

    def test_public_image_route_is_paused(self):
        result = self.client.post("/v0.2/images/generate", json={
            "companion_id": COMPANION_ID, "prompt": "a portrait of you", "privacy_mode": "public"})
        self.assertEqual(result.status_code, 403)
        self.assertEqual(self.supabase.requests, [])

    def test_public_speech_route_needs_a_public_reply(self):
        from lumen import voice
        speech = SimpleNamespace(speech_voice="v", speech_url="http://helios.test", speech_model="m", **vars(settings()))
        with patch.object(voice, "speech_settings", return_value=speech), \
             patch("lumen.voice.get_settings", return_value=settings()):
            denied = self.client.post("/v0.1/voice/speak", json={"text": SECRETS["memory"], "privacy_mode": "public"})
            self.assertEqual(denied.status_code, 403)
            denied = self.client.post("/v0.1/voice/speak", json={
                "text": SECRETS["private_message"], "privacy_mode": "public",
                "message_id": "00000000-0000-0000-0000-000000000000"})
            self.assertEqual(denied.status_code, 403)
        # Refused before Helios: the fake Supabase saw one message lookup and nothing else.
        self.assertEqual([(m, t) for m, t, _ in self.supabase.requests], [("GET", "messages")])

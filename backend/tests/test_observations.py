import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from lumen.observations import observe, Candidates

class ObservationTests(unittest.IsolatedAsyncioTestCase):
    def setup_worker(self, output):
        self.settings = SimpleNamespace(memory_observation_model="", conversation_model="installed-model")
        self.calls = []
        async def request(method, table, **kwargs):
            self.calls.append((method, table, kwargs))
            if table == "rpc/claim_memory_observation": return True
            if table == "messages": return [{"role":"user", "content":"Summer is my favorite season.", "companion_id":"c"}]
            return []
        self.db = SimpleNamespace(_request=AsyncMock(side_effect=request), get_companion=AsyncMock(return_value={"name":"Nova"}))
        self.provider = SimpleNamespace(structured=AsyncMock(return_value=output))

    async def run_worker(self):
        with patch("lumen.observations.SupabaseRepository", return_value=self.db), patch("lumen.observations.OllamaProvider", return_value=self.provider):
            await observe(self.settings, "user-bearer", "source")

    async def test_natural_statement_uses_local_model_and_source_evidence(self):
        self.setup_worker('{"candidates":[{"content":"The user prefers summer.","evidence":"Summer is my favorite season.","subject":"user","type":"preference"}]}')
        await self.run_worker()
        self.assertEqual(self.provider.structured.call_args.args[0], "installed-model")
        proposals = [c for c in self.calls if c[1] == "rpc/propose_memory"]
        self.assertEqual(len(proposals), 1)
        self.assertEqual(proposals[0][2]["json"]["p_message"], "source")
        self.assertFalse(any(c[0] != "GET" and c[1] == "memories" for c in self.calls))
        self.assertEqual(self.calls[-1][2]["json"]["status"], "done")

    async def test_clear_fact_is_saved_via_owner_rpc_using_selected_chat_model(self):
        import json
        self.setup_worker(json.dumps({"candidates":[{
            "content":"The user prefers summer.","evidence":"Summer is my favorite season.",
            "subject":"user","type":"preference","direct_assertion":True,
            "sensitive":False,"conflicting":False,"topic":"preferred_season"}]}))
        self.db.get_companion.return_value={"name":"Nova","conversation_model":"selected-chat"}
        original = self.db._request.side_effect
        async def request(method, table, **kwargs):
            result = await original(method, table, **kwargs)
            return "suggestion-id" if table == "rpc/propose_memory" else result
        self.db._request.side_effect = request
        await self.run_worker()
        self.assertEqual(self.provider.structured.call_args.args[0], "selected-chat")
        writes=[c for c in self.calls if c[1] == "rpc/auto_save_memory_suggestion"]
        self.assertEqual(writes[0][2]["json"], {"p_id":"suggestion-id", "p_topic":"preferred_season"})

    async def test_invented_evidence_never_proposed(self):
        self.setup_worker('{"candidates":[{"content":"User loves winter.","evidence":"winter","subject":"user","type":"preference"}]}')
        await self.run_worker()
        self.assertFalse(any(c[1] == "rpc/propose_memory" for c in self.calls))

    async def test_wrapped_evidence_recovers_only_verbatim_source_fact(self):
        import json
        self.setup_worker(json.dumps({"candidates":[{
            "content":"Summer is my favorite season.",
            "evidence":"The user stated 'Summer is my favorite season.'.",
            "subject":"user", "type":"preference"}]}))
        await self.run_worker()
        proposals = [c for c in self.calls if c[1] == "rpc/propose_memory"]
        self.assertEqual(len(proposals), 1)
        self.assertEqual(proposals[0][2]["json"]["p_evidence"], "Summer is my favorite season.")
        self.assertEqual(self.calls[-1][2]["json"]["status"], "done")

    async def test_unverified_paraphrase_fails_for_retry_without_save(self):
        import json
        self.setup_worker(json.dumps({"candidates":[{
            "content":"The user prefers winter.",
            "evidence":"The user stated that winter is their favorite season.",
            "subject":"user", "type":"preference"}]}))
        await self.run_worker()
        self.assertFalse(any(c[1] == "rpc/propose_memory" for c in self.calls))
        self.assertEqual(self.calls[-1][2]["json"]["status"], "failed")

    async def test_invalid_json_failure_is_retryable(self):
        self.setup_worker('not json')
        await self.run_worker()
        self.assertEqual(self.calls[-1][2]["json"]["status"], "failed")

    async def test_empty_result_and_already_claimed_job(self):
        self.setup_worker('{"candidates":[]}')
        await self.run_worker()
        self.assertFalse(any(c[1] == "rpc/propose_memory" for c in self.calls))
        self.db._request = AsyncMock(return_value=False)
        self.provider.structured.reset_mock()
        await self.run_worker()
        self.provider.structured.assert_not_called()

    def test_schema_rejects_unbounded_or_invalid_subjects(self):
        with self.assertRaises(ValueError):
            Candidates.model_validate({"candidates":[{"content":"x","evidence":"x","subject":"everyone","type":"semantic"}]})

    async def test_transport_timeout_is_retryable(self):
        self.setup_worker('{"candidates":[]}')
        self.provider.structured.side_effect = TimeoutError()
        await self.run_worker()
        self.assertEqual(self.calls[-1][2]["json"]["status"], "failed")

    async def test_structured_request_uses_schema_and_bounded_generation(self):
        import httpx
        from lumen.ollama import OllamaProvider
        settings = SimpleNamespace(ollama_url="http://local-ollama")
        def handler(request):
            import json
            payload = json.loads(request.content)
            self.assertEqual(payload["format"], Candidates.model_json_schema())
            self.assertEqual(payload["options"], {"temperature":0,"num_predict":1000,"num_ctx":8192})
            self.assertFalse(payload["stream"])
            return httpx.Response(200,json={"message":{"content":'{"candidates":[]}'}})
        original = httpx.AsyncClient
        with patch("lumen.ollama.httpx.AsyncClient", side_effect=lambda **kwargs: original(transport=httpx.MockTransport(handler),**kwargs)):
            result = await OllamaProvider(settings).structured("local", [], Candidates.model_json_schema())
        self.assertEqual(result, '{"candidates":[]}')

class ObservationRouteTests(unittest.TestCase):
    def test_authenticated_scheduling_and_anonymous_denial(self):
        from importlib import import_module
        from fastapi.testclient import TestClient
        from lumen.auth import AuthUser, require_user
        from lumen.config import Settings
        from lumen.schemas import RespondResponse
        settings = Settings(supabase_url='http://local-db',supabase_service_role_key='server-key')
        with patch('lumen.config.get_settings',return_value=settings):
            main = import_module('lumen.main')
        main.app.dependency_overrides.clear()
        try:
            with TestClient(main.app) as client, patch('lumen.main.SupabaseRepository') as repository:
                self.assertEqual(client.post('/v0.2/memory-observations/retry').status_code,401)
                repository.assert_not_called()
            main.app.dependency_overrides[require_user] = lambda: AuthUser(id='verified',token='user-token')
            reply = RespondResponse(conversation_id='chat',message_id='assistant',content='Hello',
                model='local',provider='ollama',latency_ms=1,memory_count=0,observation_message_id='source')
            runtime = SimpleNamespace(respond=AsyncMock(return_value=reply))
            with TestClient(main.app) as client, patch('lumen.main.CognitionRuntime',return_value=runtime), patch('lumen.main.observe',new_callable=AsyncMock) as worker:
                response = client.post('/v0.1/respond',json={'companion_id':'c','message':'I like summer.'})
                self.assertEqual(response.status_code,200)
                worker.assert_awaited_once_with(main.settings,'user-token','source')
            repo = SimpleNamespace(_request=AsyncMock(return_value=[{'source_message_id':'source'}]))
            with TestClient(main.app) as client, patch('lumen.main.SupabaseRepository',return_value=repo) as repository, patch('lumen.main.observe',new_callable=AsyncMock) as worker:
                self.assertEqual(client.post('/v0.2/memory-observations/retry').json(),{'queued':1})
                repository.assert_called_once_with(main.settings,'user-token')
                worker.assert_awaited_once()
        finally:
            main.app.dependency_overrides.clear()

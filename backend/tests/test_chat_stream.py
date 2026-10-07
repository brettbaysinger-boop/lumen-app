import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch
import httpx
from lumen.ollama import OllamaProvider
from lumen.observations import Candidate, automatic_candidate

class StreamingTests(unittest.IsolatedAsyncioTestCase):
    async def test_incremental_reply_and_timings(self):
        events = []
        async def emit(event): events.append(event)
        def handler(request):
            payload = json.loads(request.content)
            self.assertEqual(payload['options']['num_ctx'], 8192)
            self.assertEqual(payload['options']['num_predict'], 8192)
            self.assertTrue(payload['stream'])
            self.assertEqual(payload['keep_alive'], '15m')
            return httpx.Response(200, text='\n'.join(json.dumps(x) for x in [
                {'message': {'content': 'Hello ', 'thinking': 'private'}},
                {'message': {'content': 'there'}},
                {'done': True, 'model': 'local', 'load_duration': 2000000,
                 'prompt_eval_duration': 3000000, 'eval_duration': 4000000}]))
        original = httpx.AsyncClient
        with patch('lumen.ollama.httpx.AsyncClient', side_effect=lambda **kw: original(transport=httpx.MockTransport(handler), **kw)):
            result = await OllamaProvider(SimpleNamespace(ollama_url='http://local')).generate_stream('local', [], emit)
        self.assertEqual(result['content'], 'Hello there')
        self.assertEqual(result['timings_ms']['load_duration'], 2)
        self.assertEqual(events, [{'type':'delta','text':'Hello '}, {'type':'delta','text':'there'}])

    async def test_incomplete_stream_cannot_be_success(self):
        original = httpx.AsyncClient
        async def emit(event): pass
        with patch('lumen.ollama.httpx.AsyncClient', side_effect=lambda **kw: original(transport=httpx.MockTransport(lambda r: httpx.Response(200, text='{"message":{"content":"partial"}}')), **kw)):
            with self.assertRaises(RuntimeError):
                await OllamaProvider(SimpleNamespace(ollama_url='http://local')).generate_stream('local', [], emit)

class AutoMemorySafety(unittest.TestCase):
    def candidate(self, **kw):
        return Candidate(content='The user likes turquoise.', evidence='My favorite color is turquoise.',
            subject='user', type='preference', direct_assertion=True, sensitive=False,
            conflicting=False, topic='favorite_color', **kw)

    def test_direct_fact_and_fail_closed_classification(self):
        c = self.candidate()
        self.assertTrue(automatic_candidate(c, c.evidence))
        for change in ({'sensitive':True}, {'conflicting':True}, {'direct_assertion':False}, {'subject':'unknown'}, {'topic':''}):
            altered = c.model_copy(update=change)
            self.assertFalse(automatic_candidate(altered, altered.evidence))
        for evidence in ('If my favorite color were blue', 'Is my favorite color blue?',
                         'My password is turquoise', 'My diagnosis is depression', 'Her favorite color is blue'):
            self.assertFalse(automatic_candidate(c, evidence))

class StreamRouteTests(unittest.TestCase):
    def test_auth_ownership_completion_and_error(self):
        from fastapi.testclient import TestClient
        from lumen.main import app
        from lumen.auth import AuthUser, require_user
        from lumen.schemas import RespondResponse
        from unittest.mock import AsyncMock
        app.dependency_overrides.clear()
        try:
            with TestClient(app) as client:
                self.assertEqual(client.post('/v0.2/respond/stream',json={'companion_id':'c','message':'hello'}).status_code,401)
            app.dependency_overrides[require_user] = lambda: AuthUser(id='owner',token='bearer')
            runtime = SimpleNamespace(db=SimpleNamespace(get_companion=AsyncMock(return_value=None)))
            with TestClient(app) as client, patch('lumen.main.CognitionRuntime',return_value=runtime):
                self.assertEqual(client.post('/v0.2/respond/stream',json={'companion_id':'c','message':'hello'}).status_code,404)
            runtime.db.get_companion.return_value={'id':'c'}
            async def reply(*args, emit, document_id=None):
                await emit({'type':'delta','text':'Hello'})
                return RespondResponse(conversation_id='chat',message_id='m',content='Hello',model='local',provider='ollama',latency_ms=1,memory_count=0)
            runtime.respond=reply
            with TestClient(app) as client, patch('lumen.main.CognitionRuntime',return_value=runtime):
                result=client.post('/v0.2/respond/stream',json={'companion_id':'c','message':'hello'})
                events=[json.loads(line) for line in result.text.splitlines()]
                self.assertEqual(events[-1]['type'],'done')
                self.assertEqual(events[-1]['response']['content'],'Hello')
            runtime.respond=AsyncMock(side_effect=RuntimeError('secret'))
            with TestClient(app) as client, patch('lumen.main.CognitionRuntime',return_value=runtime):
                result=client.post('/v0.2/respond/stream',json={'companion_id':'c','message':'hello'})
                self.assertEqual(json.loads(result.text.splitlines()[-1])['type'],'error')
                self.assertNotIn('secret',result.text)
        finally:
            app.dependency_overrides.clear()

class SchedulingTests(unittest.IsolatedAsyncioTestCase):
    async def test_foreground_preempts_only_background(self):
        import asyncio
        from lumen.ollama import observation_tasks, prioritize_chat
        stopped = asyncio.Event()
        async def background():
            try: await asyncio.Event().wait()
            finally: stopped.set()
        task = asyncio.create_task(background())
        await asyncio.sleep(0)
        observation_tasks.add(task)
        try:
            await prioritize_chat()
            self.assertTrue(task.cancelled())
            self.assertTrue(stopped.is_set())
        finally: observation_tasks.discard(task)

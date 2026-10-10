import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from lumen.auth import AuthUser, require_user
from lumen.config import Settings
from lumen.providers import RecordingProvider, endpoint_host, router

C='11111111-1111-4111-8111-111111111111'

class ProviderRequests(unittest.IsolatedAsyncioTestCase):
    def test_endpoint_redacts_secrets_and_handles_invalid_urls(self):
        self.assertEqual(endpoint_host('https://user:secret@heavy.test:8188/path?token=private#secret'),'heavy.test:8188')
        self.assertEqual(endpoint_host('http://[::1]:11434/path'),'[::1]:11434')
        for value in [None,Mock(),'file:///secret','http://bad:invalid','not a url']:
            self.assertEqual(endpoint_host(value),'Not configured')
    async def test_records_actual_text_vision_and_structured_calls_without_content(self):
        records=[];real=Mock(base_url='http://video.test:11434',generate=AsyncMock(return_value={'model':'actual'}),structured=AsyncMock(return_value='{}'),generate_stream=AsyncMock(return_value={'model':'vision-model'}))
        provider=RecordingProvider(real,SimpleNamespace(ollama_url='http://wrong.test'),records)
        await provider.generate('requested',[{'role':'user','content':'private'}])
        await provider.structured('draft-model',[],{})
        await provider.generate_stream('vision-model',[{'images':['secret-image']}],AsyncMock())
        self.assertEqual([row['kind'] for row in records],['text','structured','vision'])
        self.assertEqual(records[0]['model'],'actual');self.assertEqual(records[0]['endpoint'],'video.test:11434')
        self.assertTrue(all(row['status']=='completed' for row in records))
        self.assertNotIn('private',str(records));self.assertNotIn('secret-image',str(records))
    async def test_failures_and_retries_are_distinct(self):
        records=[];real=Mock(base_url='http://video.test',generate=AsyncMock(side_effect=[RuntimeError('private error'),{'model':'retry'}]))
        provider=RecordingProvider(real,SimpleNamespace(),records)
        with self.assertRaises(RuntimeError):await provider.generate('model',[])
        await provider.generate('model',[])
        self.assertEqual([row['status'] for row in records],['failed','completed'])
        self.assertNotIn('private error',str(records))
    async def test_non_inference_queries_are_not_reported_as_model_execution(self):
        records=[];real=Mock(supports_vision=AsyncMock(return_value=True))
        provider=RecordingProvider(real,SimpleNamespace(),records)
        self.assertTrue(await provider.supports_vision('model'));self.assertEqual(records,[])

class ProviderRoutes(unittest.TestCase):
    def setUp(self):
        app=FastAPI();app.include_router(router);self.app=app
        app.dependency_overrides[require_user]=lambda:AuthUser('owner','token')
        self.client=TestClient(app);self.addCleanup(self.client.close)
        self.db=Mock(get_companion=AsyncMock(return_value={'conversation_model':'chosen'}))
        self.settings=Settings(supabase_url='http://db',supabase_service_role_key='secret',ollama_url='http://user:password@video.test:11434/private',comfyui_url='http://heavy.test:8188?token=secret',speech_url='http://helios.test:8000')
    def test_routes_use_configuration_and_companion_model(self):
        with patch('lumen.providers.companion_db',AsyncMock(return_value=self.db)) as owned,patch('lumen.providers.get_settings',return_value=self.settings):
            response=self.client.get('/v0.9/providers/companions/'+C)
        self.assertEqual(response.status_code,200);owned.assert_awaited_once()
        rows=response.json()['routes'];self.assertEqual(rows[0]['model'],'chosen');self.assertEqual(rows[1]['model'],'chosen')
        self.assertEqual(rows[0]['endpoint'],'video.test:11434');self.assertEqual(rows[3]['endpoint'],'heavy.test:8188')
        for secret in ['password','token=','secret','/private']:
            self.assertNotIn(secret,response.text)
        self.assertNotIn('online',response.text)
    def test_authentication_and_ownership_required(self):
        self.app.dependency_overrides.clear();self.assertEqual(self.client.get('/v0.9/providers/companions/'+C).status_code,401)
        from fastapi import HTTPException
        self.app.dependency_overrides[require_user]=lambda:AuthUser('owner','token')
        with patch('lumen.providers.companion_db',AsyncMock(side_effect=HTTPException(404,'Companion not found.'))):
            self.assertEqual(self.client.get('/v0.9/providers/companions/'+C).status_code,404)

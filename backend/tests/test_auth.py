import unittest
from unittest.mock import AsyncMock, Mock, patch

import httpx
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from lumen.auth import require_user
from lumen.config import Settings
from lumen.db import SupabaseRepository
from lumen.runtime import CognitionRuntime
from lumen.memory import memory_subject


class AuthTests(unittest.TestCase):
    def setUp(self):
        self.settings = Settings(supabase_url='http://local-db', supabase_service_role_key='server-key')
        self.app = FastAPI()
        @self.app.get('/private')
        async def private(user=Depends(require_user)):
            return {'id': user.id}
        self.client = TestClient(self.app)
        self.addCleanup(self.client.close)
        self.settings_patch = patch('lumen.auth.get_settings', return_value=self.settings)
        self.settings_patch.start()
        self.addCleanup(self.settings_patch.stop)

    def transport(self, handler):
        original = httpx.AsyncClient
        return patch('lumen.auth.httpx.AsyncClient', side_effect=lambda **kwargs:
            original(transport=httpx.MockTransport(handler), **kwargs))

    def test_voice_requires_login_before_contacting_helios(self):
        from lumen.voice import router
        app = FastAPI()
        app.include_router(router)
        with TestClient(app) as client, patch('lumen.voice.httpx.AsyncClient') as upstream:
            self.assertEqual(client.post('/v0.1/voice/speak', json={'text': 'hello'}).status_code, 401)
            self.assertEqual(client.post('/v0.1/voice/transcribe', files={'file': ('audio', b'hi')}).status_code, 401)
            upstream.assert_not_called()

    def test_missing_credentials_rejected_before_work(self):
        with patch('lumen.auth.httpx.AsyncClient') as client:
            self.assertEqual(self.client.get('/private').status_code, 401)
            client.assert_not_called()

    def test_invalid_expired_and_anonymous_tokens_rejected(self):
        for status, body in [(401, {}), (403, {}), (200, {'id': 'user', 'is_anonymous': True}), (200, {})]:
            with self.transport(lambda request: httpx.Response(status, json=body)):
                self.assertEqual(self.client.get('/private', headers={'Authorization': 'Bearer invalid'}).status_code, 401)

    def test_verified_identity_comes_from_auth(self):
        def handler(request):
            self.assertEqual(str(request.url), 'http://local-db/auth/v1/user')
            self.assertEqual(request.headers['Authorization'], 'Bearer signed-token')
            return httpx.Response(200, json={'id': 'verified-user', 'is_anonymous': False})
        with self.transport(handler):
            response = self.client.get('/private', headers={'Authorization': 'Bearer signed-token'})
        self.assertEqual(response.json(), {'id': 'verified-user'})

    def test_auth_outage_is_not_an_auth_bypass(self):
        def handler(request):
            raise httpx.ConnectError('offline', request=request)
        with self.transport(handler):
            self.assertEqual(self.client.get('/private', headers={'Authorization': 'Bearer token'}).status_code, 503)

    def test_repository_uses_user_token_for_rls(self):
        repo = SupabaseRepository(self.settings, 'signed-user-token')
        self.assertEqual(repo.headers['Authorization'], 'Bearer signed-user-token')
        self.assertNotIn('server-key', repo.headers['Authorization'])

    def test_user_companion_shared_and_unknown_subjects(self):
        for text, subject in [('my favorite color is turquoise', 'user'),
                              ('your favorite color is red', 'companion'),
                              ("Nova's birthday is October 3", 'companion'),
                              ('our first chat was today', 'shared'),
                              ('Alice likes summer', 'user'),
                              ('Someone likes coffee', 'unknown')]:
            self.assertEqual(memory_subject(text, 'Nova', 'Alice'), subject)

    def test_prompt_keeps_identity_and_subjects_separate(self):
        prompt = CognitionRuntime._build_system_prompt({'name': 'Nova'}, {},
            [{'subject': 'companion', 'content': 'your favorite color is red', 'type': 'preference'},
             {'subject': 'user', 'content': 'my favorite color is turquoise', 'type': 'preference'}],
            {'id': 'user-uuid', 'display_name': 'Alice'})
        self.assertIn('Current user: Alice', prompt)
        self.assertIn('subject=companion', prompt)
        self.assertIn('subject=user', prompt)
        self.assertNotIn('Brett', prompt)


class ScopeTests(unittest.IsolatedAsyncioTestCase):
    async def test_foreign_companion_cannot_read_history_or_generate(self):
        runtime = CognitionRuntime.__new__(CognitionRuntime)
        runtime.db = Mock(get_companion=AsyncMock(return_value=None))
        runtime.provider = Mock(generate=AsyncMock())
        with self.assertRaises(ValueError):
            await runtime.respond('foreign', 'chat', 'hello')
        runtime.provider.generate.assert_not_awaited()

    async def test_foreign_conversation_cannot_read_history_or_generate(self):
        runtime = CognitionRuntime.__new__(CognitionRuntime)
        runtime.db = Mock(get_companion=AsyncMock(return_value={'name': 'Lumen'}),
                          get_conversation=AsyncMock(return_value=None),
                          get_recent_messages=AsyncMock())
        runtime.provider = Mock(generate=AsyncMock())
        with self.assertRaises(ValueError):
            await runtime.respond('own', 'foreign-chat', 'hello')
        runtime.db.get_recent_messages.assert_not_awaited()
        runtime.provider.generate.assert_not_awaited()


if __name__ == '__main__': unittest.main()

import unittest
from unittest.mock import AsyncMock, Mock, patch

from fastapi.testclient import TestClient
from lumen.auth import AuthUser, require_user
from lumen.config import Settings

settings = Settings(supabase_url='http://db', supabase_service_role_key='test',
                    conversation_model='default-chat', memory_observation_model='extractor')
with patch('lumen.config.get_settings', return_value=settings):
    from lumen.main import app


class ModelRoutes(unittest.TestCase):
    def setUp(self):
        self.db = Mock(get_companion=AsyncMock(return_value={'conversation_model': None}),
                       _request=AsyncMock(return_value=[{'id': 'mine'}]))
        self.provider = Mock(list_models=AsyncMock(return_value=['chat-a', 'chat-b']))
        self.patches = [patch('lumen.main.settings', settings),
                        patch('lumen.main.SupabaseRepository', return_value=self.db),
                        patch('lumen.main.OllamaProvider', return_value=self.provider)]
        for item in self.patches:
            item.start()
            self.addCleanup(item.stop)
        app.dependency_overrides[require_user] = lambda: AuthUser('owner', 'owner-token')
        self.addCleanup(app.dependency_overrides.clear)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def test_list_effective_and_memory_models(self):
        response = self.client.get('/v0.2/companions/mine/models')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['effective'], 'default-chat')
        self.assertEqual(response.json()['memory_model'], 'extractor')

    def test_save_validate_and_reset(self):
        endpoint = '/v0.2/companions/mine/model'
        self.assertEqual(self.client.put(endpoint, json={'model': 'missing'}).status_code, 400)
        self.db._request.assert_not_awaited()
        self.assertEqual(self.client.put(endpoint, json={'model': 'chat-b'}).json()['effective'], 'chat-b')
        self.assertEqual(self.db._request.call_args.kwargs['json'], {'conversation_model': 'chat-b'})
        self.assertEqual(self.client.put(endpoint, json={'model': None}).json()['effective'], 'default-chat')

    def test_other_account_denied_before_contacting_ollama(self):
        self.db.get_companion.return_value = None
        self.assertEqual(self.client.get('/v0.2/companions/other/models').status_code, 404)
        self.assertEqual(self.client.put('/v0.2/companions/other/model', json={'model': 'chat-a'}).status_code, 404)
        self.provider.list_models.assert_not_awaited()
        self.db._request.assert_not_awaited()

    def test_missing_login_denied(self):
        app.dependency_overrides.clear()
        self.assertEqual(self.client.get('/v0.2/companions/mine/models').status_code, 401)
        self.assertEqual(self.client.put('/v0.2/companions/mine/model', json={'model': 'chat-a'}).status_code, 401)
        self.db.get_companion.assert_not_awaited()

    def test_ollama_failure_does_not_change_selection(self):
        self.provider.list_models.side_effect = RuntimeError('offline')
        self.assertEqual(self.client.put('/v0.2/companions/mine/model', json={'model': 'chat-a'}).status_code, 502)
        self.db._request.assert_not_awaited()

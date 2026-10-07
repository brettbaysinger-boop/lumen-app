import base64
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch
import httpx
from lumen.config import Settings
from lumen.ollama import OllamaProvider
from lumen.runtime import CognitionRuntime
from lumen.schemas import Attachment
from lumen.vision import load_images, VisionError

OWNER = 'a289a618-87be-4854-a74e-03e7b52c2ec1'
OTHER = '4b289051-29f1-4f6d-bbe4-662c6013eea2'
PHOTO = Attachment(path=OWNER + '/photo.png', mime_type='image/png')
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGAAAAABJRU5ErkJggg==')
SETTINGS = Settings(supabase_url='http://db', supabase_service_role_key='service', ollama_url='http://ollama', conversation_model='photo-model')
HEADERS = {'apikey': 'service', 'Authorization': 'Bearer owner-token'}
CLIENT = httpx.AsyncClient


class VisionTransport(unittest.IsolatedAsyncioTestCase):
    def transport(self, handler):
        return patch('httpx.AsyncClient', lambda **kwargs: CLIENT(transport=httpx.MockTransport(handler), **kwargs))

    async def test_private_read_and_base64(self):
        def handler(request):
            self.assertEqual(str(request.url), 'http://db/storage/v1/object/authenticated/chat-media/' + PHOTO.path)
            self.assertEqual(request.headers['authorization'], 'Bearer owner-token')
            self.assertNotIn('content-type', request.headers)
            return httpx.Response(200, content=PNG, headers={'content-type': 'image/png'})
        with self.transport(handler):
            self.assertEqual(await load_images(SETTINGS, HEADERS, OWNER, [PHOTO]), [base64.b64encode(PNG).decode()])

    async def test_other_owner_and_service_session_denied_before_network(self):
        with patch('httpx.AsyncClient') as client:
            for owner, headers in [(OTHER, HEADERS), (OWNER, {'Authorization': 'Bearer service'})]:
                with self.assertRaises(VisionError):
                    await load_images(SETTINGS, headers, owner, [PHOTO])
            client.assert_not_called()

    async def test_paths_do_not_accept_urls_or_traversal(self):
        for path in [OWNER + '/../photo.png', 'https://example.com/photo.png', OWNER + '/%2e%2e/photo.png']:
            with self.assertRaises(ValueError):
                Attachment(path=path, mime_type='image/png')

    async def test_missing_invalid_mime_and_invalid_bytes(self):
        for response in [httpx.Response(404), httpx.Response(200, content=PNG, headers={'content-type':'text/html'}),
                         httpx.Response(200, content=b'not an image', headers={'content-type':'image/png'}),
                         httpx.Response(302, headers={'location':'https://example.com'})]:
            with self.transport(lambda request: response):
                with self.assertRaises(VisionError):
                    await load_images(SETTINGS, HEADERS, OWNER, [PHOTO])

    async def test_size_limit_checks_actual_bytes_and_declared_length(self):
        for headers in [{'content-type':'image/png'}, {'content-type':'image/png','content-length':'1000'}]:
            with self.transport(lambda request: httpx.Response(200, content=PNG, headers=headers)), patch('lumen.vision.MAX_IMAGE_BYTES', 8):
                with self.assertRaises(VisionError):
                    await load_images(SETTINGS, HEADERS, OWNER, [PHOTO])

    async def test_capability_is_queried_not_guessed_from_model_name(self):
        for body, expected in [({'capabilities':['completion','vision']}, True), ({'capabilities':['completion']}, False), ({}, None)]:
            def handler(request):
                self.assertEqual(request.url.path, '/api/show')
                return httpx.Response(200, json=body)
            with self.transport(handler):
                self.assertIs(await OllamaProvider(SETTINGS).supports_vision('anything'), expected)
        with self.transport(lambda request: httpx.Response(500)):
            self.assertIsNone(await OllamaProvider(SETTINGS).supports_vision('anything'))


class VisionRuntime(unittest.IsolatedAsyncioTestCase):
    def runtime(self, vision=True):
        runtime = CognitionRuntime(SETTINGS, 'owner-token', OWNER)
        runtime.db = Mock(headers=HEADERS, get_companion=AsyncMock(return_value={'name':'Lumen'}),
            get_conversation=AsyncMock(return_value={'id':'conversation'}), get_state=AsyncMock(return_value={}),
            get_relevant_memories=AsyncMock(return_value=[]), get_recent_messages=AsyncMock(return_value=[]),
            get_profile=AsyncMock(return_value={}), create_message=AsyncMock(side_effect=[{'id':'u'},{'id':'a'}]),
            touch_conversation=AsyncMock(), _request=AsyncMock())
        result={'content':'The label says 120V.', 'model':'photo-model', 'latency_ms':1, 'tokens_in':10, 'tokens_out':10}
        runtime.provider = SimpleNamespace(name='ollama', supports_vision=AsyncMock(return_value=vision),
            generate=AsyncMock(return_value=result), generate_stream=AsyncMock(return_value=result))
        return runtime

    async def test_both_reply_paths_send_images_and_persist_only_paths(self):
        for streaming in [False, True]:
            runtime = self.runtime()
            emit = AsyncMock() if streaming else None
            with patch('lumen.runtime.load_images', AsyncMock(return_value=['encoded-image'])):
                response = await runtime.respond('companion','conversation','Read this label', [PHOTO], emit)
            call = runtime.provider.generate_stream if streaming else runtime.provider.generate
            messages=call.call_args.args[1]
            self.assertEqual(messages[-1]['images'], ['encoded-image'])
            self.assertEqual(messages[-1]['content'], 'Read this label')
            user=runtime.db.create_message.call_args_list[0].args[0]
            assistant=runtime.db.create_message.call_args_list[1].args[0]
            self.assertEqual(user['metadata']['attachments'][0]['path'], PHOTO.path)
            self.assertNotIn('encoded-image', str(user))
            self.assertTrue(assistant['metadata']['vision_used'])
            self.assertIsNone(response.observation_message_id)
            runtime.db._request.assert_not_awaited()

    async def test_unsupported_or_unknown_never_reads_or_generates(self):
        for supported in [False, None]:
            runtime=self.runtime(supported)
            with patch('lumen.runtime.load_images') as read:
                response=await runtime.respond('c','conversation','What is this?', [PHOTO])
            self.assertEqual(response.model,'vision-unavailable')
            self.assertIn('haven’t viewed', response.content)
            read.assert_not_called()
            runtime.provider.generate.assert_not_awaited()

    async def test_photo_does_not_trigger_memory_or_search_commands(self):
        runtime=self.runtime()
        with patch('lumen.runtime.load_images', AsyncMock(return_value=['image'])), patch('lumen.runtime.web_action') as search:
            await runtime.respond('c','conversation','remember that this is my label', [PHOTO])
        runtime.provider.generate.assert_awaited_once()
        runtime.db.remember.assert_not_called()
        search.assert_not_called()

    async def test_unreadable_photo_has_honest_reply(self):
        runtime=self.runtime()
        with patch('lumen.runtime.load_images', AsyncMock(side_effect=VisionError('Photo unavailable; I haven’t viewed it.'))):
            response=await runtime.respond('c','conversation','Read this', [PHOTO])
        self.assertIn('haven’t viewed',response.content)
        runtime.provider.generate.assert_not_awaited()

    async def test_other_account_photo_rejected_before_companion_or_model_access(self):
        runtime=self.runtime()
        photo=Attachment(path=OTHER+'/photo.png', mime_type='image/png')
        with self.assertRaises(ValueError):
            await runtime.respond('c','conversation','Read this',[photo])
        runtime.db.get_companion.assert_not_awaited()
        runtime.provider.supports_vision.assert_not_awaited()

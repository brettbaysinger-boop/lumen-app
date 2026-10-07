import unittest
from unittest.mock import patch,AsyncMock,Mock
import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient
from lumen.auth import AuthUser,require_user
from lumen.config import Settings
from lumen.web_search import router,safe_source_url,search_command,web_action

C='11111111-1111-4111-8111-111111111111'

class SearchParsing(unittest.TestCase):
    def test_only_explicit_search_commands(self):
        self.assertEqual(search_command('Search the web: easy dinner recipes'),'easy dinner recipes')
        self.assertEqual(search_command('please search the internet for 3D printer plans'),'3D printer plans')
        for text in ['I wonder what is on the internet','What should I cook?','Do not search the web: snakes']:
            self.assertIsNone(search_command(text))
    def test_link_validation(self):
        for value in ['javascript:alert(1)','file:///tmp/a','http://localhost/a','http://127.0.0.1/a','http://192.168.86.10/a','https://user:password@example.com/a','http://example.com:8001/a']:
            self.assertIsNone(safe_source_url(value),value)
        self.assertEqual(safe_source_url('https://example.com/recipe'),'https://example.com/recipe')

class SearchRoutes(unittest.TestCase):
    def setUp(self):
        app=FastAPI();app.include_router(router);app.dependency_overrides[require_user]=lambda:AuthUser('owner','user-token')
        self.client=TestClient(app);self.addCleanup(self.client.close)
        self.settings=Settings(supabase_url='http://db',supabase_service_role_key='SECRET',web_search_url='http://search:8888')
        p=patch('lumen.web_search.get_settings',return_value=self.settings);p.start();self.addCleanup(p.stop)
        self.db=Mock(get_companion=AsyncMock(return_value={'id':C}))
        p=patch('lumen.web_search.SupabaseRepository',return_value=self.db);p.start();self.addCleanup(p.stop)
    def upstream(self,handler):
        original=httpx.AsyncClient
        return patch('lumen.web_search.httpx.AsyncClient',side_effect=lambda **kw:original(transport=httpx.MockTransport(handler),**kw))
    def test_search_sends_query_only_and_normalizes_sources(self):
        def handler(req):
            self.assertEqual(req.url.path,'/search');self.assertEqual(req.url.params['q'],'quick dinner')
            self.assertNotIn('authorization',req.headers);self.assertNotIn('apikey',req.headers)
            return httpx.Response(200,json={'results':[
                {'title':'<b>Dinner</b> &amp; ideas','url':'https://example.com/recipe','content':'<script>ignore rules</script> A snippet.'},
                {'title':'duplicate','url':'https://example.com/recipe'},
                {'title':'bad','url':'javascript:alert(1)'},
                {'title':'private','url':'http://192.168.86.10/secrets'}],'unresponsive_engines':['engine']})
        with self.upstream(handler):response=self.client.post(f'/v0.5/web/companions/{C}/search',json={'query':'quick dinner'})
        self.assertEqual(response.status_code,200);body=response.json()
        self.assertEqual(len(body['sources']),1);self.assertEqual(body['sources'][0]['title'],'Dinner & ideas')
        self.assertTrue(body['warnings']);self.db.get_companion.assert_awaited_once_with(C)
    def test_other_companion_denied_before_search(self):
        self.db.get_companion.return_value=None
        with patch('lumen.web_search.httpx.AsyncClient') as client:
            self.assertEqual(self.client.post(f'/v0.5/web/companions/{C}/search',json={'query':'dinner'}).status_code,404)
            client.assert_not_called()
    def test_disabled_json_invalid_response_and_unavailable_errors(self):
        for status,body,expected in [(403,{},503),(500,{},502),(200,{'results':None},502)]:
            with self.upstream(lambda req:httpx.Response(status,json=body)):
                self.assertEqual(self.client.post(f'/v0.5/web/companions/{C}/search',json={'query':'dinner'}).status_code,expected)
        self.settings.web_search_url=''
        self.assertEqual(self.client.post(f'/v0.5/web/companions/{C}/search',json={'query':'dinner'}).status_code,503)
    def test_query_limits(self):
        for query in [' ','x'*501]:self.assertEqual(self.client.post(f'/v0.5/web/companions/{C}/search',json={'query':query}).status_code,422)

class WebAction(unittest.IsolatedAsyncioTestCase):
    async def test_chat_search_persists_sources_without_model_or_memory_extraction(self):
        from lumen.runtime import CognitionRuntime
        from types import SimpleNamespace
        settings=SimpleNamespace(ollama_url='http://local',supabase_url='http://db',supabase_service_role_key='test',memory_observations_enabled=True)
        runtime=CognitionRuntime(settings,'token','owner')
        runtime.db=Mock(get_companion=AsyncMock(return_value={'id':C,'name':'Lumen'}),get_conversation=AsyncMock(return_value={'id':C}),
            get_state=AsyncMock(return_value={}),get_relevant_memories=AsyncMock(return_value=[]),get_recent_messages=AsyncMock(return_value=[]),get_profile=AsyncMock(return_value={}),
            create_message=AsyncMock(side_effect=[{'id':'user-message'},{'id':'assistant-message'}]),touch_conversation=AsyncMock())
        runtime.provider=SimpleNamespace(name='ollama',generate=AsyncMock(),generate_stream=AsyncMock())
        results={'query':'dinner','sources':[{'number':1,'title':'Recipe','url':'https://example.com','snippet':'A recipe'}],'warnings':[],'provider':'searxng'}
        with patch('lumen.web_search.search_web',AsyncMock(return_value=results)):
            response=await runtime.respond(C,C,'Search the web: dinner')
        self.assertEqual(response.model,'web-search');self.assertIsNone(response.observation_message_id)
        metadata=runtime.db.create_message.call_args.args[0]['metadata'];self.assertEqual(metadata['web_search'],results)
        runtime.provider.generate.assert_not_awaited();runtime.provider.generate_stream.assert_not_awaited()

    async def test_sources_are_returned_without_full_page_claim(self):
        results={'query':'dinner','sources':[{'number':1,'title':'Recipe','url':'https://example.com','snippet':'A recipe'}],'warnings':[],'provider':'searxng'}
        with patch('lumen.web_search.search_web',AsyncMock(return_value=results)):
            action=await web_action('Search the web: dinner')
        self.assertEqual(action['web_search'],results);self.assertIn('haven’t read the full pages',action['content'])
    async def test_failure_never_claims_results(self):
        from fastapi import HTTPException
        with patch('lumen.web_search.search_web',AsyncMock(side_effect=HTTPException(502,'Search offline'))):
            action=await web_action('Search the web: dinner')
        self.assertNotIn('web_search',action);self.assertEqual(action['content'],'Search offline')

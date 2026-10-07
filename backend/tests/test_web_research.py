import asyncio
import copy
from email.message import Message
import io
import json
import socket
import unittest
from unittest.mock import AsyncMock, Mock, patch
from lumen import web_pages
from lumen.web_pages import PageError, PageText, public_addresses, read_page, retrieve_sources, PinnedConnection
from lumen.web_research import research_answer

PUBLIC = (socket.AF_INET, socket.SOCK_STREAM, 6, '', ('93.184.216.34', 443))
TEXT = 'A recipe uses a hot skillet, salt and a ribeye steak. Rest it before slicing. ' * 4


def response(status=200, body=TEXT.encode(), content_type='text/html', **headers):
    message = Message()
    message['Content-Type'] = content_type
    for key, value in headers.items():message[key.replace('_','-')] = str(value)
    return Mock(status=status, headers=message, getheader=lambda name, default=None: message.get(name, default),
                read1=io.BytesIO(body).read)


class PublicPageTests(unittest.TestCase):
    def test_all_dns_addresses_must_be_public(self):
        for ip in ['127.0.0.1','192.168.86.10','100.75.227.45','169.254.169.254','0.0.0.0','224.0.0.1',
                   '::1','ff02::1','::ffff:127.0.0.1','2002:7f00:1::','64:ff9b::7f00:1']:
            family=socket.AF_INET6 if ':' in ip else socket.AF_INET
            record=(family,socket.SOCK_STREAM,6,'',(ip,443))
            with patch('socket.getaddrinfo',return_value=[PUBLIC,record]):
                with self.assertRaises(PageError):public_addresses('example.com',443)
        with patch('socket.getaddrinfo',return_value=[PUBLIC]):
            self.assertEqual(public_addresses('example.com',443),[(socket.AF_INET,PUBLIC[-1])])

    def test_connection_pins_socket_and_verifies_original_tls_hostname(self):
        sock=Mock(); context=Mock(); context.wrap_socket.return_value=sock
        connection=PinnedConnection('example.com',443,(socket.AF_INET,PUBLIC[-1]),5,True)
        with patch('socket.socket',return_value=sock), patch('ssl.create_default_context',return_value=context), patch('socket.getaddrinfo') as dns:
            connection.connect()
        sock.connect.assert_called_once_with(PUBLIC[-1])
        context.wrap_socket.assert_called_once_with(sock,server_hostname='example.com')
        dns.assert_not_called()

    def test_request_has_no_auth_cookies_or_private_context(self):
        connection=Mock(getresponse=Mock(return_value=response()))
        with patch('lumen.web_pages.public_addresses',return_value=[(socket.AF_INET,PUBLIC[-1])]), patch('lumen.web_pages.PinnedConnection',return_value=connection):
            page=read_page('https://example.com/recipe?q=ribeye')
        self.assertIn('hot skillet',page['text'])
        headers=connection.request.call_args.kwargs['headers']
        self.assertEqual(set(headers),{'Host','User-Agent','Accept','Accept-Encoding'})
        self.assertEqual(headers['Host'],'example.com')
        connection.close.assert_called_once()

    def test_redirect_to_private_host_or_dns_is_blocked(self):
        for location in ['http://127.0.0.1/admin','https://other.example/private']:
            connection=Mock(getresponse=Mock(return_value=response(status=302,Location=location)))
            with patch('lumen.web_pages.public_addresses',side_effect=[[(socket.AF_INET,PUBLIC[-1])],PageError('Private DNS')]), patch('lumen.web_pages.PinnedConnection',return_value=connection) as factory:
                with self.assertRaises(PageError):read_page('https://example.com/recipe')
            factory.assert_called_once()

    def test_public_redirect_is_revalidated_and_bounded(self):
        redirect=Mock(getresponse=Mock(return_value=response(status=302,Location='/new')))
        success=Mock(getresponse=Mock(return_value=response()))
        with patch('lumen.web_pages.public_addresses',return_value=[(socket.AF_INET,PUBLIC[-1])]) as dns, patch('lumen.web_pages.PinnedConnection',side_effect=[redirect,success]):
            self.assertEqual(read_page('https://example.com/old')['url'],'https://example.com/new')
        self.assertEqual(dns.call_count,2)
        with patch('lumen.web_pages.public_addresses',return_value=[(socket.AF_INET,PUBLIC[-1])]), patch('lumen.web_pages.PinnedConnection',return_value=redirect) as factory:
            with self.assertRaises(PageError):read_page('https://example.com/old')
        self.assertEqual(factory.call_count,4)

    def test_unsafe_urls_never_connect(self):
        with patch('lumen.web_pages.PinnedConnection') as factory:
            for url in ['file:///etc/passwd','http://localhost/','https://host.tail123.ts.net/','https://user:password@example.com/', 'https://example.com:8001/', 'https://example.com/\nheader', 'https://example.com\\@127.0.0.1/']:
                with self.assertRaises(PageError):read_page(url)
            factory.assert_not_called()

    def test_type_compression_and_byte_limits(self):
        for page in [response(content_type='application/pdf'),response(Content_Encoding='gzip'),
                     response(Content_Length=web_pages.MAX_BYTES+1),response(body=b'x'*(web_pages.MAX_BYTES+1))]:
            connection=Mock(getresponse=Mock(return_value=page))
            with patch('lumen.web_pages.public_addresses',return_value=[(socket.AF_INET,PUBLIC[-1])]), patch('lumen.web_pages.PinnedConnection',return_value=connection):
                with self.assertRaises(PageError):read_page('https://example.com/')

    def test_html_removes_scripts_navigation_and_forms(self):
        parser=PageText()
        parser.feed('<nav>Menu</nav><script>steal secrets</script><style>hidden</style><form>Login</form><article><h1>Recipe</h1><p>Salt &amp; pepper.</p></article>')
        text=parser.text()
        self.assertIn('Salt & pepper.',text)
        for hidden in ['Menu','steal','hidden','Login']:self.assertNotIn(hidden,text)


def action():
    return {'content':'Search snippets: recipe.', 'model':'web-search', 'web_search':{
        'query':'best ribeye recipes', 'sources':[{'number':1,'title':'Recipe','url':'https://example.com/recipe','snippet':'A steak recipe'}], 'warnings':[]}}


class ResearchTests(unittest.IsolatedAsyncioTestCase):
    async def test_chat_persists_cited_answer_without_private_context_or_memory_write(self):
        from lumen.config import Settings
        from lumen.runtime import CognitionRuntime
        from types import SimpleNamespace
        settings=Settings(supabase_url='http://db',supabase_service_role_key='service',ollama_url='http://ollama',conversation_model='default')
        runtime=CognitionRuntime(settings,'owner-token','owner')
        runtime.db=Mock(get_companion=AsyncMock(return_value={'name':'Lumen','conversation_model':'selected'}),
            get_conversation=AsyncMock(return_value={'id':'conversation'}), get_state=AsyncMock(return_value={}),
            get_relevant_memories=AsyncMock(return_value=[{'subject':'user','content':'PRIVATE-MEMORY'}]),
            get_recent_messages=AsyncMock(return_value=[{'role':'user','content':'PRIVATE-HISTORY'}]),
            get_profile=AsyncMock(return_value={}), create_message=AsyncMock(side_effect=[{'id':'u'},{'id':'a'}]),
            touch_conversation=AsyncMock(), _request=AsyncMock())
        runtime.provider=SimpleNamespace(name='ollama',generate=AsyncMock(return_value={
            'content':'Rest the steak before slicing. [1]','model':'selected','latency_ms':5,'tokens_in':10,'tokens_out':15}),generate_stream=AsyncMock())
        with patch('lumen.runtime.handle_action',AsyncMock(return_value=None)), patch('lumen.runtime.web_action',AsyncMock(return_value=action())), patch('lumen.web_pages.read_page',return_value={'text':TEXT,'url':'https://example.com/recipe','retrieved_at':'now'}):
            result=await runtime.respond('companion','conversation','Search the web: ribeye',emit=AsyncMock())
        runtime.provider.generate.assert_awaited_once()
        self.assertEqual(runtime.provider.generate.call_args.args[0],'selected')
        for private in ['PRIVATE-MEMORY','PRIVATE-HISTORY','owner-token']:
            self.assertNotIn(private,str(runtime.provider.generate.call_args))
        metadata=runtime.db.create_message.call_args_list[1].args[0]['metadata']['web_search']
        self.assertEqual(metadata['answer_status'],'answered')
        self.assertEqual(metadata['sources'][0]['retrieval']['status'],'page_excerpt')
        self.assertEqual(result.model,'selected');self.assertIsNone(result.observation_message_id)
        runtime.provider.generate_stream.assert_not_awaited();runtime.db._request.assert_not_awaited()

    async def test_fetch_failure_preserves_snippets_and_caps_page_count(self):
        results=action()['web_search']
        results['sources'] *= 6
        results['sources']=copy.deepcopy(results['sources'])
        with patch('lumen.web_pages.read_page',side_effect=PageError('Blocked')) as read:
            texts=await retrieve_sources(results)
        self.assertEqual(read.call_count,3)
        self.assertEqual(texts,['A steak recipe']*6)
        self.assertTrue(all(s['retrieval']['status']=='snippet_only' for s in results['sources']))

    async def test_answer_uses_excerpts_and_only_query_not_private_history(self):
        request=action()
        provider=Mock(generate=AsyncMock(return_value={'content':'Use a hot skillet and rest the steak. [1]', 'model':'chat','latency_ms':5,'tokens_in':10,'tokens_out':15}))
        with patch('lumen.web_pages.read_page',return_value={'text':TEXT,'url':'https://example.com/recipe','retrieved_at':'now'}):
            answer=await research_answer(request,provider,'chat',AsyncMock())
        messages=provider.generate.call_args.args[1]
        payload=json.loads(messages[1]['content'])
        self.assertEqual(set(payload),{'question','references'})
        self.assertIn(TEXT,payload['references'][0]['text'])
        self.assertIn('untrusted data',messages[0]['content'])
        self.assertIn('Read excerpts from 1',answer['content'])
        self.assertEqual(request['web_search']['answer_status'],'answered')
        self.assertNotIn(TEXT,str(request),'raw pages are not stored in metadata')

    async def test_invalid_citation_or_url_or_generation_error_falls_back(self):
        for value in ['An answer without citations','Made up reference [9]','A URL https://evil.example/ [1]', '']:
            request=action()
            provider=Mock(generate=AsyncMock(return_value={'content':value}))
            with patch('lumen.web_pages.read_page',side_effect=PageError('Offline')):
                self.assertIsNone(await research_answer(request,provider,'chat'))
            self.assertEqual(request['web_search']['answer_status'],'fallback')
            self.assertIn('couldn’t produce an answer with usable citations',request['content'])
        request=action()
        with patch('lumen.web_pages.read_page',side_effect=PageError('Offline')):
            self.assertIsNone(await research_answer(request,Mock(generate=AsyncMock(side_effect=RuntimeError('Model offline'))),'chat'))

    async def test_all_unreadable_pages_are_honestly_labeled(self):
        request=action()
        provider=Mock(generate=AsyncMock(return_value={'content':'A steak recipe was found. [1]'}))
        with patch('lumen.web_pages.read_page',side_effect=PageError('Offline')):
            answer=await research_answer(request,provider,'chat')
        self.assertIn('Based on search snippets',answer['content'])
        self.assertEqual(request['web_search']['sources'][0]['retrieval']['status'],'snippet_only')

    async def test_no_results_never_invokes_model_or_pages(self):
        request=action();request['web_search']['sources']=[]
        provider=Mock(generate=AsyncMock())
        with patch('lumen.web_research.retrieve_sources') as retrieve:
            self.assertIsNone(await research_answer(request,provider,'chat'))
        retrieve.assert_not_called();provider.generate.assert_not_awaited()

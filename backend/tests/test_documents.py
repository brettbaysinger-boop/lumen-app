import io
import unittest
from unittest.mock import AsyncMock, Mock, patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pypdf import PdfWriter
from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject
from lumen.auth import AuthUser, require_user
from lumen.config import Settings
from lumen.documents import router, extract_worker, document_action, document_command, MAX_UPLOAD
from lumen.citations import normalize_citations

C='11111111-1111-4111-8111-111111111111'
D='22222222-2222-4222-8222-222222222222'
DOC={'id':D,'title':'Warranty.txt','kind':'text','page_count':1,'created_at':'now'}


def pdf(text=None, encrypted=False, count=1, padding=0):
    writer=PdfWriter()
    for _ in range(count):
        page=writer.add_blank_page(width=200,height=200)
        if text:
            font=DictionaryObject({NameObject('/Type'):NameObject('/Font'),NameObject('/Subtype'):NameObject('/Type1'),NameObject('/BaseFont'):NameObject('/Helvetica')})
            page[NameObject('/Resources')]=DictionaryObject({NameObject('/Font'):DictionaryObject({NameObject('/F1'):writer._add_object(font)})})
            stream=DecodedStreamObject();stream.set_data(f'BT /F1 12 Tf 20 40 Td ({text}) Tj ET'.encode())
            page[NameObject('/Contents')]=writer._add_object(stream)
    if padding:writer.add_metadata({'/Comment':'x'*padding})
    if encrypted:writer.encrypt('password')
    buffer=io.BytesIO();writer.write(buffer);return buffer.getvalue()


class Extraction(unittest.TestCase):
    def test_text_and_pdf_worker_preserve_pages(self):
        pages=extract_worker(b'Warranty covers parts for five years.\fLabor is excluded.', 'text')
        self.assertEqual(len(pages),2);self.assertIn('Labor',pages[1]['text'])
        pages=extract_worker(pdf('Warranty covers five years',count=2),'pdf')
        self.assertEqual(len(pages),2);self.assertIn('five years',pages[0]['text'])

    def test_larger_than_old_limit_extracts_with_new_25mb_limit(self):
        data=pdf('A larger document with selectable text.',padding=6*1024*1024)
        self.assertGreater(len(data),5*1024*1024)
        self.assertLess(len(data),MAX_UPLOAD)
        self.assertIn('larger document',extract_worker(data,'pdf')[0]['text'])

    def test_scan_encryption_invalid_and_page_limit(self):
        for data in [pdf(),pdf('Secret text',encrypted=True),b'not a PDF',pdf(count=101)]:
            with self.assertRaises(ValueError):extract_worker(data,'pdf')
        with self.assertRaises(ValueError):extract_worker(b'\xff\xfe\x00\x00','text')
        with self.assertRaises(ValueError):extract_worker(b'x'*50001,'text')

    def test_grouped_citations_validate_every_member(self):
        self.assertEqual(normalize_citations('Supported [1, 2].',{1,2}),'Supported [1] [2].')
        for content in ['Invalid [1, 99].','Unsupported [1-2].','No citation here','Bad [0]']:
            with self.assertRaises(ValueError):normalize_citations(content,{1,2})

    def test_document_command_is_explicit(self):
        self.assertEqual(document_command('Search my documents: refrigerator warranty'),'refrigerator warranty')
        self.assertEqual(document_command('Ask my documents: what does the warranty cover?'),'what does the warranty cover?')
        self.assertIsNone(document_command('Do not search my documents: warranty'))


class DocumentAPI(unittest.TestCase):
    def setUp(self):
        self.app=FastAPI();self.app.include_router(router)
        self.app.dependency_overrides[require_user]=lambda:AuthUser('owner','owner-token')
        self.db=Mock(get_companion=AsyncMock(return_value={'id':C}),_request=AsyncMock(return_value=[]))
        self.settings=Settings(supabase_url='http://db',supabase_service_role_key='private')
        for item in [patch('lumen.documents.get_settings',return_value=self.settings),patch('lumen.documents.SupabaseRepository',return_value=self.db)]:
            item.start();self.addCleanup(item.stop)
        self.client=TestClient(self.app);self.addCleanup(self.client.close)
        self.base=f'/v0.6/documents/companions/{C}'

    def test_upload_scopes_atomic_rpc_and_does_not_store_original_bytes(self):
        self.db._request.side_effect=[[],[DOC]]
        with patch('lumen.documents.extract_worker',return_value=[{'text':'Warranty covers five years.'}]):
            response=self.client.post(self.base+'/upload',files={'file':('Warranty.txt',b'Warranty covers five years.','text/plain')})
        self.assertEqual(response.status_code,200)
        write=self.db._request.call_args
        self.assertEqual(write.args,('POST','rpc/import_document'))
        self.assertEqual(write.kwargs['json']['p_companion_id'],C)
        self.assertEqual(len(write.kwargs['json']['p_hash']),64)
        self.assertNotIn('bytes',write.kwargs['json'])
        self.assertFalse(response.json()['existing'])

    def test_upload_larger_than_old_limit_reaches_extraction_and_import(self):
        self.db._request.side_effect=[[],[DOC]]
        with patch('lumen.documents.extract_worker',return_value=[{'text':'Large file has readable text.'}]) as extract:
            response=self.client.post(self.base+'/upload',files={'file':('Large.pdf',b'%PDF-'+b'x'*(6*1024*1024))})
        self.assertEqual(response.status_code,200)
        self.assertGreater(len(extract.call_args.args[0]),5*1024*1024)

    def test_duplicate_skips_extraction_and_write(self):
        self.db._request.return_value=[DOC]
        with patch('lumen.documents.extract_worker') as extract:
            response=self.client.post(self.base+'/upload',files={'file':('Warranty.txt',b'Warranty covers five years.')})
        self.assertTrue(response.json()['existing']);extract.assert_not_called()
        self.assertEqual(self.db._request.call_count,1)

    def test_unsupported_empty_oversized_and_extraction_errors(self):
        for filename,data,status in [('photo.jpg',b'photo',415),('empty.txt',b'',413),('large.txt',b'x'*(MAX_UPLOAD+1),413)]:
            self.assertEqual(self.client.post(self.base+'/upload',files={'file':(filename,data)}).status_code,status)
        with patch('lumen.documents.extract_worker',side_effect=ValueError('Scanned PDF needs OCR')):
            self.assertEqual(self.client.post(self.base+'/upload',files={'file':('scan.pdf',b'%PDF-1.4')}).status_code,422)

    def test_other_companion_rejected_before_database_read_or_extract(self):
        self.db.get_companion.return_value=None
        with patch('lumen.documents.extract_worker') as extract:
            self.assertEqual(self.client.post(self.base+'/upload',files={'file':('file.txt',b'private text here')}).status_code,404)
        extract.assert_not_called();self.db._request.assert_not_awaited()

    def test_auth_required(self):
        self.app.dependency_overrides.clear()
        self.assertEqual(self.client.get(self.base).status_code,401)
        self.db.get_companion.assert_not_awaited()

    def test_search_and_page_access_include_companion_scope(self):
        self.client.post(self.base+'/search',json={'query':'warranty'})
        self.assertEqual(self.db._request.call_args.kwargs['json'],{'p_companion_id':C,'p_query':'warranty'})
        self.db._request.side_effect=[[DOC],[{'content':'Warranty covers five years.'}]]
        response=self.client.get(self.base+f'/{D}/pages/1')
        self.assertEqual(response.status_code,200)
        self.assertEqual(self.db._request.call_args_list[-2].kwargs['params']['companion_id'],f'eq.{C}')
        self.db._request.side_effect=None;self.db._request.return_value=[]
        self.assertEqual(self.client.get(self.base+f'/{D}/pages/1').status_code,404)

    def test_delete_scoped_and_missing_is_not_success(self):
        self.db._request.return_value=[DOC]
        self.assertEqual(self.client.delete(self.base+f'/{D}').status_code,200)
        self.assertEqual(self.db._request.call_args.kwargs['params'],{'id':f'eq.{D}','companion_id':f'eq.{C}'})
        self.db._request.return_value=[]
        self.assertEqual(self.client.delete(self.base+f'/{D}').status_code,404)


class DocumentChat(unittest.IsolatedAsyncioTestCase):
    async def test_local_answer_uses_only_matching_sources(self):
        db=Mock(_request=AsyncMock(return_value=[{'document_id':D,'title':'Warranty','page':2,'content':'Parts covered for five years.'}]))
        provider=Mock(generate=AsyncMock(return_value={'content':'Parts are covered for five years. [1]','model':'selected','latency_ms':5,'tokens_in':1,'tokens_out':2}))
        result=await document_action(db,C,'Search my documents: warranty',provider,'selected')
        self.assertEqual(result['document_sources'][0]['page'],2)
        self.assertIn('five years',result['content'])
        messages=provider.generate.call_args.args[1]
        self.assertIn('untrusted data',messages[0]['content'])
        self.assertNotIn('owner-token',str(messages))

    async def test_no_match_no_model_and_invalid_answer_returns_excerpts(self):
        db=Mock(_request=AsyncMock(return_value=[]));provider=Mock(generate=AsyncMock())
        result=await document_action(db,C,'Search my documents: warranty',provider,'model')
        self.assertIn('No matching',result['content']);provider.generate.assert_not_awaited()
        db._request.return_value=[{'document_id':D,'title':'Warranty','page':1,'content':'Private matching text'}]
        provider.generate.return_value={'content':'Invalid source [1,99]'}
        result=await document_action(db,C,'Search my documents: warranty',provider,'model')
        self.assertIn('Private matching text',result['content'])
        self.assertEqual(result['model'],'document-search')


class DocumentRuntime(unittest.IsolatedAsyncioTestCase):
    async def test_chat_persists_page_sources_without_memory_or_web_actions(self):
        from lumen.runtime import CognitionRuntime
        from types import SimpleNamespace
        settings=Settings(supabase_url='http://db',supabase_service_role_key='service',
                          ollama_url='http://ollama',conversation_model='default')
        runtime=CognitionRuntime(settings,'owner-token','owner')
        runtime.db=Mock(get_companion=AsyncMock(return_value={'name':'Lumen','conversation_model':'selected'}),
            get_conversation=AsyncMock(return_value={'id':'conversation'}), get_state=AsyncMock(return_value={}),
            get_relevant_memories=AsyncMock(return_value=[{'subject':'user','content':'PRIVATE-MEMORY'}]),
            get_recent_messages=AsyncMock(return_value=[{'role':'user','content':'PRIVATE-HISTORY'}]),
            get_profile=AsyncMock(return_value={}), create_message=AsyncMock(side_effect=[{'id':'u'},{'id':'a'}]),
            touch_conversation=AsyncMock(), _request=AsyncMock(return_value=[
                {'document_id':D,'title':'Warranty','page':2,'content':'Parts covered for five years.'}]))
        runtime.provider=SimpleNamespace(name='ollama',generate=AsyncMock(return_value={
            'content':'Parts are covered for five years. [1]','model':'selected','latency_ms':5,
            'tokens_in':10,'tokens_out':15}),generate_stream=AsyncMock())
        with patch('lumen.runtime.handle_action',AsyncMock(return_value=None)), \
             patch('lumen.runtime.web_action',AsyncMock()) as web:
            result=await runtime.respond(C,'conversation','Search my documents: warranty',emit=AsyncMock())
        metadata=runtime.db.create_message.call_args_list[1].args[0]['metadata']
        self.assertEqual(metadata['document_sources'][0]['page'],2)
        self.assertEqual(result.model,'selected')
        self.assertIsNone(result.observation_message_id)
        self.assertEqual(runtime.provider.generate.call_args.args[0],'selected')
        for private in ['PRIVATE-MEMORY','PRIVATE-HISTORY','owner-token']:
            self.assertNotIn(private,str(runtime.provider.generate.call_args))
        runtime.provider.generate_stream.assert_not_awaited()
        web.assert_not_awaited()
        self.assertEqual(runtime.db._request.call_count,1)


class SelectedDocument(unittest.IsolatedAsyncioTestCase):
    async def test_generic_explanation_reads_selected_document_without_keyword_search(self):
        db=Mock(_request=AsyncMock(side_effect=[
            [{'id':D,'title':'PSU table.pdf','page_count':1}],
            [{'page':1,'content':'RTX 5070 with Ryzen 7: recommended PSU 750W.'}]]))
        provider=Mock(generate=AsyncMock(return_value={'content':'The table recommends a PSU. [1]',
            'model':'selected','latency_ms':1,'tokens_in':1,'tokens_out':1}))
        result=await document_action(db,C,'Explain the attached document',provider,'selected',document_id=D)
        self.assertEqual(result['document_title'],'PSU table.pdf')
        self.assertIn('RTX 5070',str(provider.generate.call_args))
        self.assertIn('1 of 1 document pages',result['content'])
        self.assertEqual(db._request.call_args_list[0].kwargs['params']['companion_id'],f'eq.{C}')
        self.assertTrue(all(call.args[0]=='GET' for call in db._request.call_args_list))

    async def test_unavailable_document_rejected_before_page_read_and_model(self):
        db=Mock(_request=AsyncMock(return_value=[]));provider=Mock(generate=AsyncMock())
        with self.assertRaises(ValueError):
            await document_action(db,C,'Explain this',provider,'model',document_id=D)
        self.assertEqual(db._request.call_count,1);provider.generate.assert_not_awaited()

    async def test_selected_document_excerpts_are_bounded_and_relevant(self):
        db=Mock(_request=AsyncMock(side_effect=[
            [{'id':D,'title':'Manual.pdf','page_count':10}],
            [{'page':i,'content':('Warranty covers five years.' if i==10 else 'Introduction and overview. ')*200} for i in range(1,11)]]))
        provider=Mock(generate=AsyncMock(return_value={'content':'Warranty lasts five years. [1]',
            'model':'local','latency_ms':1,'tokens_in':1,'tokens_out':1}))
        result=await document_action(db,C,'What does the warranty cover?',provider,'model',document_id=D)
        self.assertEqual(result['document_sources'][0]['page'],10)
        self.assertLessEqual(len(result['document_sources']),6)
        self.assertTrue(all(len(source['excerpt'])<=2000 for source in result['document_sources']))

    def test_request_validates_document_id(self):
        from lumen.schemas import RespondRequest
        from pydantic import ValidationError
        with self.assertRaises(ValidationError):
            RespondRequest(companion_id=C,message='Explain',document_id='bad-id')


class SelectedDocumentRuntime(unittest.IsolatedAsyncioTestCase):
    async def test_selected_document_chat_persists_attachment_and_page_sources(self):
        from lumen.runtime import CognitionRuntime
        from types import SimpleNamespace
        settings=Settings(supabase_url='http://db',supabase_service_role_key='service',
                          ollama_url='http://ollama',conversation_model='default')
        runtime=CognitionRuntime(settings,'owner-token','owner')
        runtime.db=Mock(get_companion=AsyncMock(return_value={'name':'Lumen','conversation_model':'selected'}),
            get_conversation=AsyncMock(return_value={'id':'conversation'}), get_state=AsyncMock(return_value={}),
            get_relevant_memories=AsyncMock(return_value=[{'subject':'user','content':'PRIVATE-MEMORY'}]),
            get_recent_messages=AsyncMock(return_value=[{'role':'user','content':'PRIVATE-HISTORY'}]),
            get_profile=AsyncMock(return_value={}), create_message=AsyncMock(side_effect=[{'id':'u'},{'id':'a'}]),
            touch_conversation=AsyncMock(), _request=AsyncMock(side_effect=[
                [{'id':D,'title':'Warranty','page_count':2}],
                [{'id':D,'title':'Warranty','page_count':2}],
                [{'page':2,'content':'Parts covered for five years.'}]]))
        runtime.provider=SimpleNamespace(name='ollama',generate=AsyncMock(return_value={
            'content':'Parts are covered for five years. [1]','model':'selected','latency_ms':5,
            'tokens_in':10,'tokens_out':15}),generate_stream=AsyncMock())
        with patch('lumen.runtime.handle_action',AsyncMock(return_value=None)), \
             patch('lumen.runtime.web_action',AsyncMock()) as web:
            result=await runtime.respond(C,'conversation','Explain this document',emit=AsyncMock(),document_id=D)
        metadata=runtime.db.create_message.call_args_list[1].args[0]['metadata']
        self.assertEqual(metadata['document_sources'][0]['page'],2)
        self.assertEqual(result.model,'selected')
        self.assertIsNone(result.observation_message_id)
        self.assertEqual(runtime.provider.generate.call_args.args[0],'selected')
        for private in ['PRIVATE-MEMORY','PRIVATE-HISTORY','owner-token']:
            self.assertNotIn(private,str(runtime.provider.generate.call_args))
        runtime.provider.generate_stream.assert_not_awaited()
        web.assert_not_awaited()
        self.assertEqual(runtime.db._request.call_count,3)
        user_metadata=runtime.db.create_message.call_args_list[0].args[0]['metadata']
        self.assertEqual(user_metadata['document_id'],D)
        self.assertEqual(user_metadata['document_title'],'Warranty')

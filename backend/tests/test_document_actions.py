import json
import httpx
import unittest
from datetime import datetime,timedelta,timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock,Mock,patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from lumen.auth import AuthUser,require_user
from lumen.document_actions import router,action_kind,prepare_draft,draft_key
from lumen.documents import document_action
from lumen.runtime import CognitionRuntime

C='11111111-1111-4111-8111-111111111111'
D='22222222-2222-4222-8222-222222222222'
M='33333333-3333-4333-8333-333333333333'
CONV='44444444-4444-4444-8444-444444444444'
SOURCE={'number':1,'document_id':D,'title':'Job scope.pdf','page':2,'excerpt':'Scope includes foundation treatment and a retreat-only warranty. Repairs are excluded.'}
DRAFT={'title':'Prepare for the job','body':'Check access for the foundation work. [1]',
       'checklist':[{'text':'Confirm access to the foundation. [1]','done':True}]}

class Generation(unittest.IsolatedAsyncioTestCase):
    async def test_note_uses_note_schema_and_accepts_title_body_without_checklist(self):
        provider=Mock(structured=AsyncMock(return_value=json.dumps({'title':'Job details','body':'Repairs are excluded. [1]'})))
        result=await prepare_draft(provider,'local','Draft a note',[SOURCE],'note')
        self.assertEqual(result['document_action_draft']['checklist'],[])
        self.assertEqual(result['document_action_draft']['kind'],'note')
        schema=provider.structured.call_args.args[2]
        self.assertEqual(schema['required'],['title','body'])
        self.assertEqual(schema['properties']['checklist']['maxItems'],0)

    async def test_note_retry_requires_body_citations_and_remains_a_note(self):
        provider=Mock(structured=AsyncMock(side_effect=[json.dumps({'title':'Details [1]','body':'Repairs are excluded.'}),json.dumps({'title':'Details','body':'Repairs are excluded. [1]'})]))
        with self.assertLogs('lumen.document_actions',level='WARNING') as logs:
            result=await prepare_draft(provider,'local','Draft a note',[SOURCE],'note')
        self.assertEqual(result['document_action_draft']['kind'],'note')
        self.assertIn('kind=note stage=body_citations',' '.join(logs.output))
        self.assertIn('title and body only',provider.structured.call_args.args[1][-1]['content'])

    async def test_invalid_citations_retry_once_without_fabricating_references(self):
        provider=Mock(structured=AsyncMock(side_effect=[json.dumps({**DRAFT,'body':'Missing citations'}),json.dumps(DRAFT)]))
        result=await prepare_draft(provider,'local','Make a checklist',[SOURCE],'list')
        self.assertIn('document_action_draft',result)
        self.assertEqual(provider.structured.await_count,2)
        self.assertEqual(provider.structured.call_args.kwargs,{'max_tokens':4096,'timeout':600})

    async def test_fenced_json_and_provider_failure_are_distinguished(self):
        provider=Mock(structured=AsyncMock(return_value='```json\n'+json.dumps(DRAFT)+'\n```'))
        self.assertIn('document_action_draft',await prepare_draft(provider,'local','Make a checklist',[SOURCE],'list'))
        for error,word in [(httpx.ReadTimeout('private detail'),'timed out'),(httpx.ConnectError('private detail'),'service')]:
            provider=Mock(structured=AsyncMock(side_effect=error))
            with self.assertLogs('lumen.document_actions',level='WARNING') as logs:
                result=await prepare_draft(provider,'local','Make a checklist',[SOURCE],'list')
            self.assertIn(word,result['content']);self.assertNotIn('document_action_draft',result)
            self.assertEqual(provider.structured.await_count,1)
            self.assertNotIn('private detail',' '.join(logs.output))
            self.assertNotIn(SOURCE['excerpt'],' '.join(logs.output))

    async def test_runtime_persists_draft_without_actions_or_memory_writes(self):
        runtime=CognitionRuntime.__new__(CognitionRuntime)
        runtime.settings=SimpleNamespace(conversation_model='local',memory_observations_enabled=True)
        runtime.user_id='owner'
        runtime.provider=Mock(name='ollama');runtime.provider.name='ollama'
        runtime.db=Mock(get_companion=AsyncMock(return_value={'name':'Lumen'}),
            get_conversation=AsyncMock(return_value={'id':CONV}),get_state=AsyncMock(return_value={}),
            get_relevant_memories=AsyncMock(return_value=[]),get_recent_messages=AsyncMock(return_value=[]),
            get_profile=AsyncMock(return_value={}),create_message=AsyncMock(return_value={'id':M}),
            touch_conversation=AsyncMock(),_request=AsyncMock(),remember=AsyncMock())
        action={'content':'Draft ready for review.','document_action_draft':{'kind':'list',**DRAFT},'document_sources':[SOURCE]}
        with patch('lumen.runtime.selected_document',AsyncMock()),patch('lumen.runtime.document_action',AsyncMock(return_value=action)),patch('lumen.runtime.handle_action',AsyncMock()) as ordinary:
            await runtime.respond(C,CONV,'Create a checklist from this document.',document_id=D)
        ordinary.assert_not_awaited();runtime.db.remember.assert_not_awaited();runtime.db._request.assert_not_awaited()
        metadata=runtime.db.create_message.call_args_list[1].args[0]['metadata']
        self.assertEqual(metadata['document_action_draft'],action['document_action_draft'])
        self.assertEqual(metadata['document_sources'],[SOURCE])

    def test_intent_requires_explicit_request(self):
        for text,kind in [('Make me a prep checklist from this proposal','list'),('Draft a note','note'),('Can you create a follow-up reminder?','reminder')]:
            self.assertEqual(action_kind(text),kind)
        for text in ['Explain this proposal','The document says create a checklist','Do not create a checklist','What is a note?']:
            self.assertIsNone(action_kind(text))

    async def test_draft_is_grounded_readonly_and_dates_are_not_generated(self):
        provider=Mock(structured=AsyncMock(return_value=json.dumps(DRAFT)))
        result=await prepare_draft(provider,'selected','Make a checklist',[SOURCE],'list')
        self.assertFalse(result['document_action_draft']['checklist'][0]['done'])
        self.assertNotIn('due_at',result['document_action_draft'])
        self.assertIn('Nothing has been saved',result['content'])
        self.assertEqual(provider.structured.call_args.args[0],'selected')
        payload=json.loads(provider.structured.call_args.args[1][1]['content'])
        self.assertEqual(set(payload),{'requested_kind','question','sources'})
        self.assertIn('untrusted data',provider.structured.call_args.args[1][0]['content'])

    async def test_invalid_references_or_model_output_cannot_be_saved(self):
        for raw in ['not json',json.dumps({**DRAFT,'body':'Invented [99]'}),json.dumps({**DRAFT,'checklist':[]}),json.dumps({**DRAFT,'title':'https://untrusted.example'})]:
            result=await prepare_draft(Mock(structured=AsyncMock(return_value=raw)),'model','Make a checklist',[SOURCE],'list')
            self.assertNotIn('document_action_draft',result)
            self.assertIn('Nothing was saved',result['content'])

    async def test_document_request_produces_draft_without_item_write(self):
        db=Mock(_request=AsyncMock(side_effect=[[{'id':D,'title':'Job scope.pdf','page_count':2}],
            [{'page':2,'content':SOURCE['excerpt']}]]))
        provider=Mock(structured=AsyncMock(return_value=json.dumps(DRAFT)),generate=AsyncMock())
        result=await document_action(db,C,'Create a checklist from this document.',provider,'local',document_id=D)
        self.assertEqual(result['document_action_draft']['kind'],'list')
        self.assertTrue(all(call.args[0]=='GET' for call in db._request.call_args_list))
        provider.generate.assert_not_awaited()

class SaveAPI(unittest.TestCase):
    def setUp(self):
        app=FastAPI();app.include_router(router)
        app.dependency_overrides[require_user]=lambda:AuthUser('owner','token')
        self.app=app;self.client=TestClient(app);self.addCleanup(self.client.close)
        self.message={'id':M,'conversation_id':CONV,'metadata':{'document_action_draft':{'kind':'list',**DRAFT},'document_sources':[SOURCE]}}
        self.db=Mock(_request=AsyncMock())
        patched=patch('lumen.document_actions.companion_db',AsyncMock(return_value=self.db));patched.start();self.addCleanup(patched.stop)
        self.path=f'/v0.6/documents/companions/{C}/drafts/{M}'
        self.body={'title':'Edited checklist','body':'Edited notes','checklist':[{'text':'Edited step','done':False}],'timezone':'America/Phoenix'}

    def test_explicit_save_preserves_owner_sources_edits_and_stable_key(self):
        self.db._request.side_effect=[[self.message],[]]
        with patch('lumen.document_actions.create_item',AsyncMock(return_value={'id':'saved'})) as create:
            response=self.client.post(self.path+'/save',json=self.body)
        self.assertEqual(response.status_code,200)
        payload=create.call_args.args[2]
        self.assertEqual(payload.title,'Edited checklist')
        self.assertEqual(payload.source_documents[0].document_id.hex,D.replace('-',''))
        self.assertEqual(str(payload.source_conversation_id),CONV)
        self.assertEqual(payload.request_key,draft_key(M))
        self.assertEqual(self.db._request.call_args_list[0].kwargs['params']['companion_id'],f'eq.{C}')

    def test_repeat_save_returns_same_item_and_status_survives_reload(self):
        existing={'id':'same','status':'archived'}
        self.db._request.side_effect=[[self.message],[existing]]
        with patch('lumen.document_actions.create_item',AsyncMock()) as create:
            self.assertEqual(self.client.post(self.path+'/save',json=self.body).json(),existing)
            create.assert_not_awaited()
        self.db._request.side_effect=[[self.message],[existing]]
        self.assertEqual(self.client.get(self.path).json(),{'item':existing})

    def test_other_message_not_found_and_auth_required(self):
        self.db._request.return_value=[]
        with patch('lumen.document_actions.create_item',AsyncMock()) as create:
            self.assertEqual(self.client.post(self.path+'/save',json=self.body).status_code,404)
            create.assert_not_awaited()
        self.app.dependency_overrides.clear()
        self.assertEqual(self.client.post(self.path+'/save',json=self.body).status_code,401)

    def test_reminder_requires_future_time_and_valid_timezone(self):
        self.message['metadata']['document_action_draft']['kind']='reminder'
        for fields in [{},{'due_at':'2000-01-01T00:00:00Z'},{'due_at':'2030-01-01T09:00:00'},{'timezone':'invalid'}]:
            self.db._request.side_effect=[[self.message],[]]
            with patch('lumen.document_actions.create_item',AsyncMock()) as create:
                self.assertEqual(self.client.post(self.path+'/save',json={**self.body,**fields}).status_code,422)
                create.assert_not_awaited()
        self.db._request.side_effect=[[self.message],[]]
        with patch('lumen.document_actions.create_item',AsyncMock(return_value={'id':'scheduled'})) as create:
            response=self.client.post(self.path+'/save',json={**self.body,'due_at':(datetime.now(timezone.utc)+timedelta(days=1)).isoformat()})
        self.assertEqual(response.status_code,200)
        self.assertEqual(create.call_args.args[2].timezone,'America/Phoenix')
        self.assertEqual(create.call_args.args[2].checklist,[])

    def test_empty_list_or_forged_kind_or_source_rejected(self):
        for change in ['empty','kind','source']:
            self.message['metadata']['document_action_draft']['kind']='unknown' if change=='kind' else 'list'
            self.message['metadata']['document_sources']=[] if change=='source' else [SOURCE]
            self.db._request.side_effect=[[self.message],[]]
            response=self.client.post(self.path+'/save',json={**self.body,'checklist':[] if change=='empty' else self.body['checklist']})
            self.assertEqual(response.status_code,422)

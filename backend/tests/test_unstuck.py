import json
import unittest
from unittest.mock import Mock, AsyncMock, patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from lumen.auth import AuthUser, require_user
from lumen.unstuck import Plan, router, unstuck_request, unstuck_action, plan_key
from lumen.my_day import router as day_router, DayItemCreate

C='11111111-1111-4111-8111-111111111111'
I='22222222-2222-4222-8222-222222222222'
M='33333333-3333-4333-8333-333333333333'
D={'title':'Tidy desk','body':'Keep it manageable.','steps':['Pick one paper.','Put it in a folder.']}

class UnstuckGeneration(unittest.IsolatedAsyncioTestCase):
    def test_intent_and_validation(self):
        for text in ['Help me get unstuck: paperwork','Good morning Lumen! help me get unstuck. paperwork','“Help me break this down: paperwork”']:
            self.assertEqual(unstuck_request(text),'paperwork')
        for text in ['Don’t help me get unstuck: paperwork','Someone said help me get unstuck: paperwork','I might need help later','How does help me get unstuck work?']:
            self.assertIsNone(unstuck_request(text))
        self.assertEqual(unstuck_request('help me get unstuck'),'')
        for changes in [{'steps':[]},{'steps':['x']*6},{'steps':[' ']},{'steps':['x'*301]},{'title':' '},{'extra':'no'}]:
            with self.assertRaises(ValueError):Plan.model_validate({**D,**changes})
        with self.assertRaises(ValueError):DayItemCreate(kind='note',title='x',step_mode=True,request_key=M)
    async def test_generation_is_draft_only_and_uses_selected_model(self):
        provider=Mock(structured=AsyncMock(return_value=json.dumps(D)))
        action=await unstuck_action('Help me get unstuck: paperwork','Lumen',provider,'selected')
        self.assertEqual(action['unstuck_draft'],D)
        self.assertNotIn('item',action)
        self.assertEqual(provider.structured.call_args.args[0],'selected')
        self.assertFalse(provider.structured.call_args.kwargs['think'])
    async def test_missing_context_and_failed_schema_never_produce_save(self):
        provider=Mock(structured=AsyncMock(return_value='{"title":"x","steps":[]}'))
        action=await unstuck_action('help me get unstuck','Lumen',provider,'selected')
        self.assertNotIn('unstuck_draft',action);provider.structured.assert_not_awaited()
        action=await unstuck_action('help me get unstuck: paperwork','Lumen',provider,'selected')
        self.assertNotIn('unstuck_draft',action);self.assertIn('Nothing was saved',action['content'])
    async def test_runtime_persists_draft_metadata_without_my_day_or_memory_write(self):
        from lumen.runtime import CognitionRuntime
        r=CognitionRuntime.__new__(CognitionRuntime);r.settings=Mock(conversation_model='selected',memory_observations_enabled=True)
        r.provider=Mock(structured=AsyncMock(return_value=json.dumps(D)),generate=AsyncMock());r.provider.name='ollama'
        r.db=Mock(get_companion=AsyncMock(return_value={'name':'Lumen'}),get_conversation=AsyncMock(return_value={'id':I}),
            get_state=AsyncMock(return_value={}),get_relevant_memories=AsyncMock(return_value=[]),get_recent_messages=AsyncMock(return_value=[]),
            create_message=AsyncMock(return_value={'id':M}),touch_conversation=AsyncMock(),remember=AsyncMock(),_request=AsyncMock())
        reply=await r.respond(C,I,'help me get unstuck: paperwork')
        self.assertEqual(reply.model,'unstuck-action');self.assertIsNone(reply.observation_message_id)
        self.assertEqual(r.db.create_message.call_args.args[0]['metadata']['unstuck_draft'],D)
        r.db._request.assert_not_awaited();r.db.remember.assert_not_awaited();r.provider.generate.assert_not_awaited()

class UnstuckRoutes(unittest.TestCase):
    def setUp(self):
        app=FastAPI();app.include_router(router);app.include_router(day_router);self.app=app
        app.dependency_overrides[require_user]=lambda:AuthUser('owner','token')
        self.db=Mock(get_conversation=AsyncMock(return_value={'id':I}),_request=AsyncMock())
        self.message={'id':M,'conversation_id':I,'metadata':{'unstuck_draft':D}}
        self.patcher=patch('lumen.unstuck.companion_db',AsyncMock(return_value=self.db));self.patcher.start();self.addCleanup(self.patcher.stop)
        self.client=TestClient(app);self.addCleanup(self.client.close);self.path=f'/v0.8/unstuck/companions/{C}/drafts/{M}'
    def test_save_scope_and_idempotent_existing_receipt(self):
        saved={'id':I,'kind':'project','step_mode':True}
        self.db._request.side_effect=[[self.message],[],[saved]]
        self.assertEqual(self.client.post(self.path+'/save',json=D).json(),saved)
        data=self.db._request.call_args.kwargs['json']
        self.assertEqual(data['companion_id'],C);self.assertEqual(data['source_conversation_id'],I)
        self.assertEqual(data['request_key'],str(plan_key(M)));self.assertTrue(data['step_mode'])
        self.assertEqual(data['checklist'][0],{'text':'Pick one paper.','done':False})
        self.db._request.side_effect=[[self.message],[saved]]
        self.assertEqual(self.client.post(self.path+'/save',json={**D,'title':'retry edit'}).json(),saved)
        self.assertEqual(self.db._request.call_args.args[0],'GET')
    def test_missing_foreign_draft_and_login(self):
        self.db._request.return_value=[]
        self.assertEqual(self.client.post(self.path+'/save',json=D).status_code,404)
        self.assertEqual(self.db._request.call_args.kwargs['params']['companion_id'],'eq.'+C)
        self.app.dependency_overrides.clear();self.assertEqual(self.client.get(self.path).status_code,401)
    def test_step_update_and_uncertain_write(self):
        with patch('lumen.my_day.companion_db',AsyncMock(return_value=self.db)):
            self.db._request.return_value=[{'id':I,'step_mode':True}]
            path=f'/v0.3/my-day/companions/{C}/items/{I}/step'
            self.assertEqual(self.client.post(path,json={'index':0,'text':'Pick one paper.'}).status_code,200)
            self.assertEqual(self.db._request.call_args.kwargs['json'],{'p_companion_id':C,'p_item_id':I,'p_index':0,'p_text':'Pick one paper.'})
            self.db._request.side_effect=RuntimeError('offline')
            self.assertEqual(self.client.post(path,json={'index':0,'text':'Pick one paper.'}).status_code,409)
            self.assertEqual(self.client.post(path,json={'index':-1,'text':'x'}).status_code,422)

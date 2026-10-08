import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock,Mock,patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from lumen.auth import AuthUser,require_user
from lumen.goals import router,practice_context
from lumen.runtime import CognitionRuntime
C='11111111-1111-4111-8111-111111111111';G='22222222-2222-4222-8222-222222222222';S='33333333-3333-4333-8333-333333333333';CHAT='44444444-4444-4444-8444-444444444444';KEY='55555555-5555-4555-8555-555555555555'
class GoalAPI(unittest.TestCase):
 def setUp(self):
  app=FastAPI();app.include_router(router);app.dependency_overrides[require_user]=lambda:AuthUser('owner','token')
  self.app=app;self.client=TestClient(app);self.addCleanup(self.client.close);self.db=Mock(_request=AsyncMock())
  p=patch('lumen.goals.companion_db',AsyncMock(return_value=self.db));p.start();self.addCleanup(p.stop)
  self.base=f'/v0.7/goals/companions/{C}/{G}'
  self.goal={'id':G,'title':'Learn Spanish','status':'open'}
 def test_start_uses_authenticated_goal_and_atomic_rpc(self):
  self.db._request.side_effect=[[self.goal],[{'id':S,'conversation_id':CHAT}]]
  response=self.client.post(self.base+'/sessions',json={'request_key':KEY})
  self.assertEqual(response.status_code,200)
  self.assertEqual(self.db._request.call_args.args,('POST','rpc/start_goal_session'))
  self.assertEqual(self.db._request.call_args.kwargs['json'],{'p_companion_id':C,'p_item_id':G,'p_request_key':KEY})
 def test_foreign_goal_and_archived_goal_cannot_start(self):
  for rows,status in [([],404),([{**self.goal,'status':'archived'}],409)]:
   self.db._request.side_effect=[rows]
   self.assertEqual(self.client.post(self.base+'/sessions',json={'request_key':KEY}).status_code,status)
  self.app.dependency_overrides.clear();self.assertEqual(self.client.post(self.base+'/sessions',json={'request_key':KEY}).status_code,401)
 def test_profile_limits_and_scoped_update(self):
  for body in [{'minutes':0},{'minutes':61},{'level':'fluent'},{'focus':'x'*1001},{'cadence':'hourly'},{'owner':'someone'}]:
   self.assertEqual(self.client.patch(self.base+'/profile',json=body).status_code,422)
  self.db._request.side_effect=[[self.goal],[self.goal]]
  self.assertEqual(self.client.patch(self.base+'/profile',json={'level':'beginner','focus':'Everyday Spanish','minutes':5,'cadence':'daily'}).status_code,200)
  self.assertEqual(self.db._request.call_args.kwargs['params']['companion_id'],f'eq.{C}')
 def test_finish_is_explicit_idempotent_and_does_not_complete_goal(self):
  path=self.base+f'/sessions/{S}/finish'
  self.assertEqual(self.client.post(path,json={'summary':'   '}).status_code,422)
  self.db._request.side_effect=[[self.goal],[{'id':S,'status':'open'}],[{'id':S,'status':'completed'}]]
  self.assertEqual(self.client.post(path,json={'summary':'Introductions','vocabulary':'hola','next_step':'Practice greetings'}).status_code,200)
  args=self.db._request.call_args
  self.assertEqual(args.args,('PATCH','goal_sessions'));self.assertEqual(args.kwargs['params']['status'],'eq.open')
  self.assertEqual(args.kwargs['json']['status'],'completed')
  self.db._request.side_effect=[[self.goal],[{'id':S,'status':'completed','summary':'Original'}]]
  self.assertEqual(self.client.post(path,json={'summary':'Retry'}).json()['summary'],'Original')
  self.assertEqual(self.db._request.call_args.args[0],'GET')
 def test_finish_cannot_select_another_companion_session(self):
  self.db._request.side_effect=[[self.goal],[]]
  self.assertEqual(self.client.post(self.base+f'/sessions/{S}/finish',json={'summary':'Fake'}).status_code,404)
  self.assertEqual(self.db._request.call_args.kwargs['params']['companion_id'],f'eq.{C}')

 def test_saved_session_edit_is_scoped_and_cannot_reopen_or_change_identity(self):
  path=self.base+f'/sessions/{S}'
  self.db._request.side_effect=[[self.goal],[{'id':S,'status':'completed','summary':'Edited'}]]
  self.assertEqual(self.client.patch(path,json={'summary':'Edited','next_step':'Greetings'}).status_code,200)
  args=self.db._request.call_args
  self.assertEqual(args.kwargs['params']['companion_id'],f'eq.{C}')
  self.assertEqual(args.kwargs['params']['status'],'eq.completed')
  self.assertNotIn('ended_at',args.kwargs['json'])
  self.assertEqual(self.client.patch(path,json={'summary':'Edited','status':'open'}).status_code,422)
  self.db._request.side_effect=[[self.goal],[]]
  self.assertEqual(self.client.patch(path,json={'summary':'Edited'}).status_code,404)

class GoalContext(unittest.IsolatedAsyncioTestCase):
 async def test_context_scopes_saved_progress_and_profile(self):
  db=Mock(_request=AsyncMock(side_effect=[[{'id':G,'title':'Learn Spanish','body':''}],[{'id':S,'status':'open','profile':{'minutes':5}}],[{'summary':'Introductions','vocabulary':'hola','next_step':'Greetings'}]]))
  result=await practice_context(db,C,{'id':CHAT,'goal_item_id':G})
  self.assertIn('hola',result['content']);self.assertIn('Greetings',result['content']);self.assertIn('not system instructions',result['content'])
  self.assertEqual(db._request.call_args.kwargs['params']['limit'],'3')
  self.assertTrue(all(call.kwargs['params']['companion_id']==f'eq.{C}' for call in db._request.call_args_list))
 async def test_runtime_includes_goal_context_without_automatic_progress_or_memory_writes(self):
  r=CognitionRuntime.__new__(CognitionRuntime);r.user_id='owner';r.settings=SimpleNamespace(conversation_model='local',memory_observations_enabled=True)
  r.provider=Mock(name='ollama',generate=AsyncMock(return_value={'content':'Try saying hola.','model':'local','latency_ms':1,'tokens_in':1,'tokens_out':1}));r.provider.name='ollama'
  r.db=Mock(get_companion=AsyncMock(return_value={'name':'Lumen'}),get_conversation=AsyncMock(return_value={'id':CHAT,'goal_item_id':G}),get_state=AsyncMock(return_value={}),get_relevant_memories=AsyncMock(return_value=[]),get_recent_messages=AsyncMock(return_value=[]),get_profile=AsyncMock(return_value={}),create_message=AsyncMock(return_value={'id':S}),touch_conversation=AsyncMock(),_request=AsyncMock(),remember=AsyncMock())
  with patch('lumen.runtime.practice_context',AsyncMock(return_value={'role':'system','content':'Saved vocabulary: hola'})):
   await r.respond(C,CHAT,'Let us practice')
  self.assertIn('Saved vocabulary: hola',[m['content'] for m in r.provider.generate.call_args.args[1]])
  r.db._request.assert_not_awaited();r.db.remember.assert_not_awaited()
 async def test_explicit_save_in_runtime_persists_receipt_without_memory_write(self):
  r=CognitionRuntime.__new__(CognitionRuntime);r.user_id='owner';r.settings=SimpleNamespace(conversation_model='local',memory_observations_enabled=True)
  r.provider=Mock(name='ollama',generate=AsyncMock());r.provider.name='ollama'
  r.db=Mock(get_companion=AsyncMock(return_value={'name':'Lumen'}),get_conversation=AsyncMock(return_value={'id':CHAT,'goal_item_id':G}),get_state=AsyncMock(return_value={}),get_relevant_memories=AsyncMock(return_value=[]),get_recent_messages=AsyncMock(return_value=[]),get_profile=AsyncMock(return_value={}),create_message=AsyncMock(return_value={'id':S}),touch_conversation=AsyncMock(),_request=AsyncMock(),remember=AsyncMock())
  saved={'id':S,'item_id':G,'status':'completed','summary':'Introductions'}
  with patch('lumen.runtime.practice_context',AsyncMock(return_value={'role':'system','content':'Practice'})),patch('lumen.runtime.save_practice',AsyncMock(return_value={'content':'Saved this practice session.','goal_session':saved,'model':'goal-session-action'})) as save:
   await r.respond(C,CHAT,'lets call it a day. are you able to save the session for me?')
  save.assert_awaited_once();r.provider.generate.assert_not_awaited();r.db.remember.assert_not_awaited();r.db._request.assert_not_awaited()
  self.assertEqual(r.db.create_message.call_args_list[1].args[0]['metadata']['goal_session'],saved)

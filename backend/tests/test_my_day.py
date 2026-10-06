import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, Mock, patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from lumen.auth import AuthUser, require_user
from lumen.my_day import router, parse_action, handle_action, reminder_followup
from lumen.config import Settings

C='11111111-1111-4111-8111-111111111111'
I='22222222-2222-4222-8222-222222222222'
K='33333333-3333-4333-8333-333333333333'
NOW=datetime(2026,10,6,20,0,tzinfo=timezone.utc)

class ReminderFollowups(unittest.TestCase):
 def test_long_prompt_schema_accepts_64000_and_rejects_overflow(self):
  from lumen.schemas import RespondRequest
  self.assertEqual(len(RespondRequest(companion_id=C,message='x'*64000).message),64000)
  with self.assertRaises(ValueError): RespondRequest(companion_id=C,message='x'*64001)
 def pending(self, text='remind me tomorrow at 9 to call the mechanic', expires='2026-10-06T20:30:00+00:00'):
  return [{'role':'assistant','metadata':{'pending_reminder':{'text':text,'expires_at':expires}}}]
 def test_period_preserves_requested_task(self):
  resolved=reminder_followup('PM',self.pending(),NOW)
  self.assertEqual(parse_action(resolved,'America/Phoenix',NOW)['title'],'call the mechanic')
  self.assertEqual(parse_action(resolved,'America/Phoenix',NOW)['due_at'],'2026-10-07T21:00:00-07:00')
 def test_schedule_answer_preserves_task(self):
  resolved=reminder_followup('tomorrow at 9 am',self.pending('remind me to call the mechanic'),NOW)
  self.assertEqual(resolved,'remind me tomorrow at 9 am to call the mechanic')
 def test_unrelated_expired_and_interrupted_answers_do_not_execute(self):
  self.assertEqual(reminder_followup('yes',self.pending(),NOW),'yes')
  self.assertEqual(reminder_followup('PM',self.pending(expires='2026-10-06T19:00:00+00:00'),NOW),'PM')
  self.assertEqual(reminder_followup('PM',[{'role':'user'},*self.pending()],NOW),'PM')
  self.assertEqual(reminder_followup('PM',[],NOW),'PM')
 def test_cancellation_is_explicit(self):
  self.assertEqual(reminder_followup('never mind',self.pending(),NOW),'cancel pending reminder')

class ActionParsing(unittest.TestCase):
 def test_no_incidental_writes(self):
  for text in ['I need to call the mechanic tomorrow.','I might make a shopping list','Don’t remind me tomorrow at 9 am to call','What would you put on a shopping list?','Tell me a story']:
   self.assertIsNone(parse_action(text,'America/Phoenix',NOW),text)
 def test_explicit_captures(self):
  for text,kind in [('add a task: call the mechanic','task'),('save a note: draft text','note'),('start a project: garden','project'),('set a goal: Spanish','goal')]:
   self.assertEqual(parse_action(text,'America/Phoenix',NOW)['kind'],kind)
  self.assertEqual(parse_action('create a shopping list: milk, eggs','UTC',NOW)['checklist'],[{'text':'milk','done':False},{'text':'eggs','done':False}])
 def test_timezone_relative_and_ambiguous_times(self):
  result=parse_action('remind me tomorrow at 9 am to call the mechanic','America/Phoenix',NOW)
  self.assertEqual(result['due_at'],'2026-10-07T09:00:00-07:00')
  self.assertEqual(parse_action('remind me in 30 minutes to stretch','America/Phoenix',NOW)['due_at'],'2026-10-06T20:30:00+00:00')
  self.assertIn('AM or PM',parse_action('remind me tomorrow at 9 to call','UTC',NOW)['clarify'])
  for text in ['remind me today at 9 am to call','remind me tomorrow at 25:30 to call','remind me on 2026-02-30 at 9 am to call','remind me to do it someday']:
   self.assertIn('clarify',parse_action(text,'UTC',NOW))
 def test_dst_skipped_and_repeated_times_need_clarification(self):
  spring=datetime(2026,3,7,18,tzinfo=timezone.utc)
  fall=datetime(2026,10,31,18,tzinfo=timezone.utc)
  self.assertIn('clarify',parse_action('remind me tomorrow at 2:30 am to call','America/New_York',spring))
  self.assertIn('clarify',parse_action('remind me tomorrow at 1:30 am to call','America/New_York',fall))
 def test_invalid_timezone(self):
  with self.assertRaises(ValueError):parse_action('remind me in 5 minutes to call','invalid/zone',NOW)

class MyDayRoutes(unittest.TestCase):
 def setUp(self):
  app=FastAPI();app.include_router(router);self.app=app
  app.dependency_overrides[require_user]=lambda:AuthUser('owner','user-token')
  self.db=Mock(get_companion=AsyncMock(return_value={'id':C}),get_conversation=AsyncMock(return_value={'id':I}),_request=AsyncMock(return_value=[{'id':I,'kind':'task'}]))
  self.settings=Settings(supabase_url='http://db',supabase_service_role_key='test')
  self.repository=patch('lumen.my_day.SupabaseRepository',return_value=self.db);self.repository.start();self.addCleanup(self.repository.stop)
  config=patch('lumen.my_day.get_settings',return_value=self.settings);config.start();self.addCleanup(config.stop)
  self.client=TestClient(app);self.addCleanup(self.client.close)
  self.root='/v0.3/my-day/companions/'+C
 def test_create_and_idempotent_retry(self):
  data={'kind':'task','title':'Call mechanic','request_key':K}
  self.assertEqual(self.client.post(self.root,json=data).status_code,200)
  self.assertEqual(self.db._request.call_args.kwargs['json']['companion_id'],C)
  self.db._request.side_effect=[[],[{'id':I,'kind':'task'}]]
  self.assertEqual(self.client.post(self.root,json=data).json()['id'],I)
  self.assertEqual(self.db._request.call_args.args,('GET','my_day_items'))
 def test_scheduled_time_required_and_timezone_checked(self):
  for changes in [{},{'due_at':'2026-10-07T09:00:00'},{'due_at':'2026-10-07T09:00:00-07:00','timezone':'broken'}]:
   self.assertEqual(self.client.post(self.root,json={'kind':'reminder','title':'Call','request_key':K,**changes}).status_code,422)
  self.db._request.assert_not_awaited()
 def test_other_owner_denied_before_queries(self):
  self.db.get_companion.return_value=None
  for method,url,body in [('get',self.root,None),('post',self.root,{'kind':'task','title':'Call','request_key':K}),('get',self.root+'/due',None),('get',self.root+'/search?q=movie',None)]:
   response=getattr(self.client,method)(url,**({'json':body} if body else {}));self.assertEqual(response.status_code,404)
  self.db._request.assert_not_awaited()
 def test_update_checks_item_companion_and_keeps_reminder_time(self):
  self.db._request.return_value=[]
  self.assertEqual(self.client.patch(self.root+'/items/'+I,json={'status':'done'}).status_code,404)
  self.db._request.return_value=[{'id':I,'kind':'reminder'}]
  self.assertEqual(self.client.patch(self.root+'/items/'+I,json={'due_at':None}).status_code,400)
  self.assertEqual(self.db._request.call_args.kwargs['params']['companion_id'],'eq.'+C)
 def test_search_is_scoped_and_bounded(self):
  self.assertEqual(self.client.get(self.root+'/search?q=x').status_code,400)
  self.assertEqual(self.client.get(self.root+'/search?q=Sarah%20movie').status_code,200)
  self.assertEqual(self.db._request.call_args.kwargs['json'],{'p_companion_id':C,'p_query':'Sarah movie'})
 def test_due_and_dismiss_are_scoped(self):
  self.assertEqual(self.client.get(self.root+'/due').status_code,200)
  self.assertEqual(self.db._request.call_args.kwargs['json'],{'p_companion_id':C})
  self.db._request.return_value=[]
  self.assertEqual(self.client.post(self.root+'/alerts/'+I+'/seen',json={}).status_code,404)
 def test_source_conversation_owner_checked(self):
  self.db.get_conversation.return_value=None
  self.assertEqual(self.client.post(self.root,json={'kind':'task','title':'Call','request_key':K,'source_conversation_id':I}).status_code,404)
  self.db._request.assert_not_awaited()
 def test_login_required(self):
  self.app.dependency_overrides.clear()
  self.assertEqual(self.client.get(self.root).status_code,401)
  self.db.get_companion.assert_not_awaited()

class ActionExecution(unittest.IsolatedAsyncioTestCase):
 async def test_no_save_claim_before_a_successful_write(self):
  db=Mock(get_conversation=AsyncMock(return_value={'id':I}),_request=AsyncMock(side_effect=RuntimeError('offline')))
  with self.assertRaises(RuntimeError):await handle_action(db,C,I,'add a task: call the mechanic','UTC',K)
 async def test_success_links_card_to_persisted_item(self):
  db=Mock(get_conversation=AsyncMock(return_value={'id':I}),_request=AsyncMock(return_value=[{'id':I,'companion_id':C,'kind':'task','title':'Call mechanic'}]))
  result=await handle_action(db,C,I,'add a task: Call mechanic','UTC',K)
  self.assertEqual(result['item']['id'],I);self.assertIn('Saved your task',result['content'])
  self.assertEqual(db._request.call_args.kwargs['json']['request_key'],K)
 async def test_clarification_never_mutates(self):
  db=Mock(_request=AsyncMock())
  result=await handle_action(db,C,I,'remind me tomorrow at 9 to call','UTC',K)
  self.assertIsNone(result['item']);db._request.assert_not_awaited()
 async def test_followup_saves_original_reminder_and_clears_pending(self):
  from datetime import timedelta
  pending=[{'role':'assistant','metadata':{'pending_reminder':{'text':'remind me tomorrow at 9 to call the mechanic',
   'expires_at':(datetime.now(timezone.utc)+timedelta(minutes=30)).isoformat()}}}]
  db=Mock(get_conversation=AsyncMock(return_value={'id':I}),_request=AsyncMock(return_value=[{'id':I,'kind':'reminder','title':'call the mechanic'}]))
  result=await handle_action(db,C,I,'PM','America/Phoenix',K,recent=pending)
  self.assertEqual(db._request.call_args.kwargs['json']['title'],'call the mechanic')
  self.assertEqual(db._request.call_args.kwargs['json']['request_key'],K)
  self.assertNotIn('pending_reminder',result)

class RuntimeActionIntegration(unittest.IsolatedAsyncioTestCase):
 async def test_chat_command_returns_card_without_model_or_memory_write(self):
  from lumen.runtime import CognitionRuntime
  from types import SimpleNamespace
  settings=SimpleNamespace(ollama_url='http://local',supabase_url='http://db',supabase_service_role_key='test',memory_observations_enabled=True)
  runtime=CognitionRuntime(settings,'token','owner');runtime.timezone='America/Phoenix';runtime.request_key=K
  runtime.db=Mock(get_companion=AsyncMock(return_value={'id':C,'name':'Lumen'}),get_conversation=AsyncMock(return_value={'id':I}),
   get_state=AsyncMock(return_value={}),get_relevant_memories=AsyncMock(return_value=[]),get_recent_messages=AsyncMock(return_value=[]),get_profile=AsyncMock(return_value={}),
   _request=AsyncMock(return_value=[{'id':I,'kind':'task','title':'Call mechanic','companion_id':C}]),
   create_message=AsyncMock(side_effect=[{'id':'user-message'},{'id':'assistant-message'}]),touch_conversation=AsyncMock())
  runtime.provider=SimpleNamespace(name='ollama',generate=AsyncMock(),generate_stream=AsyncMock())
  response=await runtime.respond(C,I,'add a task: Call mechanic')
  self.assertEqual(response.model,'my-day-action');self.assertIsNone(response.observation_message_id)
  metadata=runtime.db.create_message.call_args.args[0]['metadata'];self.assertEqual(metadata['my_day_item']['id'],I)
  runtime.provider.generate.assert_not_awaited();runtime.provider.generate_stream.assert_not_awaited()
  self.assertEqual(runtime.db._request.await_count,1)

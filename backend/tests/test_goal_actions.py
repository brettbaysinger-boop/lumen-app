import json
import unittest
from unittest.mock import AsyncMock,Mock
from lumen.goal_actions import save_session_request,save_practice
from lumen.memory import has_save_claim
C='owner-companion';G='goal';S='session';CHAT={'id':'chat','goal_item_id':G}
RECORD={'id':S,'item_id':G,'status':'open'}
TRANSCRIPT=[{'role':'assistant','content':'Try saying mucho gusto.'},{'role':'user','content':'Hola, me llamo Brett.'}]
SUMMARY={'summary':'Practiced introductions.','practice_notes':'','vocabulary':'hola; mucho gusto','next_step':'Practice a greeting.'}
class PracticeSave(unittest.IsolatedAsyncioTestCase):
 def test_only_explicit_save_intent(self):
  for text in ['save our session','Can you save this practice session?','lets call it a day. are you able to save the session for me?','Lumen, please finish and save my session']:
   self.assertTrue(save_session_request(text),text)
  for text in ['do not save our session','how do I save our session?','she said "save our session"','save our session tomorrow','lets call it a day','Are our sessions saved?']:
   self.assertFalse(save_session_request(text),text)
  self.assertTrue(save_session_request('Nova, save our session','Nova'))
 def test_future_memory_promise_is_guarded(self):
  self.assertTrue(has_save_claim("I'll keep everything we did today in my memory!"))
  self.assertFalse(has_save_claim('The conversation is available in your history.'))
 async def test_confirm_only_after_scoped_save_with_direct_json(self):
  db=Mock(_request=AsyncMock(side_effect=[[RECORD],TRANSCRIPT,[{**RECORD,**SUMMARY,'status':'completed'}]]))
  provider=Mock(structured=AsyncMock(return_value=json.dumps(SUMMARY)))
  result=await save_practice(db,C,CHAT,'save our session',provider,'selected')
  self.assertIn('Saved this practice session',result['content']);self.assertEqual(result['goal_session']['status'],'completed')
  self.assertEqual(provider.structured.call_args.kwargs,{'max_tokens':2048,'timeout':120,'think':False})
  self.assertEqual(db._request.call_args.kwargs['params']['status'],'eq.open')
  for call in db._request.call_args_list:self.assertEqual(call.kwargs['params']['companion_id'],'eq.'+C)
 async def test_repeated_save_does_not_regenerate_or_overwrite(self):
  db=Mock(_request=AsyncMock(return_value=[{**RECORD,**SUMMARY,'status':'completed'}]));provider=Mock(structured=AsyncMock())
  result=await save_practice(db,C,CHAT,'save our session',provider,'local')
  self.assertIn('already saved',result['content']);provider.structured.assert_not_awaited();self.assertEqual(db._request.await_count,1)
 async def test_model_failure_saves_literal_excerpt_without_invented_progress(self):
  db=Mock(_request=AsyncMock(side_effect=[[RECORD],TRANSCRIPT,[{**RECORD,'status':'completed','summary':'literal excerpt'}]]))
  result=await save_practice(db,C,CHAT,'save our session',Mock(structured=AsyncMock(return_value='bad JSON')),'local')
  payload=db._request.call_args.kwargs['json'];self.assertIn('Hola, me llamo Brett.',payload['summary']);self.assertEqual(payload['vocabulary'],'')
  self.assertEqual(result['goal_summary_method'],'transcript_excerpt')
 async def test_save_failure_does_not_report_success(self):
  db=Mock(_request=AsyncMock(side_effect=[[RECORD],TRANSCRIPT,RuntimeError('database unavailable')]))
  result=await save_practice(db,C,CHAT,'save our session',Mock(structured=AsyncMock(return_value=json.dumps(SUMMARY))),'local')
  self.assertNotIn('goal_session',result);self.assertIn('couldn’t confirm',result['content'])
 async def test_no_practice_or_no_messages_never_creates_session(self):
  db=Mock(_request=AsyncMock());provider=Mock(structured=AsyncMock())
  result=await save_practice(db,C,None,'save our session',provider,'local');self.assertIn('isn’t linked',result['content']);db._request.assert_not_awaited()
  db._request.side_effect=[[RECORD],[]]
  result=await save_practice(db,C,CHAT,'save our session',provider,'local');self.assertIn('Nothing was saved',result['content']);provider.structured.assert_not_awaited()
 async def test_readback_confirms_concurrent_finish(self):
  db=Mock(_request=AsyncMock(side_effect=[[RECORD],TRANSCRIPT,[],[{**RECORD,**SUMMARY,'status':'completed'}]]))
  result=await save_practice(db,C,CHAT,'save our session',Mock(structured=AsyncMock(return_value=json.dumps(SUMMARY))),'local')
  self.assertEqual(result['goal_session']['status'],'completed')
  self.assertEqual(result['goal_summary_method'],'existing')

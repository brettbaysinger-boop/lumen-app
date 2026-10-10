import json
import unittest
from unittest.mock import Mock, AsyncMock
import test_memory
from lumen.memory_turn_context import memory_turn_context, revision_ids

R='11111111-1111-4111-8111-111111111111'
M='22222222-2222-4222-8222-222222222222'
C='33333333-3333-4333-8333-333333333333'
CHAT='44444444-4444-4444-8444-444444444444'
RECENT=[{'role':'assistant','content':'I updated it to autumn.',
         'metadata':{'memory_revision':{'id':R,'kind':'correction'}}}]
REV={'id':R,'memory_id':M,'after_content':'My favorite season is autumn',
     'applied_version':1,'undone_at':'now'}
CURRENT={'id':M,'content':'My favorite season is summer','subject':'user',
         'is_active':True,'revision_version':2}

def data(context):
    return json.loads(context['content'].split('\n',1)[1])

class Context(unittest.IsolatedAsyncioTestCase):
    async def call(self,effects,memories=None,recent=None):
        db=Mock(_request=AsyncMock(side_effect=effects))
        result=await memory_turn_context(db,C,CHAT,RECENT if recent is None else recent,
                                         [CURRENT] if memories is None else memories)
        return result,db
    async def test_undone_receipt_and_current_value_are_explicit(self):
        context,db=await self.call([[REV],[CURRENT]])
        d=data(context)
        self.assertEqual(d['historical_receipt_status'][0]['status'],'undone')
        self.assertEqual(d['current_saved_facts'][0]['content'],CURRENT['content'])
        self.assertEqual(len(d['current_saved_facts']),1)
        self.assertEqual(db._request.call_args_list[0].kwargs['params']['conversation_id'],'eq.'+CHAT)
        self.assertTrue(all(c.kwargs['params']['companion_id']=='eq.'+C for c in db._request.call_args_list))
    async def test_version_mismatch_receipt_is_historical_even_with_same_text(self):
        current={**CURRENT,'content':REV['after_content'],'revision_version':3}
        context,_=await self.call([[{**REV,'undone_at':None}],[current]])
        self.assertEqual(data(context)['historical_receipt_status'][0]['status'],'historical')
    async def test_current_receipt_requires_content_version_and_active_state(self):
        current={**CURRENT,'content':REV['after_content'],'revision_version':1}
        context,_=await self.call([[{**REV,'undone_at':None}],[current]])
        self.assertEqual(data(context)['historical_receipt_status'][0]['status'],'still_current')
    async def test_inactive_fact_is_removed_even_from_initial_retrieval(self):
        context,_=await self.call([[REV],[{**CURRENT,'is_active':False}]])
        self.assertEqual(data(context)['current_saved_facts'],[])
        self.assertEqual(data(context)['inactive_memory_ids'],[M])
    async def test_missing_or_failed_receipt_does_not_invent_undo_status(self):
        for effects in ([[]],[RuntimeError('offline')],[[REV],RuntimeError('offline')]):
            context,_=await self.call(effects)
            d=data(context)
            self.assertIs(d['receipt_status_unavailable'],True)
            self.assertEqual(d['historical_receipt_status'],[])
            self.assertEqual(d['current_saved_facts'][0]['content'],CURRENT['content'])
    async def test_unrelated_receipt_is_not_used(self):
        other={**REV,'id':'55555555-5555-4555-8555-555555555555'}
        context,db=await self.call([[other]])
        self.assertEqual(data(context)['historical_receipt_status'],[])
        self.assertEqual(db._request.await_count,1)
    async def test_no_receipts_requires_no_database_query(self):
        context,db=await self.call([],recent=[])
        self.assertEqual(data(context)['current_saved_facts'][0]['content'],CURRENT['content'])
        db._request.assert_not_awaited()
    async def test_no_memories_or_receipts_adds_no_context(self):
        context,db=await self.call([],memories=[],recent=[])
        self.assertIsNone(context);db._request.assert_not_awaited()
    def test_revision_ids_are_assistant_only_valid_and_unique(self):
        self.assertEqual(revision_ids(RECENT+RECENT+[{'role':'user','metadata':{'memory_revision':{'id':R}}}]),[R])
        self.assertEqual(revision_ids([{'role':'assistant','metadata':{'memory_revision':{'id':'invalid'}}}]),[])
    async def test_runtime_places_current_status_after_history_before_question(self):
        r=test_memory.MemoryFlow().runtime()
        r.db.get_relevant_memories.return_value=[CURRENT]
        r.db.get_recent_messages.return_value=RECENT
        r.db._request=AsyncMock(side_effect=[[REV],[CURRENT]])
        r.provider.generate.return_value=dict(content='Your favorite season is summer.',model='test-model',
                                             latency_ms=1,tokens_in=1,tokens_out=1)
        await r.respond(C,CHAT,"Talk about what you know about me.")
        messages=r.provider.generate.call_args.args[1]
        self.assertEqual(messages[-1]['role'],'user')
        self.assertEqual(messages[-2]['role'],'system')
        self.assertIn('"status": "undone"',messages[-2]['content'])
        self.assertEqual(messages[-3]['content'],'I updated it to autumn.')
        self.assertEqual(r.db.create_message.call_args_list[1].args[0]['content'],'Your favorite season is summer.')
        r.db.remember.assert_not_awaited()

class DirectRecall(unittest.IsolatedAsyncioTestCase):
    async def runtime(self,question,recent=None,active=True):
        r=test_memory.MemoryFlow().runtime()
        r.db.get_relevant_memories.return_value=[CURRENT] if active else []
        r.db.get_recent_messages.return_value=RECENT if recent is None else recent
        r.db._request=AsyncMock(side_effect=[[REV],[{**CURRENT,'is_active':active}]])
        reply=await r.respond(C,CHAT,question)
        r.provider.generate.assert_not_awaited()
        r.db.remember.assert_not_awaited()
        return reply,r
    async def test_same_chat_undo_recall_is_database_backed(self):
        reply,r=await self.runtime("What's my favorite time of year?")
        self.assertIn('summer',reply.content);self.assertNotIn('autumn',reply.content)
        self.assertIn('undone',reply.content)
        self.assertEqual(r.db.create_message.call_args.args[0]['metadata']['memory_recall_attribute'],'favorite season')
    async def test_certainty_rechecks_current_saved_value(self):
        recent=[{'role':'assistant','content':'Your favorite time of year is autumn.'},
                {'role':'user','content':"What's my favorite time of year?"}]+RECENT
        reply,r=await self.runtime('Are you sure?',recent)
        self.assertIn('summer',reply.content);self.assertNotIn('autumn',reply.content)
        self.assertNotIn('Would you like',reply.content)
    async def test_deleted_memory_is_not_reconstructed_or_offered_for_restoration(self):
        reply,r=await self.runtime("What's my favorite season?",active=False)
        self.assertIn('don’t have a current saved value',reply.content)
        self.assertNotIn('autumn',reply.content);self.assertNotIn('morning',reply.content)
        self.assertNotIn('save',reply.content.replace('saved',''))
    async def test_saved_metadata_supports_repeated_certainty_followups(self):
        recent=[{'role':'assistant','content':'Your favorite season is autumn.',
                 'metadata':{'memory_recall_attribute':'favorite season'}}]+RECENT
        reply,r=await self.runtime('Are you sure?',recent)
        self.assertIn('summer',reply.content)
    async def test_user_subject_only_and_duplicate_values_do_not_choose_a_fact(self):
        from lumen.memory_turn_context import current_recall
        self.assertIsNone(current_recall("What's my name?",[],[{'subject':'companion','content':'My name is Lumen'}],[]))
        facts=[CURRENT,{**CURRENT,'id':'other','content':'My favorite season is autumn'}]
        result=current_recall("What's my favorite season?",[],facts,[])
        self.assertIn('conflicting saved facts',result['content'])
    async def test_unrelated_questions_and_certainty_keep_ordinary_model_path(self):
        from lumen.memory_turn_context import current_recall
        for question in ('What is the weather?', 'What is your favorite season?', 'Are you sure?',
                         "What's my plan for today?"):
            self.assertIsNone(current_recall(question,[],[CURRENT],[]),question)
    async def test_empty_context_reports_available_memory_not_invented_history(self):
        from lumen.memory_turn_context import memory_turn_context
        db=Mock(_request=AsyncMock())
        context=await memory_turn_context(db,C,CHAT,[],[],"What's my favorite color?")
        self.assertIn('don’t have a current saved value',context['recall_action']['content'])
        db._request.assert_not_awaited()

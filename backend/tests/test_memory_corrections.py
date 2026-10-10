import json
import unittest
from unittest.mock import AsyncMock, Mock, patch
from lumen.memory_corrections import CorrectionPlan, correction_candidate, validated_replacement, correct_memory

M = {'id':'memory-1', 'content':'My favorite color is red', 'subject':'user',
     'is_active':True, 'revision_version':0, 'tags':['topic:favorite_color']}
RECENT = [{'role':'assistant','content':'Your favorite color is red.'}]
MESSAGE = 'Actually, my favorite color is blue'
RECEIPT = {'id':'receipt-1', 'kind':'correction', 'after_content':'my favorite color is blue',
           'source_text':MESSAGE, 'conversation_id':'chat', 'undone_at':None}

class Parsing(unittest.TestCase):
    def test_explicit_cues(self):
        for s in (MESSAGE, "No, it's blue", "That's wrong", "It used to be red; now it's blue",
                  "My favorite color isn't red", "Lumen, actually my favorite color is blue"):
            self.assertTrue(correction_candidate(s), s)

    def test_casual_hypothetical_quoted_and_questions_do_not_enter(self):
        for s in ('I like this blue shirt', 'What is my favorite color?',
                  'Actually, if my favorite color were blue', 'Imagine my color changed',
                  '"Actually my favorite color is blue"', 'Actually, for example my color is blue'):
            self.assertFalse(correction_candidate(s), s)

    def plan(self, **kw):
        return CorrectionPlan(action='correction', memory_id=M['id'], unambiguous=True, **kw)

    def test_verbatim_assertion(self):
        p=self.plan(assertion='my favorite color is blue')
        self.assertEqual(validated_replacement(p,MESSAGE,M,RECENT),p.assertion)

    def test_wrong_attribute_rejected_even_if_parser_selects_it(self):
        p=self.plan(assertion='my favorite shirt is blue')
        self.assertIsNone(validated_replacement(p,'Actually, my favorite shirt is blue',M,RECENT))

    def test_no_invented_fact_or_value(self):
        for text in ('my favorite color is green', 'my favorite color is not red', 'my favorite color is blue and my name is Bob'):
            p=self.plan(assertion=text)
            self.assertIsNone(validated_replacement(p,MESSAGE,M,RECENT))

    def test_quoted_and_negated_instruction_cannot_authorize(self):
        p=self.plan(assertion='my favorite color is blue')
        for s in ('Actually Sarah said my favorite color is blue', 'Actually do not save my favorite color is blue'):
            self.assertIsNone(validated_replacement(p,s,M,RECENT))

    def test_contextual_replacement_needs_recent_evidence(self):
        p=self.plan(old_fragment='red',new_fragment='blue')
        self.assertEqual(validated_replacement(p,"No, it's blue",M,RECENT),'My favorite color is blue')
        self.assertIsNone(validated_replacement(p,"No, it's blue",M,[]))
        self.assertIsNone(validated_replacement(p,"No, it's green",M,RECENT))

    def test_targeted_followup_can_supply_value(self):
        p=self.plan(old_fragment='red',new_fragment='blue')
        recent=[{'role':'assistant','content':'Replace My favorite color is red?', 'metadata':{'memory_correction_pending':M['id']}}]
        self.assertEqual(validated_replacement(p,'Blue',M,recent),'My favorite color is blue')
        self.assertIsNone(validated_replacement(p,'Blue',M,RECENT))

    def test_temporal_correction_retains_current_value(self):
        p=self.plan(old_fragment='red',new_fragment='blue')
        self.assertEqual(validated_replacement(p,"It used to be red; now it's blue",M,[]),'My favorite color is blue')

    def test_duplicated_short_assertion_uses_fragment_validation(self):
        p=self.plan(assertion='blue',old_fragment='red',new_fragment='blue')
        self.assertEqual(validated_replacement(p,"It used to be red; now it's blue",M,[]),
                         'My favorite color is blue')
        self.assertEqual(validated_replacement(p,"No, it's blue",M,RECENT),
                         'My favorite color is blue')

    def test_duplicated_value_cannot_bypass_evidence_or_attribute(self):
        p=self.plan(assertion='blue',old_fragment='red',new_fragment='blue')
        for message, recent in (
            ("It used to be red; now it's green", RECENT),
            ("My favorite shirt used to be red; now it's blue", RECENT),
            ("Actually, I like this blue shirt", RECENT),
            ("No, it's blue", []),
        ):
            self.assertIsNone(validated_replacement(p,message,M,recent))
        p=self.plan(assertion='invented',old_fragment='red',new_fragment='blue')
        self.assertIsNone(validated_replacement(p,"No, it's blue",M,RECENT))

    def test_other_personal_attribute(self):
        p=self.plan(assertion='I live in Denver')
        self.assertEqual(validated_replacement(p,'Actually, I live in Denver',
             {**M,'content':'The user lives in Boston'},[]),'I live in Denver')

    def test_fragment_cannot_replace_whole_fact(self):
        p=self.plan(old_fragment=M['content'],new_fragment='blue')
        recent=[{'role':'assistant','content':M['content'],'metadata':{'memory_correction_pending':M['id']}}]
        self.assertIsNone(validated_replacement(p,'Blue',M,recent))

    def test_temporal_subject_cannot_switch_attributes(self):
        p=self.plan(old_fragment='red',new_fragment='blue')
        self.assertIsNone(validated_replacement(p,"My favorite shirt used to be red; now it's blue",M,RECENT))

    def test_uncertain_plan_cannot_write(self):
        p=CorrectionPlan(action='correction',assertion='my favorite color is blue',unambiguous=False)
        self.assertIsNone(validated_replacement(p,MESSAGE,M,RECENT))

class Execution(unittest.IsolatedAsyncioTestCase):
    async def execute(self, plan=None, rows=None, source=MESSAGE, recent=RECENT, effects=None):
        db=Mock(_request=AsyncMock(side_effect=effects or [[],rows if rows is not None else [M],RECEIPT]))
        provider=Mock(structured=AsyncMock(return_value=json.dumps(plan or {
            'action':'correction','memory_id':M['id'],'assertion':'my favorite color is blue','unambiguous':True})))
        result=await correct_memory(db,'companion','chat',source,recent,provider,'selected-model','request')
        return result,db,provider

    async def test_confirmed_write_uses_cas_scope_and_source(self):
        result,db,provider=await self.execute()
        call=db._request.call_args
        self.assertEqual(call.args,('POST','rpc/correct_user_memory'))
        self.assertEqual(call.kwargs['json']['p_version'],0)
        self.assertEqual(call.kwargs['json']['p_before'],M['content'])
        self.assertEqual(call.kwargs['json']['p_source'],MESSAGE)
        self.assertEqual(result['memory_revision']['id'],'receipt-1')
        self.assertEqual(provider.structured.call_args.args[0],'selected-model')

    async def test_provider_requires_complete_nonreasoning_plan(self):
        _,_,provider=await self.execute()
        call=provider.structured.call_args
        self.assertIs(call.kwargs['think'],False)
        schema=call.args[2]
        self.assertEqual(set(schema['required']),set(schema['properties']))
        self.assertTrue(all('default' not in field for field in schema['properties'].values()))

    async def test_missing_certainty_still_cannot_write(self):
        _,db,_=await self.execute({'action':'correction','memory_id':M['id'],
                                  'assertion':'my favorite color is blue'})
        self.assertEqual(db._request.await_count,2)

    async def test_none_leaves_ordinary_chat_alone(self):
        result,db,_=await self.execute({'action':'none'})
        self.assertIsNone(result);self.assertEqual(db._request.await_count,2)

    async def test_missing_value_asks_targeted_question_without_write(self):
        result,db,_=await self.execute({'action':'clarify','memory_id':M['id']},source="That's wrong")
        self.assertEqual(result['memory_correction_pending'],M['id'])
        self.assertEqual(db._request.await_count,2)

    async def test_foreign_unknown_or_companion_target_never_writes(self):
        for rows,mid in (([M],'foreign'),([{**M,'subject':'companion'}],M['id']),([{**M,'is_active':False}],M['id'])):
            _,db,_=await self.execute({'action':'correction','memory_id':mid,'assertion':'my favorite color is blue','unambiguous':True},rows=rows)
            self.assertEqual(db._request.await_count,2)

    async def test_duplicate_topic_stops_write(self):
        result,db,_=await self.execute(rows=[M,{**M,'id':'other','content':'My favorite color is yellow'}])
        self.assertIn('more than one',result['content']);self.assertEqual(db._request.await_count,2)

    async def test_replay_does_not_reparse_or_rewrite(self):
        result,db,provider=await self.execute(effects=[[RECEIPT]])
        self.assertIn('already recorded',result['content']);provider.structured.assert_not_awaited()
        self.assertEqual(db._request.await_count,1)

    async def test_replay_after_undo_does_not_reapply(self):
        result,db,_=await self.execute(effects=[[{**RECEIPT,'undone_at':'now'}]])
        self.assertIn('already undone',result['content']);self.assertEqual(db._request.await_count,1)

    async def test_uncertain_transport_recovers_committed_receipt(self):
        result,db,_=await self.execute(effects=[[],[M],RuntimeError('timeout'),[RECEIPT]])
        self.assertEqual(result['memory_revision']['id'],'receipt-1')

    async def test_failed_write_never_claims_success(self):
        result,db,_=await self.execute(effects=[[],[M],RuntimeError('stale'),[]])
        self.assertIn('couldn’t confirm',result['content']);self.assertNotIn('memory_revision',result)

    async def test_database_failure_never_calls_model(self):
        result,db,provider=await self.execute(effects=[RuntimeError('offline')])
        provider.structured.assert_not_awaited();self.assertNotIn('memory_revision',result)

    async def test_missing_schema_and_large_pool_stop(self):
        for rows in ([{k:v for k,v in M.items() if k!='revision_version'}],[M]*501):
            _,db,_=await self.execute(rows=rows)
            self.assertEqual(db._request.await_count,2)

    async def test_fabricated_temporal_kind_does_not_write(self):
        _,db,_=await self.execute({'action':'change','memory_id':M['id'],'assertion':'my favorite color is blue','unambiguous':True})
        self.assertEqual(db._request.await_count,2)

    async def test_untagged_conflicting_attribute_stops_write(self):
        result,db,_=await self.execute(rows=[{**M,'tags':[]},{**M,'id':'other','tags':[],'content':"The user's favorite color is yellow"}])
        self.assertIn('more than one',result['content']);self.assertEqual(db._request.await_count,2)

class RuntimeFlow(unittest.IsolatedAsyncioTestCase):
    async def test_receipt_persists_and_extraction_does_not_duplicate(self):
        from test_memory import MemoryFlow
        r=MemoryFlow().runtime();r.request_key='request';r.settings.memory_observations_enabled=True
        with patch('lumen.runtime.correct_memory',new=AsyncMock(return_value={
             'content':'Updated.', 'model':'memory-correction','memory_revision':{'id':'revision','kind':'correction'}})) as correct:
            result=await r.respond('companion','chat',MESSAGE)
        correct.assert_awaited_once();r.provider.generate.assert_not_awaited()
        self.assertIsNone(result.observation_message_id)
        self.assertEqual(r.db.create_message.call_args.args[0]['metadata']['memory_revision']['id'],'revision')

    async def test_pending_followup_enters_correction_path(self):
        from test_memory import MemoryFlow
        r=MemoryFlow().runtime()
        r.db.get_recent_messages.return_value=[{'role':'assistant','content':'Which value?', 'metadata':{'memory_correction_pending':'memory'}}]
        with patch('lumen.runtime.correct_memory',new=AsyncMock(return_value={'content':'Updated.','model':'memory-correction'})) as correct:
            await r.respond('companion','chat','Blue')
        correct.assert_awaited_once()

    async def test_document_route_does_not_correct_memories(self):
        from test_memory import MemoryFlow
        r=MemoryFlow().runtime()
        with patch('lumen.runtime.selected_document',new=AsyncMock()), \
             patch('lumen.runtime.document_action',new=AsyncMock(return_value={'content':'Draft','document_title':'Example'})), \
             patch('lumen.runtime.correct_memory',new=AsyncMock()) as correct:
            await r.respond('companion','chat',MESSAGE,document_id='doc')
        correct.assert_not_awaited()

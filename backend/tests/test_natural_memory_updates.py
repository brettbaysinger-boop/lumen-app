import copy
import unittest
from unittest.mock import Mock, AsyncMock, patch
from lumen.natural_memory_updates import natural_memory_update, bare_fact
import test_memory

M = {'id':'m','content':'My favorite color is red','subject':'user','is_active':True,
     'revision_version':4,'tags':['topic:favorite_color']}
TEXT='my favorite color is blue'
PENDING={'memory_id':'m','version':4,'before':M['content'],'after':TEXT,
         'source_text':TEXT,'source_message_id':'source'}
RECENT=[{'role':'assistant','metadata':{'memory_update_proposal':PENDING}},
        {'role':'user','id':'source','content':TEXT}]
RECEIPT={'id':'revision','kind':'correction','after_content':TEXT,'undone_at':None,
         'conversation_id':'chat','source_text':'User statement: '+TEXT+'\nConfirmation: yes update it'}


class Facts(unittest.TestCase):
    def test_supported_attributes_and_address(self):
        for text in (TEXT,'Lumen, my favourite colour is blue','I live in Denver',
                     'I prefer tea','my preferred language is French'):
            self.assertIsNotNone(bare_fact(text))
    def test_questions_negatives_hypotheticals_and_multiple_facts(self):
        for text in ('My favorite color is blue?', 'My favorite color is not blue',
                     'My favorite color might be blue', 'She says my favorite color is blue',
                     'My favorite color is blue and my name is Bob', '"My favorite color is blue"',
                     'I like tea; I work in Denver', 'Please update it', 'yes update it'):
            self.assertIsNone(bare_fact(text),text)


class NaturalUpdates(unittest.IsolatedAsyncioTestCase):
    async def call(self,message=TEXT,recent=None,memories=None,effects=None):
        db=Mock(_request=AsyncMock(side_effect=effects if effects is not None else [[M]]))
        result=await natural_memory_update(db,'c','chat',message,recent or [],[M] if memories is None else memories,'request')
        return result,db
    async def test_time_alias_with_season_value_proposes_exact_original_text(self):
        memory={**M,'content':'My favorite season is summer.'}
        for text in ('my favorite time is autumn','My favourite time of year is winter.'):
            result,db=await self.call(message=text,memories=[memory],effects=[[memory]])
            self.assertEqual(result['memory_update_proposal']['after'],text)
            self.assertEqual(result['memory_update_proposal']['before'],memory['content'])
            self.assertTrue(all(c.args[0]=='GET' for c in db._request.call_args_list))

    async def test_ambiguous_time_does_not_replace_season(self):
        memory={**M,'content':'My favorite season is summer.'}
        for text in ('My favorite time is morning','My favorite time of year is Christmas'):
            result,db=await self.call(message=text,memories=[memory])
            self.assertIn('Do you mean',result['content'])
            self.assertNotIn('memory_update_proposal',result)
            db._request.assert_not_awaited()

    async def test_season_alias_confirmation_reuses_existing_version_and_receipt(self):
        memory={**M,'content':'My favorite season is summer.'}
        text='my favorite time is autumn'
        pending={**PENDING,'before':memory['content'],'after':text,'source_text':text}
        recent=[{'role':'assistant','metadata':{'memory_update_proposal':pending}},
                {'role':'user','id':'source','content':text}]
        receipt={**RECEIPT,'after_content':text}
        result,db=await self.call(message='yes',recent=recent,effects=[[],[memory],receipt])
        self.assertEqual(result['memory_revision']['id'],'revision')
        self.assertEqual(db._request.call_args.kwargs['json']['p_after'],text)
        self.assertEqual(db._request.call_args.kwargs['json']['p_version'],4)

    async def test_alias_duplicates_require_review(self):
        memory={**M,'content':'My favorite season is summer.'}
        duplicate={**memory,'id':'other','content':'My favorite time of year is autumn','tags':[]}
        result,db=await self.call(message='My favorite season is winter',
                                 memories=[memory],effects=[[memory,duplicate]])
        self.assertNotIn('memory_update_proposal',result)
        self.assertIn('more than one',result['content'])

    async def test_bare_conflict_proposes_without_writing(self):
        result,db=await self.call()
        self.assertEqual(result['memory_update_proposal']['after'],TEXT)
        self.assertIn('Replace it',result['content'])
        self.assertTrue(all(c.args[0]=='GET' for c in db._request.call_args_list))
        self.assertEqual(db._request.call_args.kwargs['params']['companion_id'],'eq.c')
    async def test_new_fact_uses_existing_observation_path(self):
        result,db=await self.call(memories=[])
        self.assertIsNone(result);db._request.assert_not_awaited()
    async def test_same_fact_and_nonuser_memory_not_proposed(self):
        result,db=await self.call(message=M['content'])
        self.assertIsNone(result)
        result,db=await self.call(memories=[{**M,'subject':'companion'}])
        self.assertIsNone(result);db._request.assert_not_awaited()
    async def test_duplicate_or_large_history_needs_review(self):
        for rows in ([M,{**M,'id':'other'}],[M]*501):
            result,db=await self.call(effects=[rows])
            self.assertNotIn('memory_update_proposal',result)
            self.assertEqual(db._request.await_count,1)
    async def test_yes_updates_pinned_fact_with_cas_and_receipt(self):
        result,db=await self.call(message='yes update it',recent=RECENT,effects=[[],[M],RECEIPT])
        self.assertEqual(result['memory_revision']['id'],'revision')
        data=db._request.call_args.kwargs['json']
        self.assertEqual(data['p_version'],4)
        self.assertEqual(data['p_before'],M['content'])
        self.assertEqual(data['p_after'],TEXT)
        self.assertEqual(data['p_source'],RECEIPT['source_text'])
        self.assertEqual(data['p_companion'],'c')
        self.assertEqual(data['p_conversation'],'chat')
    async def test_no_cancels_without_database_access(self):
        for message in ('no','No thanks','cancel','never mind'):
            result,db=await self.call(message=message,recent=RECENT)
            self.assertIn('haven’t changed',result['content']);db._request.assert_not_awaited()
    async def test_yes_without_receipt_does_not_trust_assistant_prose(self):
        recent=[{'role':'assistant','content':'Should I change your favorite color?'}]
        result,db=await self.call(message='yes update it',recent=recent,effects=[[]])
        self.assertNotIn('memory_revision',result);self.assertIn('Which saved fact',result['content'])
    async def test_other_topic_discards_pending_without_update(self):
        result,db=await self.call(message='Tell me a story',recent=RECENT)
        self.assertIsNone(result);db._request.assert_not_awaited()
    async def test_stale_deleted_foreign_and_duplicate_targets_fail(self):
        for rows in ([{**M,'revision_version':5}],[],[{**M,'id':'other'}],
                     [{**M,'subject':'companion'}],[M,{**M,'id':'other'}],
                     [{**M,'content':'My favorite color is yellow'}],[{**M,'is_active':False}]):
            result,db=await self.call(message='yes update it',recent=RECENT,effects=[[],rows])
            self.assertNotIn('memory_revision',result)
            self.assertTrue(all(c.args[0]=='GET' for c in db._request.call_args_list))
    async def test_source_identity_and_assertion_cannot_be_forged(self):
        for field,value in (('source_message_id','other'),('after','my favorite color is green'),
                            ('before','invented'),('version','4')):
            recent=copy.deepcopy(RECENT);recent[0]['metadata']['memory_update_proposal'][field]=value
            result,db=await self.call(message='yes update it',recent=recent,effects=[[],[M]])
            self.assertNotIn('memory_revision',result)
            self.assertTrue(all(c.args[0]=='GET' for c in db._request.call_args_list))
    async def test_replay_and_undone_replay_do_not_write(self):
        for r in (RECEIPT,{**RECEIPT,'undone_at':'now'}):
            result,db=await self.call(message='yes update it',recent=RECENT,effects=[[r]])
            self.assertIn('already',result['content']);self.assertEqual(db._request.await_count,1)
    async def test_write_timeout_recovers_only_confirmed_receipt(self):
        result,db=await self.call(message='yes update it',recent=RECENT,
                                effects=[[],[M],RuntimeError('timeout'),[RECEIPT]])
        self.assertEqual(result['memory_revision']['id'],'revision')
        result,db=await self.call(message='yes update it',recent=RECENT,
                                effects=[[],[M],RuntimeError('timeout'),[]])
        self.assertNotIn('memory_revision',result);self.assertIn('couldn’t confirm',result['content'])

class Runtime(unittest.IsolatedAsyncioTestCase):
    async def test_real_two_turn_flow_persists_proposal_then_revision(self):
        r=test_memory.MemoryFlow().runtime();r.request_key='request';r.settings.memory_observations_enabled=True
        r.db.get_relevant_memories.return_value=[M]
        r.db._request=AsyncMock(return_value=[M])
        r.db.create_message.side_effect=[{'id':'source'},{'id':'proposal'}]
        proposed=await r.respond('c','chat',TEXT)
        meta=r.db.create_message.call_args.kwargs if r.db.create_message.call_args.kwargs else r.db.create_message.call_args.args[0]['metadata']
        self.assertEqual(meta['memory_update_proposal']['source_message_id'],'source')
        self.assertIsNone(proposed.observation_message_id)
        r.db.get_recent_messages.return_value=[
            {'role':'assistant','content':proposed.content,'metadata':meta},
            {'role':'user','id':'source','content':TEXT}]
        r.db._request.side_effect=[[],[M],RECEIPT]
        r.db.create_message.side_effect=[{'id':'confirmation'},{'id':'receipt'}]
        result=await r.respond('c','chat','yes update it')
        self.assertIn('updated that memory',result.content)
        self.assertEqual(r.db.create_message.call_args.args[0]['metadata']['memory_revision']['id'],'revision')
        self.assertIsNone(result.observation_message_id)
        r.provider.generate.assert_not_awaited();r.db.remember.assert_not_awaited()
    async def test_document_turn_never_proposes_preference_update(self):
        r=test_memory.MemoryFlow().runtime();r.db.get_relevant_memories.return_value=[M]
        with patch('lumen.runtime.selected_document',AsyncMock()),patch('lumen.runtime.document_action',AsyncMock(return_value={'content':'Draft','document_title':'Example'})),patch('lumen.runtime.natural_memory_update',AsyncMock()) as update:
            await r.respond('c','chat',TEXT,document_id='doc')
        update.assert_not_awaited()

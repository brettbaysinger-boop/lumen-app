import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock
from lumen.ollama import OllamaProvider
from lumen.document_work import prepare_work, validate_proposal, work_request

MODEL='satgeze/gemma4-12b-uncensored-1.5m:latest'
SOURCES=[{'number':1,'excerpt':'Rodent program $295. Labor excluded.','title':'Example','page':1}]
DRAFT=json.dumps({'title':'Proposal','body':'Rodent program: $295. Labor excluded. [1]'})

class EffortTests(unittest.TestCase):
    def test_effort_is_scoped_and_unknown_models_keep_defaults(self):
        provider=OllamaProvider(SimpleNamespace(ollama_url='http://localhost'))
        provider.effort='quick';self.assertEqual(provider.thinking_options(MODEL),{'think':False})
        provider.effort='deep';self.assertEqual(provider.thinking_options(MODEL),{'think':True})
        self.assertEqual(provider.thinking_options('other'),{})
        provider.effort='default';self.assertEqual(provider.thinking_options(MODEL),{})

    def test_price_and_citation_validation(self):
        with self.assertRaises(ValueError):validate_proposal(DRAFT.replace('295','395'),SOURCES)
        with self.assertRaises(ValueError):validate_proposal(DRAFT.replace('[1]','[9]'),SOURCES)
        self.assertEqual(validate_proposal(DRAFT,SOURCES).title,'Proposal')
        self.assertIn('$395',validate_proposal(DRAFT.replace('295','395'),SOURCES,'Use a new total of $395').body)

    def test_explicit_work_intent(self):
        self.assertTrue(work_request('Work harder: improve this document'))
        self.assertTrue(work_request('Draft a bid from this document'))
        self.assertFalse(work_request('What does this bid say?'))

class WorkTests(unittest.IsolatedAsyncioTestCase):
    async def test_three_stages_and_editable_result_without_saving(self):
        provider=SimpleNamespace(structured=AsyncMock(side_effect=[DRAFT,'{"issues":[]}',DRAFT]))
        emit=AsyncMock()
        result=await prepare_work(provider,MODEL,'Improve bid',SOURCES,emit)
        self.assertEqual(provider.structured.await_count,3)
        self.assertEqual(emit.await_count,3)
        self.assertEqual(result['document_action_draft']['kind'],'note')
        self.assertIn('Labor excluded',result['document_action_draft']['body'])

    async def test_failed_check_does_not_offer_unverified_draft(self):
        provider=SimpleNamespace(structured=AsyncMock(side_effect=[DRAFT,'not json']))
        result=await prepare_work(provider,MODEL,'Improve bid',SOURCES)
        self.assertNotIn('document_action_draft',result)
        self.assertEqual(provider.structured.await_count,2)

class EffortPayloadTests(unittest.IsolatedAsyncioTestCase):
    async def test_both_chat_paths_send_verified_effort(self):
        import httpx
        from unittest.mock import patch
        captured=[]
        def handler(request):
            payload=json.loads(request.content);captured.append(payload)
            if payload['stream']:
                return httpx.Response(200,text=json.dumps({'message':{'content':'Hello'},'done':True}))
            return httpx.Response(200,json={'message':{'content':'Hello'}})
        original=httpx.AsyncClient
        provider=OllamaProvider(SimpleNamespace(ollama_url='http://local'))
        with patch('lumen.ollama.httpx.AsyncClient',side_effect=lambda **kw:original(transport=httpx.MockTransport(handler),**kw)):
            provider.effort='quick';await provider.generate(MODEL,[])
            provider.effort='deep';await provider.generate_stream(MODEL,[],AsyncMock())
            await provider.generate('unverified-model',[])
        self.assertIs(captured[0]['think'],False)
        self.assertIs(captured[1]['think'],True)
        self.assertNotIn('think',captured[2])

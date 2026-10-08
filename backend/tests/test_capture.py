import unittest
from unittest.mock import AsyncMock, Mock
from lumen.my_day import parse_action, handle_action

C='11111111-1111-4111-8111-111111111111'
I='22222222-2222-4222-8222-222222222222'
K='33333333-3333-4333-8333-333333333333'

class CaptureParsing(unittest.TestCase):
    def test_explicit_captures_preserve_words(self):
        result=parse_action('Please add milk, eggs to my shopping list','UTC')
        self.assertTrue(result['append_list'])
        self.assertEqual(result['title'],'Shopping list')
        self.assertEqual(result['checklist'],[{'text':'milk','done':False},{'text':'eggs','done':False}])
        self.assertEqual(parse_action('save a gift idea: a book for Sarah','UTC')['title'],'Gift ideas list')
        self.assertEqual(parse_action('take a note: ask about warranty','UTC')['body'],'ask about warranty')
    def test_no_implicit_or_embedded_actions(self):
        for text in ['I need milk','Could we someday add milk to my shopping list?',
                     'Do not add milk to my shopping list','He said "add milk to my shopping list"',
                     'How do I save a gift idea: a book?']:
            self.assertIsNone(parse_action(text,'UTC'),text)
    def test_reported_greeting_period_and_smart_quotes(self):
        self.assertEqual(parse_action('good morning lumen! Add milk to my shopping list','UTC')['checklist'][0]['text'],'milk')
        self.assertEqual(parse_action('save a gift idea. a book for Dena','UTC')['checklist'][0]['text'],'a book for Dena')
        self.assertEqual(parse_action('“Take a note: ask about the warranty”','UTC')['body'],'ask about the warranty')
        self.assertEqual(parse_action('Hello Atlas! Add milk to my shopping list','UTC',companion_name='Atlas')['title'],'Shopping list')
        self.assertIn('clarify',parse_action('save a gift idea','UTC'))

class CaptureExecution(unittest.IsolatedAsyncioTestCase):
    async def test_append_uses_atomic_scoped_rpc(self):
        item={'id':I,'kind':'list','title':'Shopping list','checklist':[{'text':'milk','done':False}]}
        db=Mock(_request=AsyncMock(return_value=[item]))
        result=await handle_action(db,C,I,'add milk to my shopping list','UTC',K)
        self.assertEqual(result['item'],item)
        self.assertEqual(db._request.call_args.args,('POST','rpc/capture_list_items'))
        self.assertEqual(db._request.call_args.kwargs['json']['p_request_key'],K)
        self.assertEqual(db._request.call_args.kwargs['json']['p_companion_id'],C)
    async def test_failed_append_does_not_claim_save(self):
        db=Mock(_request=AsyncMock(side_effect=RuntimeError('offline')))
        result=await handle_action(db,C,I,'add milk to my shopping list','UTC',K)
        self.assertIsNone(result['item']);self.assertIn('couldn’t confirm',result['content'])
    async def test_read_and_ambiguous_lists_never_write(self):
        item={'id':I,'kind':'list','title':'Shopping list','checklist':[{'text':'milk','done':False}]}
        db=Mock(_request=AsyncMock(return_value=[item]))
        result=await handle_action(db,C,I,'show my shopping list','UTC',K)
        self.assertIn('milk',result['content']);self.assertIsNone(result['item'])
        db._request.return_value=[item,item]
        result=await handle_action(db,C,I,'show my shopping list','UTC',K)
        self.assertIn('More than one',result['content'])
        self.assertTrue(all(call.args[0]=='GET' for call in db._request.call_args_list))
    async def test_oversize_capture_rejected_before_write(self):
        db=Mock(_request=AsyncMock())
        result=await handle_action(db,C,I,'add '+'x'*301+' to my shopping list','UTC',K)
        self.assertIsNone(result['item']);db._request.assert_not_awaited()

    async def test_reported_commands_all_return_persisted_receipts(self):
        for text,kind in [('good morning lumen! Add milk to my shopping list','list'),
                          ('save a gift idea. a book for Dena','list'),
                          ('“Take a note: ask about the warranty”','note')]:
            db=Mock(get_conversation=AsyncMock(return_value={'id':I}),
                    _request=AsyncMock(return_value=[{'id':I,'kind':kind,'title':'Captured'}]))
            result=await handle_action(db,C,I,text,'UTC',K)
            self.assertEqual(result['item']['id'],I,text)
            self.assertIn('Saved your',result['content'])
            self.assertEqual(db._request.call_args.args[0],'POST')

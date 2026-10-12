import unittest
from unittest.mock import AsyncMock

from lumen.conversation_titles import opening_title, name_first_turn


class ConversationTitleTests(unittest.IsolatedAsyncioTestCase):
    def test_opening_title_is_bounded_and_skips_empty_greetings(self):
        self.assertIsNone(opening_title(''))
        self.assertIsNone(opening_title('Hello!'))
        self.assertEqual(opening_title('Can you help plan a courtyard garden?'),
                         'help plan a courtyard garden')
        self.assertLessEqual(len(opening_title('word ' * 100)), 60)

    async def test_first_turn_updates_with_title_and_companion_guards(self):
        db = AsyncMock()
        chat = {'id': 'chat', 'title': 'New Conversation'}
        db._request.return_value = [{'id': 'chat', 'title': 'Plan a courtyard garden'}]
        result = await name_first_turn(db, 'companion', chat, 'Plan a courtyard garden', [])
        self.assertEqual(result['title'], 'Plan a courtyard garden')
        params = db._request.call_args.kwargs['params']
        self.assertEqual(params['title'], 'eq.New Conversation')
        self.assertEqual(params['companion_id'], 'eq.companion')

    async def test_custom_names_and_existing_history_are_preserved(self):
        db = AsyncMock()
        custom = {'id': 'chat', 'title': 'My own name'}
        self.assertEqual(await name_first_turn(db, 'c', custom, 'Different topic', []), custom)
        generic = {'id': 'chat', 'title': 'New Conversation'}
        self.assertEqual(await name_first_turn(db, 'c', generic, 'Different topic',
                         [{'role': 'user', 'content': 'Earlier'}]), generic)
        db._request.assert_not_awaited()

    async def test_naming_failure_does_not_break_chat(self):
        db = AsyncMock()
        db._request.side_effect = RuntimeError('Unavailable')
        chat = {'id': 'chat', 'title': 'New Conversation'}
        self.assertEqual(await name_first_turn(db, 'c', chat, 'Garden plans', []), chat)

import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock

from lumen.project_tasks import task_request, capture_project_tasks


class ProjectTaskTests(unittest.IsolatedAsyncioTestCase):
    def fixtures(self):
        item = {
            'id': 'project-id', 'companion_id': 'companion',
            'kind': 'project', 'status': 'open', 'title': 'Copper Garden',
            'checklist': [{'text': 'Existing step', 'done': True}],
        }
        recent = [
            {'role': 'assistant', 'content':
             'Copper Garden\n1. **Identify weed types**\n2. **Gather supplies**'},
            {'role': 'assistant', 'created_at': datetime.now(timezone.utc).isoformat(),
             'metadata': {'my_day_item': item}},
        ]
        return item, recent

    def test_grounded_followup_and_ambiguity(self):
        item, recent = self.fixtures()
        request = task_request('Sure add those 2 tasks then add to my day', recent)
        self.assertEqual(request['id'], item['id'])
        self.assertEqual(request['tasks'], ['Identify weed types', 'Gather supplies'])
        self.assertIsNone(task_request('Sounds great', recent))
        self.assertIsNone(task_request('Do not add those two tasks', recent))
        self.assertIn('clarify', task_request('add those two tasks', recent[:1]))
        recent[0]['content'] = 'Other project\n1. One\n2. Two'
        self.assertIn('clarify', task_request('add those two tasks', recent))

    async def test_save_preserves_completed_steps_and_retry_deduplicates(self):
        item, recent = self.fixtures()
        updated = {
            **item, 'checklist': item['checklist'] + [
                {'text': 'Identify weed types', 'done': False},
                {'text': 'Gather supplies', 'done': False},
            ],
        }
        db = AsyncMock()
        db._request.side_effect = [[item], [updated]]
        result = await capture_project_tasks(db, 'companion', 'add those two tasks', recent)
        self.assertEqual(result['item'], updated)
        self.assertEqual(db._request.call_args.kwargs['json'], {'checklist': updated['checklist']})
        self.assertIn('checklist', db._request.call_args.kwargs['params'])
        db._request.reset_mock()
        db._request.side_effect = [[updated]]
        result = await capture_project_tasks(db, 'companion', 'add those two tasks', recent)
        self.assertIn('No duplicates', result['content'])
        self.assertEqual(db._request.await_count, 1)

    async def test_concurrent_change_and_ambiguous_project_refused(self):
        item, _ = self.fixtures()
        db = AsyncMock()
        db._request.side_effect = [[item], []]
        text = 'add tasks to project Copper Garden: New step'
        result = await capture_project_tasks(db, 'companion', text, [])
        self.assertIsNone(result['item'])
        db._request.reset_mock()
        db._request.side_effect = [[item, {**item, 'id': 'duplicate'}]]
        result = await capture_project_tasks(db, 'companion', text, [])
        self.assertIsNone(result['item'])
        self.assertEqual(db._request.await_count, 1)

    async def test_wrong_scope_and_failed_save_never_confirm_success(self):
        item, _ = self.fixtures()
        db = AsyncMock()
        text = 'add tasks to project Copper Garden: New step'
        db._request.side_effect = [[{**item, 'companion_id': 'other'}]]
        result = await capture_project_tasks(db, 'companion', text, [])
        self.assertIsNone(result['item'])
        self.assertEqual(db._request.await_count, 1)
        db._request.side_effect = [[item], RuntimeError('Unavailable')]
        result = await capture_project_tasks(db, 'companion', text, [])
        self.assertIsNone(result['item'])
        self.assertIn('couldn’t confirm', result['content'])

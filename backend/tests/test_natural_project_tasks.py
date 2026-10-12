import json
import unittest
from unittest.mock import AsyncMock, patch

from lumen.natural_project_tasks import (
    natural_project_tasks, text_choices, validate_tasks,
)

TEXT = 'Add tasks to project Copper Garden identify weed types and gather supplies'
TASKS = ['identify weed types', 'gather supplies']


class NaturalProjectTaskTests(unittest.IsolatedAsyncioTestCase):
    def fixtures(self):
        db = AsyncMock()
        db._request.return_value = [{
            'id': 'garden', 'companion_id': 'companion',
            'kind': 'project', 'status': 'open', 'title': 'Copper Garden',
        }]
        provider = AsyncMock()
        provider.structured.return_value = json.dumps({'tasks': TASKS})
        return db, provider

    async def test_plain_request_uses_constrained_choices_and_guarded_writer(self):
        db, provider = self.fixtures()
        with patch('lumen.natural_project_tasks.capture_project_tasks',
                   new_callable=AsyncMock) as write:
            write.return_value = {'content': 'Saved', 'item': {'id': 'garden'}}
            result = await natural_project_tasks(
                db, 'companion', TEXT, [], provider, 'selected-model')
        self.assertIsNotNone(result['item'])
        self.assertEqual(provider.structured.call_args.args[0], 'selected-model')
        enum = provider.structured.call_args.args[2]['properties']['tasks']['items']['enum']
        self.assertTrue(all(task in enum for task in TASKS))
        self.assertEqual(write.call_args.kwargs['command'],
                         {'id': 'garden', 'title': 'Copper Garden', 'tasks': TASKS})

    async def test_invalid_output_retries_once_before_any_write(self):
        for invalid in [
            'broken JSON',
            json.dumps({'tasks': ['identify weed types', 'gather supplies commentary']}),
            json.dumps({'tasks': ['identify weed types']}),
        ]:
            db, provider = self.fixtures()
            provider.structured.side_effect = [invalid, json.dumps({'tasks': TASKS})]
            with patch('lumen.natural_project_tasks.capture_project_tasks',
                       new_callable=AsyncMock) as write:
                await natural_project_tasks(db, 'companion', TEXT, [], provider, 'model')
                self.assertEqual(provider.structured.await_count, 2)
                self.assertEqual(write.await_count, 1)
                self.assertEqual(write.call_args.kwargs['command']['tasks'], TASKS)

    async def test_two_invalid_outputs_never_write(self):
        db, provider = self.fixtures()
        provider.structured.side_effect = ['broken', 'still broken']
        with patch('lumen.natural_project_tasks.capture_project_tasks',
                   new_callable=AsyncMock) as write:
            result = await natural_project_tasks(db, 'companion', TEXT, [], provider, 'model')
            self.assertIsNone(result['item'])
            write.assert_not_awaited()
        self.assertEqual(provider.structured.await_count, 2)

    async def test_duplicate_names_refused_before_model(self):
        db, provider = self.fixtures()
        db._request.return_value.append({**db._request.return_value[0], 'id': 'duplicate'})
        result = await natural_project_tasks(db, 'companion', TEXT, [], provider, 'model')
        self.assertIsNone(result['item'])
        provider.structured.assert_not_awaited()

    async def test_wrong_companion_refused_before_model(self):
        db, provider = self.fixtures()
        db._request.return_value[0]['companion_id'] = 'other'
        result = await natural_project_tasks(db, 'companion', TEXT, [], provider, 'model')
        self.assertIsNone(result['item'])
        provider.structured.assert_not_awaited()

    async def test_ordinary_chat_and_negation_do_not_invoke_model(self):
        db, provider = self.fixtures()
        for text in [
            'That project needs tasks',
            'Did you add tasks to project Copper Garden?',
            'Do not add tasks to project Copper Garden',
        ]:
            self.assertIsNone(await natural_project_tasks(
                db, 'companion', text, [], provider, 'model'))
        provider.structured.assert_not_awaited()
        db._request.assert_not_awaited()

    def test_coverage_order_and_compound_task(self):
        wording = 'identify weed types and gather supplies'
        choices = text_choices(wording)
        self.assertEqual(validate_tasks({'tasks': TASKS}, wording, choices), TASKS)
        for tasks in [TASKS[::-1], [TASKS[0]], [TASKS[1]], ['invented task']]:
            with self.assertRaises(ValueError):
                validate_tasks({'tasks': tasks}, wording, choices)
        compound = 'wash and dry the sprayer'
        self.assertEqual(
            validate_tasks({'tasks': [compound]}, compound, text_choices(compound)),
            [compound],
        )

    async def test_provider_failure_never_writes(self):
        db, provider = self.fixtures()
        provider.structured.side_effect = RuntimeError('Unavailable')
        with patch('lumen.natural_project_tasks.capture_project_tasks',
                   new_callable=AsyncMock) as write:
            result = await natural_project_tasks(db, 'companion', TEXT, [], provider, 'model')
            self.assertIsNone(result['item'])
            write.assert_not_awaited()

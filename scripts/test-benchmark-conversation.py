import importlib.util
from pathlib import Path
import unittest
import json
spec = importlib.util.spec_from_file_location('benchmark', Path(__file__).with_name('benchmark-conversation.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class BenchmarkTests(unittest.TestCase):
    def test_thinking_precedes_visible_and_metrics_use_nanoseconds(self):
        events = [ {'message': {'thinking': 'private reasoning'}},
                   {'message': {'content': 'Hi'}},
                   {'done': True, 'eval_count': 20, 'eval_duration': 2000000000,
                    'load_duration': 500000000, 'done_reason': 'stop'} ]
        times = iter([11, 13, 14, 14])
        result = m.measure([json.dumps(e) for e in events], 10, lambda: next(times))
        self.assertEqual(result['first_visible_seconds'], 3)
        self.assertEqual(result['first_thinking_seconds'], 1)
        self.assertEqual(result['tokens_per_second'], 10)
        self.assertEqual(result['load_seconds'], .5)
        self.assertNotIn('private reasoning', json.dumps(result))
        self.assertEqual(result['answer'], 'Hi')

    def test_missing_final_is_failure(self):
        with self.assertRaises(RuntimeError):
            m.measure([json.dumps({'message': {'content': 'partial'}})], 0, lambda: 1)

    def test_empty_truncated_answer_is_not_first_visible(self):
        result = m.measure([json.dumps({'done': True, 'done_reason': 'length'})], 0, lambda: 1)
        self.assertIsNone(result['first_visible_seconds'])
        self.assertIsNone(result['tokens_per_second'])
        self.assertEqual(result['done_reason'], 'length')


if __name__ == '__main__':
    unittest.main()

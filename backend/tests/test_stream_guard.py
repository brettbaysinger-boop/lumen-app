import unittest

from lumen.stream_guard import LegacyImageJSONGuard


class LegacyImageJSONGuardTests(unittest.TestCase):
    def test_ordinary_prose_streams_immediately(self):
        guard = LegacyImageJSONGuard()
        self.assertEqual(guard.push("Hello "), "Hello ")
        self.assertEqual(guard.push("there"), "there")

    def test_split_leading_whitespace_then_prose(self):
        guard = LegacyImageJSONGuard()
        self.assertEqual(guard.push(" \n "), "")
        self.assertEqual(guard.push("Hi"), " \n Hi")
        self.assertEqual(guard.push("!"), "!")

    def test_standalone_legacy_json_is_not_streamed(self):
        guard = LegacyImageJSONGuard()
        self.assertEqual(guard.push('{"action":'), "")
        self.assertEqual(
            guard.push('"generate_image","action_input":"portrait"}'),
            "",
        )
        self.assertEqual(guard.finish(), "")

    def test_split_opening_brace_is_not_streamed(self):
        guard = LegacyImageJSONGuard()
        self.assertEqual(guard.push(" {"), "")
        self.assertEqual(guard.push('"action":"generate_image"'), "")


    def test_non_image_json_can_be_shown_by_final_response(self):
        guard = LegacyImageJSONGuard()
        self.assertEqual(guard.push('{"answer":"42"}'), "")
        self.assertEqual(guard.finish(), "")

if __name__ == "__main__":
    unittest.main()

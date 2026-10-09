import unittest

from lumen.image_actions import (
    ACTION_END,
    ACTION_START,
    ImageActionStreamFilter,
    extract_image_action,
    parse_image_action,
)


class ImageActionTests(unittest.TestCase):
    def test_valid_action(self):
        action = parse_image_action(
            '{"action":"generate_image","action_input":"A sunrise portrait"}'
        )
        self.assertEqual(action.prompt, "A sunrise portrait")

    def test_rejects_unknown_or_extra_fields(self):
        for payload in (
            '{"action":"delete_files","action_input":"anything"}',
            '{"action":"generate_image","action_input":"x","extra":true}',
            '{"action":"generate_image","action_input":42}',
            '{"action":"generate_image","action_input":""}',
        ):
            self.assertIsNone(parse_image_action(payload))

    def test_extracts_delimited_action(self):
        text = (
            "I made something for you. "
            + ACTION_START
            + '{"action":"generate_image","action_input":"A portrait"}'
            + ACTION_END
        )
        clean, action = extract_image_action(text)
        self.assertEqual(clean, "I made something for you.")
        self.assertEqual(action.prompt, "A portrait")

    def test_ordinary_json_is_not_an_action(self):
        text = '{"action":"generate_image","action_input":"example"}'
        self.assertEqual(extract_image_action(text), (text, None))

    def test_stream_filter_hides_action_payload(self):
        chunks = [
            "Here's ",
            "something. <lumen_",
            'image_action>{"action":"generate_image",',
            '"action_input":"A portrait"}</lumen_image_action>',
        ]
        stream = ImageActionStreamFilter()
        visible = "".join(stream.push(chunk) for chunk in chunks)
        visible += stream.finish()
        self.assertEqual(visible, "Here's something. ")

    def test_stream_filter_preserves_ordinary_text(self):
        stream = ImageActionStreamFilter()
        visible = stream.push("Hello <lum") + stream.push("inary world")
        visible += stream.finish()
        self.assertEqual(visible, "Hello <luminary world")


    def test_action_preserves_following_text(self):
        stream = ImageActionStreamFilter()
        text = (
            "Look at this. "
            + ACTION_START
            + '{"action":"generate_image","action_input":"A portrait"}'
            + ACTION_END
            + " I hope you like it."
        )
        visible = stream.push(text) + stream.finish()
        self.assertEqual(
            visible,
            "Look at this.  I hope you like it.",
        )
        self.assertEqual(stream.action.prompt, "A portrait")

    def test_split_closing_tag_never_leaks_json(self):
        stream = ImageActionStreamFilter()
        chunks = [
            "Hello " + ACTION_START + '{"action":"generate_image",',
            '"action_input":"A portrait"}</lumen_image_',
            'action> Goodbye.',
        ]
        visible = "".join(stream.push(chunk) for chunk in chunks)
        visible += stream.finish()
        self.assertEqual(visible, "Hello  Goodbye.")
        self.assertEqual(stream.action.prompt, "A portrait")

    def test_incomplete_action_is_not_executed(self):
        stream = ImageActionStreamFilter()
        visible = stream.push(
            "Hello " + ACTION_START + '{"action":"generate_image"'
        )
        visible += stream.finish()
        self.assertIsNone(stream.action)
        self.assertNotIn(ACTION_START, visible)
        self.assertTrue(stream.invalid_action)


    def test_invalid_action_does_not_leak(self):
        stream = ImageActionStreamFilter()
        text = (
            "Hello "
            + ACTION_START
            + '{"action":"delete_files","action_input":"anything"}'
            + ACTION_END
            + " Goodbye."
        )
        visible = stream.push(text) + stream.finish()
        self.assertEqual(visible, "Hello  Goodbye.")
        self.assertTrue(stream.invalid_action)
        self.assertIsNone(stream.action)

    def test_oversized_action_is_rejected(self):
        stream = ImageActionStreamFilter()
        visible = stream.push(
            "Hello " + ACTION_START + ("x" * 5000)
        )
        visible += stream.finish()
        self.assertEqual(visible, "Hello ")
        self.assertTrue(stream.invalid_action)
        self.assertIsNone(stream.action)


    def test_explicit_self_subject(self):
        action = parse_image_action(
            '{"action":"generate_image",'
            '"action_input":"A close-up portrait at sunrise",'
            '"subject":"self"}'
        )
        self.assertIsNotNone(action)
        self.assertEqual(action.subject, "self")

    def test_unknown_subject_rejected(self):
        action = parse_image_action(
            '{"action":"generate_image",'
            '"action_input":"A portrait",'
            '"subject":"filesystem"}'
        )
        self.assertIsNone(action)


    def test_standalone_legacy_image_action(self):
        from lumen.image_actions import extract_standalone_image_action

        content = (
            '{"action":"generate_image",'
            '"action_input":"A portrait at sunrise",'
            '"subject":"self"}'
        )

        visible, action = extract_standalone_image_action(content)

        self.assertEqual(visible, "")
        self.assertIsNotNone(action)
        self.assertEqual(action.prompt, "A portrait at sunrise")
        self.assertEqual(action.subject, "self")

    def test_embedded_json_is_not_executed(self):
        from lumen.image_actions import extract_standalone_image_action

        content = (
            'Here is an example: '
            '{"action":"generate_image","action_input":"portrait"}'
        )

        visible, action = extract_standalone_image_action(content)

        self.assertEqual(visible, content)
        self.assertIsNone(action)

    def test_markdown_json_is_not_executed(self):
        from lumen.image_actions import extract_standalone_image_action

        content = (
            '```json\\n'
            '{"action":"generate_image","action_input":"portrait"}'
            '\\n```'
        )

        visible, action = extract_standalone_image_action(content)

        self.assertEqual(visible, content)
        self.assertIsNone(action)

    def test_unrelated_json_is_not_executed(self):
        from lumen.image_actions import extract_standalone_image_action

        content = '{"action":"delete_files","action_input":"everything"}'

        visible, action = extract_standalone_image_action(content)

        self.assertEqual(visible, content)
        self.assertIsNone(action)


if __name__ == "__main__":
    unittest.main()

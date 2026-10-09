import unittest

from lumen.image_response import clean_image_intro, image_reply


class ImageResponseTests(unittest.TestCase):
    def test_success_keeps_harmless_intro(self):
        reply = image_reply(
            "I thought you might enjoy seeing the sunrise.",
            success=True,
        )
        self.assertIn("enjoy seeing the sunrise", reply)
        self.assertNotIn("Here's the image I made for you.", reply)

    def test_failure_removes_unsupported_creation_claim(self):
        reply = image_reply(
            "I've created your portrait. I wanted it to feel warm.",
            success=False,
        )
        self.assertNotIn("I've created", reply)
        self.assertIn("wanted it to feel warm", reply)
        self.assertIn("couldn't finish", reply)

    def test_malformed_action_markup_is_hidden(self):
        reply = clean_image_intro(
            "Hello <lumen_image_action>"
            '{"action":"generate_image","action_input":"portrait"}'
        )
        self.assertNotIn("lumen_image_action", reply)
        self.assertNotIn('"action_input"', reply)

    def test_real_newline_separates_intro_and_result(self):
        reply = image_reply("A quiet sunrise.", success=True)
        self.assertEqual(reply, "A quiet sunrise.")
        self.assertNotIn("\\n\\n", reply)


    def test_incomplete_tagged_action_is_never_exposed(self):
        from lumen.image_response import clean_image_intro
        content = (
            "I want to show you something. "
            '<lumen_image_action>{"action":"generate_image",'
            '"action_input":"unfinished'
        )
        self.assertEqual(
            clean_image_intro(content),
            "I want to show you something.",
        )

    def test_malformed_complete_action_is_removed(self):
        from lumen.image_response import clean_image_intro
        content = (
            "A quiet thought. "
            '<lumen_image_action>{"action":"generate_image",'
            '"action_input":42}</lumen_image_action>'
        )
        self.assertEqual(
            clean_image_intro(content),
            "A quiet thought.",
        )

    def test_success_without_prose_uses_natural_fallback(self):
        from lumen.image_response import image_reply

        self.assertEqual(
            image_reply("", success=True),
            "I wanted to share this with you.",
        )

    def test_success_preserves_companion_story_without_canned_ending(self):
        from lumen.image_response import image_reply

        story = (
            "This is my Memory Garden. "
            "Every flower represents something we have shared."
        )
        self.assertEqual(image_reply(story, success=True), story)

if __name__ == "__main__":
    unittest.main()

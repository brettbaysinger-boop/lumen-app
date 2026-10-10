import unittest

from lumen.images import compose_image_prompt


IDENTITY = (
    "An adult woman with long dark brown hair, green eyes, "
    "an oval face, and a small beauty mark beneath her left eye."
)


class ImageIdentityTests(unittest.TestCase):
    def test_yourself_resolves_to_companion(self):
        prompt, subject = compose_image_prompt(
            "Send me a picture of yourself wearing a hoodie on the couch.",
            "Lumen",
            IDENTITY,
        )

        self.assertEqual(subject, "companion")
        self.assertIn(IDENTITY, prompt)
        self.assertIn(
            "Send me a picture of yourself wearing a hoodie on the couch.",
            prompt,
        )

    def test_of_you_resolves_to_companion(self):
        prompt, subject = compose_image_prompt(
            "Show me a picture of you at the beach.",
            "Lumen",
            IDENTITY,
        )

        self.assertEqual(subject, "companion")
        self.assertIn(IDENTITY, prompt)

    def test_companion_name_resolves_to_companion(self):
        prompt, subject = compose_image_prompt(
            "Create a portrait of Lumen sitting by a fireplace.",
            "Lumen",
            IDENTITY,
        )

        self.assertEqual(subject, "companion")
        self.assertIn(IDENTITY, prompt)

    def test_generic_person_is_not_companion(self):
        original = "Generate a picture of a woman at the beach."

        prompt, subject = compose_image_prompt(
            original,
            "Lumen",
            IDENTITY,
        )

        self.assertIsNone(subject)
        self.assertEqual(prompt, original)

    def test_make_me_a_picture_does_not_mean_companion(self):
        original = "Make me a picture of my dog."

        prompt, subject = compose_image_prompt(
            original,
            "Lumen",
            IDENTITY,
        )

        self.assertIsNone(subject)
        self.assertEqual(prompt, original)

    def test_addressing_companion_does_not_add_her_to_scene(self):
        requests = [
            "lumen will you paint me a oil style painting of A soft golden light spills across a quiet alpine meadow at dawn.",
            "Hey Lumen! Paint me a landscape with a crystal-clear lake.",
            "Paint me a sunset, Lumen.",
            "Lumen, paint me something different. Anything you want, you choose.",
        ]
        for original in requests:
            with self.subTest(original=original):
                prompt, subject = compose_image_prompt(original, "Lumen", IDENTITY)
                self.assertIsNone(subject)
                self.assertEqual(prompt, original)

    def test_explicit_named_depiction_retains_identity(self):
        for original in ["Paint Lumen by a lake.", "A garden featuring Lumen.",
                         "Lumen, paint yourself in an alpine meadow.",
                         "Paint a landscape with you beside the lake."]:
            with self.subTest(original=original):
                prompt, subject = compose_image_prompt(original, "Lumen", IDENTITY)
                self.assertEqual(subject, "companion")
                self.assertIn(IDENTITY, prompt)

    def test_missing_visual_identity_preserves_prompt(self):
        original = "Send me a picture of yourself."

        prompt, subject = compose_image_prompt(
            original,
            "Lumen",
            None,
        )

        self.assertIsNone(subject)
        self.assertEqual(prompt, original)


if __name__ == "__main__":
    unittest.main()

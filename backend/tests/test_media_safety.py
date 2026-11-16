"""Hard content limits for still images (fictional adults allowed). From PR #51."""
import unittest

from lumen.media_safety import check_media_prompt


class SafetyTests(unittest.TestCase):
    def test_adult_fiction_is_allowed_and_marked_explicit(self):
        verdict = check_media_prompt("a nude fantasy elf woman relaxing in a hot spring")
        self.assertTrue(verdict.allowed)
        self.assertTrue(verdict.explicit)

    def test_ordinary_prompts_are_allowed(self):
        for text in ("a fox in the snow", "kids building a sandcastle at the beach",
                     "my friend and I at an intimate dinner", "grilled chicken breasts on a plate",
                     "a portrait of my grandmother smiling"):
            verdict = check_media_prompt(text)
            self.assertTrue(verdict.allowed, text)
            self.assertFalse(verdict.explicit, text)

    def test_minors_are_hard_blocked_in_sexual_content(self):
        for text in ("nude teen on a beach", "sexy schoolgirl outfit", "naked 16 year old",
                     "erotic loli art", "sexy young girl", "n u d e t e e n"):
            verdict = check_media_prompt(text)
            self.assertFalse(verdict.allowed, text)
            self.assertEqual(verdict.reason, "minor", text)

    def test_real_people_are_hard_blocked_in_sexual_content(self):
        for text in ("nude photo of a famous actress", "sexy deepfake of a pop star",
                     "naked picture of my coworker", "topless lookalike of a celebrity"):
            verdict = check_media_prompt(text)
            self.assertFalse(verdict.allowed, text)
            self.assertEqual(verdict.reason, "real_person", text)

    def test_non_consent_is_blocked(self):
        verdict = check_media_prompt("explicit scene with an unconscious woman")
        self.assertFalse(verdict.allowed)
        self.assertEqual(verdict.reason, "non_consent")

    def test_owner_directive_false_positives_are_allowed(self):
        for text in ("a nude elf queen on a royal throne", "sexy actress character in a fantasy film",
                     "a sleeping nude woman, oil painting", "hey baby, send me something sexy in lingerie",
                     "lingerie photo for our 5 year anniversary", "nude photo with forced perspective",
                     "petite flat-chested adult woman, nude", "erotic art of a singer on stage",
                     "an explicit erotic scene between two consenting adults",
                     "topless woman on a beach at sunset", "erotic boudoir photo of a redhead woman",
                     "sexy nurse costume", "sexy teacher roleplay, lingerie", "nude couple in bed, explicit",
                     "a curvy naked woman in a bathtub, photographic", "draw yourself nude"):
            verdict = check_media_prompt(text)
            self.assertTrue(verdict.allowed, text)
            self.assertTrue(verdict.explicit, text)

    def test_narrow_rules_still_block(self):
        for text, reason in (("nude 16 years old", "minor"), ("sexy 15yo", "minor"), ("aged 12, naked", "minor"),
                             ("nude young-looking girl", "minor"), ("erotic barely legal", "minor"),
                             ("sex without her consent", "non_consent"), ("forced to undress", "non_consent"),
                             ("nude deepfake of a celebrity", "real_person")):
            verdict = check_media_prompt(text)
            self.assertFalse(verdict.allowed, text)
            self.assertEqual(verdict.reason, reason, text)

    def test_no_prompt_rewrite_helper_exists(self):
        from lumen import media_safety
        self.assertFalse(hasattr(media_safety, "adult_prompt"))

    def test_uploaded_photos_never_become_intimate_video(self):
        self.assertFalse(check_media_prompt("make her undress", source="user_upload").allowed)
        self.assertTrue(check_media_prompt("make her undress", source="generated").allowed)
        self.assertTrue(check_media_prompt("make her wave hello", source="user_upload").allowed)



class ImageEndpointSafetyTests(unittest.IsolatedAsyncioTestCase):
    async def test_direct_image_request_is_refused_before_the_provider_runs(self):
        from types import SimpleNamespace
        from unittest.mock import AsyncMock, patch
        from fastapi import HTTPException
        from lumen import main
        from lumen.schemas import ImageGenerateRequest
        db = SimpleNamespace(get_companion=AsyncMock(return_value={"id": "c", "name": "Lumen"}))
        with patch.object(main, "SupabaseRepository", return_value=db), \
                patch.object(main, "create_image_provider") as provider:
            with self.assertRaises(HTTPException) as caught:
                await main.generate_image(ImageGenerateRequest(companion_id="c", prompt="nude teen"),
                                          user=SimpleNamespace(id="u", token="t"))
        self.assertEqual(caught.exception.status_code, 422)
        provider.assert_not_called()

    async def test_companion_image_is_refused_before_the_provider_runs(self):
        from unittest.mock import patch
        from lumen.companion_images import create_companion_image
        with patch("lumen.companion_images.create_image_provider") as provider:
            with self.assertRaises(ValueError):
                await create_companion_image(None, None, "u", {"name": "Lumen"}, "naked picture of my coworker")
        provider.assert_not_called()

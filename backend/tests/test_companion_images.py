import unittest
from unittest.mock import AsyncMock, patch

from lumen.companion_images import create_companion_image


class CompanionImageTests(unittest.IsolatedAsyncioTestCase):
    async def test_generates_and_uploads_private_image(self):
        db = AsyncMock()
        provider = AsyncMock()
        provider.generate.return_value = {
            "bytes": b"png-data",
            "mime_type": "image/png",
            "provider": "comfyui",
            "model": "heavy-workflow",
            "latency_ms": 1000,
        }

        companion = {
            "name": "Raialume",
            "visual_identity": "silver hair, luminous blue eyes",
        }

        with patch(
            "lumen.companion_images.create_image_provider",
            return_value=provider,
        ), patch(
            "lumen.companion_images.uuid4",
            return_value="image-id",
        ):
            metadata = await create_companion_image(
                object(),
                db,
                "user-id",
                companion,
                "A portrait of yourself at sunrise",
            )

        self.assertTrue(metadata["generated_image"])
        self.assertEqual(
            metadata["attachments"][0]["path"],
            "user-id/image-id.png",
        )
        self.assertIn(
            "silver hair",
            metadata["resolved_image_prompt"],
        )
        db.upload_storage.assert_awaited_once()

    async def test_failed_upload_never_returns_success(self):
        db = AsyncMock()
        db.upload_storage.side_effect = RuntimeError("storage unavailable")

        provider = AsyncMock()
        provider.generate.return_value = {
            "bytes": b"png-data",
            "mime_type": "image/png",
            "provider": "comfyui",
            "model": "heavy-workflow",
            "latency_ms": 1000,
        }

        with patch(
            "lumen.companion_images.create_image_provider",
            return_value=provider,
        ):
            with self.assertRaises(RuntimeError):
                await create_companion_image(
                    object(),
                    db,
                    "user-id",
                    {"name": "Raialume"},
                    "A glowing landscape",
                )

    async def test_requires_authenticated_user(self):
        db = AsyncMock()

        with self.assertRaises(ValueError):
            await create_companion_image(
                object(),
                db,
                None,
                {"name": "Raialume"},
                "A portrait",
            )

        db.upload_storage.assert_not_awaited()


    async def test_explicit_self_subject_enforces_visual_identity(self):
        db = AsyncMock()
        provider = AsyncMock()
        provider.generate.return_value = {
            "bytes": b"png-data",
            "mime_type": "image/png",
            "provider": "comfyui",
            "model": "heavy-workflow",
            "latency_ms": 1000,
        }

        with patch(
            "lumen.companion_images.create_image_provider",
            return_value=provider,
        ):
            metadata = await create_companion_image(
                object(),
                db,
                "user-id",
                {
                    "name": "Raialume",
                    "visual_identity": "silver hair, luminous blue eyes",
                },
                "A close-up portrait at sunrise",
                subject="self",
            )

        prompt = provider.generate.await_args.args[0]
        self.assertIn("silver hair", prompt)
        self.assertEqual(metadata["image_subject"], "companion")


if __name__ == "__main__":
    unittest.main()

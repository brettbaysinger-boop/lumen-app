import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

from lumen.auth import AuthUser
from lumen.main import generate_image
from lumen.schemas import ImageGenerateRequest


COMPANION_ID = "11111111-1111-1111-1111-111111111111"
CONVERSATION_ID = "22222222-2222-2222-2222-222222222222"
MESSAGE_ID = "33333333-3333-3333-3333-333333333333"
USER_ID = "44444444-4444-4444-4444-444444444444"


class FakeImageProvider:
    async def generate(self, prompt):
        self.prompt = prompt
        return {
            "bytes": b"fake-png-data",
            "mime_type": "image/png",
            "provider": "comfyui",
            "model": "comfyui-workflow",
            "latency_ms": 1234,
        }


class ImageEndpointTests(unittest.IsolatedAsyncioTestCase):
    async def test_generate_image_persists_generated_image(self):
        repository = AsyncMock()
        repository.get_companion.return_value = {"id": COMPANION_ID}
        repository.get_conversation.return_value = {
            "id": CONVERSATION_ID,
            "companion_id": COMPANION_ID,
        }
        repository.create_message.side_effect = [
            {"id": "user-message"},
            {"id": MESSAGE_ID},
        ]

        provider = FakeImageProvider()

        with patch("lumen.main.SupabaseRepository", return_value=repository), \
             patch("lumen.main.create_image_provider", return_value=provider), \
             patch("lumen.main.uuid.uuid4", return_value="generated-image-id"):

            response = await generate_image(
                ImageGenerateRequest(
                    companion_id=COMPANION_ID,
                    conversation_id=CONVERSATION_ID,
                    prompt="A luminous city beneath two moons",
                ),
                AuthUser(USER_ID, "user-token"),
            )

        self.assertEqual(response.conversation_id, CONVERSATION_ID)
        self.assertEqual(response.message_id, MESSAGE_ID)
        self.assertEqual(response.provider, "comfyui")
        self.assertEqual(response.model, "comfyui-workflow")
        self.assertEqual(response.latency_ms, 1234)

        self.assertEqual(
            provider.prompt,
            "A luminous city beneath two moons",
        )

        repository.upload_storage.assert_awaited_once_with(
            "chat-media",
            f"{USER_ID}/generated-image-id.png",
            b"fake-png-data",
            "image/png",
        )

        self.assertEqual(repository.create_message.await_count, 2)

        user_message = repository.create_message.await_args_list[0].args[0]
        assistant_message = repository.create_message.await_args_list[1].args[0]

        self.assertEqual(user_message["role"], "user")
        self.assertEqual(
            user_message["content"],
            "A luminous city beneath two moons",
        )

        self.assertEqual(assistant_message["role"], "assistant")
        self.assertEqual(
            assistant_message["metadata"]["attachments"][0]["path"],
            f"{USER_ID}/generated-image-id.png",
        )
        self.assertEqual(
            assistant_message["metadata"]["attachments"][0]["mime_type"],
            "image/png",
        )
        self.assertTrue(
            assistant_message["metadata"]["generated_image"]
        )
        self.assertEqual(
            assistant_message["metadata"]["image_provider"],
            "comfyui",
        )

        repository.touch_conversation.assert_awaited_once_with(
            CONVERSATION_ID,
            2,
        )

    async def test_generate_image_creates_conversation_when_missing(self):
        repository = AsyncMock()
        repository.get_companion.return_value = {"id": COMPANION_ID}
        repository.create_conversation.return_value = {
            "id": CONVERSATION_ID,
        }
        repository.create_message.side_effect = [
            {"id": "user-message"},
            {"id": MESSAGE_ID},
        ]

        with patch("lumen.main.SupabaseRepository", return_value=repository), \
             patch(
                 "lumen.main.create_image_provider",
                 return_value=FakeImageProvider(),
             ):

            response = await generate_image(
                ImageGenerateRequest(
                    companion_id=COMPANION_ID,
                    conversation_id=None,
                    prompt="A crystal dragon",
                ),
                AuthUser(USER_ID, "user-token"),
            )

        self.assertEqual(response.conversation_id, CONVERSATION_ID)

        repository.create_conversation.assert_awaited_once_with(
            COMPANION_ID,
            "A crystal dragon",
        )

    async def test_generate_image_rejects_wrong_conversation(self):
        repository = AsyncMock()
        repository.get_companion.return_value = {"id": COMPANION_ID}
        repository.get_conversation.return_value = None

        with patch("lumen.main.SupabaseRepository", return_value=repository):
            with self.assertRaises(HTTPException) as raised:
                await generate_image(
                    ImageGenerateRequest(
                        companion_id=COMPANION_ID,
                        conversation_id=CONVERSATION_ID,
                        prompt="This must never reach the provider",
                    ),
                    AuthUser(USER_ID, "user-token"),
                )

        self.assertEqual(raised.exception.status_code, 404)
        repository.upload_storage.assert_not_awaited()
        repository.create_message.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()

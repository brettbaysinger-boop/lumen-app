import unittest
from unittest.mock import AsyncMock, patch
from uuid import NAMESPACE_URL, uuid5

from lumen.runtime import CognitionRuntime
from lumen.schemas import Attachment

COMPANION_ID = "11111111-1111-1111-1111-111111111111"
CONVERSATION_ID = "22222222-2222-2222-2222-222222222222"
USER_ID = "44444444-4444-4444-4444-444444444444"
MESSAGE_ID = "55555555-5555-5555-5555-555555555555"

PATHS = [
    f"{USER_ID}/first.png",
    f"{USER_ID}/second.jpg",
]


class UserImageGalleryTests(unittest.IsolatedAsyncioTestCase):
    def make_runtime(self):
        # Construct without network clients; inject mocked dependencies.
        runtime = object.__new__(CognitionRuntime)
        runtime.db = AsyncMock()
        runtime.provider = AsyncMock()
        runtime.provider.name = "ollama"
        runtime.user_id = USER_ID
        runtime.settings = type("SettingsStub", (), {
            "conversation_model": "test-model",
            "memory_observations_enabled": False,
        })()

        runtime.db.get_companion.return_value = {
            "id": COMPANION_ID,
            "name": "Raialume",
            "conversation_model": "test-model",
        }
        runtime.db.get_conversation.return_value = {
            "id": CONVERSATION_ID,
            "companion_id": COMPANION_ID,
        }
        runtime.db.get_state.return_value = {}
        runtime.db.get_relevant_memories.return_value = []
        runtime.db.get_recent_messages.return_value = []
        runtime.db.get_profile.return_value = None
        runtime.db.create_message.side_effect = [
            {"id": MESSAGE_ID},
            {"id": "assistant-message"},
        ]
        runtime.provider.supports_vision.return_value = False
        return runtime

    async def respond_with_images(self, runtime):
        attachments = [
            Attachment(path=PATHS[0], mime_type="image/png"),
            Attachment(path=PATHS[1], mime_type="image/jpeg"),
        ]
        return await runtime.respond(
            COMPANION_ID,
            CONVERSATION_ID,
            "Here are my desert photos",
            attachments=attachments,
        )

    async def test_multiple_uploads_registered_in_gallery(self):
        runtime = self.make_runtime()

        with patch.object(
            CognitionRuntime,
            "_build_system_prompt",
            return_value="test system prompt",
        ):
            response = await self.respond_with_images(runtime)

        self.assertEqual(response.message_id, "assistant-message")
        self.assertEqual(runtime.db._request.await_count, 2)

        records = []
        for call in runtime.db._request.await_args_list:
            self.assertEqual(call.args, ("POST", "gallery_items"))
            self.assertEqual(
                call.kwargs["params"],
                {"on_conflict": "id"},
            )
            self.assertEqual(
                call.kwargs["headers"]["Prefer"],
                "resolution=merge-duplicates,return=minimal",
            )
            records.append(call.kwargs["json"])

        self.assertEqual(
            [record["url"] for record in records],
            PATHS,
        )

        for record, path in zip(records, PATHS):
            self.assertEqual(record["companion_id"], COMPANION_ID)
            self.assertEqual(record["conversation_id"], CONVERSATION_ID)
            self.assertEqual(record["source"], "user")
            self.assertEqual(record["category"], "user_showed")
            self.assertEqual(record["media_type"], "image")
            self.assertEqual(
                record["caption"],
                "Here are my desert photos",
            )
            self.assertEqual(
                record["metadata"]["storage_path"],
                path,
            )
            self.assertEqual(
                record["metadata"]["message_id"],
                MESSAGE_ID,
            )
            self.assertEqual(
                record["id"],
                str(uuid5(
                    NAMESPACE_URL,
                    f"raialume:user-image:{MESSAGE_ID}:{path}",
                )),
            )

        self.assertEqual(runtime.db.create_message.await_count, 2)
        runtime.db.touch_conversation.assert_awaited_once_with(
            CONVERSATION_ID,
            2,
        )

    async def test_gallery_failure_does_not_interrupt_chat(self):
        runtime = self.make_runtime()
        runtime.db._request.side_effect = RuntimeError(
            "gallery temporarily unavailable"
        )

        with patch.object(
            CognitionRuntime,
            "_build_system_prompt",
            return_value="test system prompt",
        ), patch("lumen.runtime.logging.getLogger") as get_logger:
            response = await self.respond_with_images(runtime)

        self.assertEqual(response.message_id, "assistant-message")
        self.assertEqual(runtime.db._request.await_count, 2)
        self.assertEqual(runtime.db.create_message.await_count, 2)
        runtime.db.touch_conversation.assert_awaited_once_with(
            CONVERSATION_ID,
            2,
        )
        self.assertEqual(
            get_logger.return_value.exception.call_count,
            2,
        )


if __name__ == "__main__":
    unittest.main()

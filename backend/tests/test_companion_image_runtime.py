import unittest
from unittest.mock import AsyncMock, patch

from lumen.runtime import CognitionRuntime


COMPANION_ID = "11111111-1111-1111-1111-111111111111"
CONVERSATION_ID = "22222222-2222-2222-2222-222222222222"
USER_ID = "44444444-4444-4444-4444-444444444444"

IMAGE_ACTION = (
    '<lumen_image_action>'
    '{"action":"generate_image",'
    '"action_input":"A portrait at sunrise",'
    '"subject":"self"}'
    '</lumen_image_action>'
)


class CompanionImageRuntimeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = AsyncMock()
        self.db.get_companion.return_value = {
            "id": COMPANION_ID,
            "name": "Raialume",
            "visual_identity": "silver hair, luminous blue eyes",
        }
        self.db.get_conversation.return_value = {
            "id": CONVERSATION_ID,
            "companion_id": COMPANION_ID,
        }
        self.db.get_state.return_value = {}
        self.db.get_relevant_memories.return_value = []
        self.db.get_recent_messages.return_value = []
        self.db.get_profile.return_value = None
        self.db.create_message.side_effect = [
            {"id": "user-message"},
            {"id": "assistant-message"},
        ]

        self.provider = AsyncMock()
        self.provider.name = "ollama"

        self.runtime = CognitionRuntime.__new__(CognitionRuntime)
        self.runtime.settings = type("Settings", (), {
            "conversation_model": "test-model",
            "memory_observations_enabled": False,
        })()
        self.runtime.db = self.db
        self.runtime.provider = self.provider
        self.runtime.user_id = USER_ID

        self.image_metadata = {
            "attachments": [{
                "path": f"{USER_ID}/image.png",
                "mime_type": "image/png",
            }],
            "generated_image": True,
            "generation_prompt": "A portrait at sunrise",
            "resolved_image_prompt": "A portrait of Raialume",
            "image_subject": "companion",
            "image_provider": "comfyui",
            "image_model": "heavy-workflow",
            "image_latency_ms": 1000,
        }

    def model_result(self, content):
        return {
            "content": content,
            "model": "test-model",
            "latency_ms": 100,
            "tokens_in": 20,
            "tokens_out": 30,
        }

    async def respond(self, content, *, streaming=False, image_error=None):
        self.provider.generate.return_value = self.model_result(content)

        async def stream(model, messages, emit):
            await emit({"type": "delta", "text": content})
            return self.model_result(content)

        self.provider.generate_stream.side_effect = stream

        events = []
        async def emit(event):
            events.append(event)

        with patch(
            "lumen.runtime.handle_action",
            new_callable=AsyncMock,
            return_value=None,
        ), patch(
            "lumen.runtime.web_action",
            new_callable=AsyncMock,
            return_value=None,
        ), patch(
            "lumen.runtime.create_companion_image",
            new_callable=AsyncMock,
        ) as create_image:
            if image_error:
                create_image.side_effect = image_error
            else:
                create_image.return_value = self.image_metadata

            response = await self.runtime.respond(
                COMPANION_ID,
                CONVERSATION_ID,
                "Show me something about yourself",
                emit=emit if streaming else None,
            )

            return response, events, create_image

    async def test_image_success_creates_one_user_and_assistant_message(self):
        response, _, create_image = await self.respond(
            "I want to show you something.\n" + IMAGE_ACTION
        )

        create_image.assert_awaited_once()
        self.assertEqual(
            create_image.await_args.kwargs["subject"], "self"
        )

        self.assertEqual(self.db.create_message.await_count, 2)
        user = self.db.create_message.await_args_list[0].args[0]
        assistant = self.db.create_message.await_args_list[1].args[0]

        self.assertEqual(user["role"], "user")
        self.assertEqual(assistant["role"], "assistant")
        self.assertTrue(assistant["metadata"]["generated_image"])
        self.assertEqual(
            assistant["metadata"]["attachments"][0]["path"],
            f"{USER_ID}/image.png",
        )
        self.assertNotIn("<lumen_image_action>", response.content)
        self.assertNotIn('"action_input"', response.content)

        self.db._request.assert_awaited_once()
        gallery = self.db._request.await_args.kwargs["json"]
        self.assertEqual(gallery["category"], "companion_sent")
        self.assertEqual(gallery["metadata"]["message_id"], "assistant-message")

    async def test_image_failure_is_truthful_and_has_no_attachment(self):
        response, _, _ = await self.respond(
            IMAGE_ACTION,
            image_error=RuntimeError("Heavy unavailable"),
        )

        self.assertIn("couldn't finish", response.content)
        self.assertNotIn("Here's the image I made", response.content)

        assistant = self.db.create_message.await_args_list[1].args[0]
        self.assertNotIn("attachments", assistant["metadata"])
        self.db._request.assert_not_awaited()

    async def test_ordinary_reply_does_not_generate_image(self):
        response, _, create_image = await self.respond(
            "I love the colors of a sunrise."
        )

        create_image.assert_not_awaited()
        self.assertEqual(
            response.content,
            "I love the colors of a sunrise.",
        )
        self.db._request.assert_not_awaited()

    async def test_legacy_standalone_json_generates_image(self):
        content = (
            '{"action":"generate_image",'
            '"action_input":"A portrait at sunrise",'
            '"subject":"self"}'
        )
        response, _, create_image = await self.respond(content)

        create_image.assert_awaited_once()
        self.assertNotIn('"action_input"', response.content)
        self.assertEqual(
            response.content,
            "I wanted to share this with you.",
        )

    async def test_stream_does_not_expose_action_json(self):
        response, events, _ = await self.respond(
            IMAGE_ACTION,
            streaming=True,
        )

        streamed = "".join(
            event.get("text", "")
            for event in events
            if event["type"] == "delta"
        )
        self.assertNotIn('"action_input"', streamed)
        self.assertNotIn("<lumen_image_action>", streamed)
        self.assertEqual(streamed, response.content)

        activity = [
            event.get("text")
            for event in events
            if event["type"] == "activity"
        ]
        self.assertIn("Creating an image…", activity)


if __name__ == "__main__":
    unittest.main()

import unittest
from unittest.mock import AsyncMock, patch

from lumen.my_day import parse_action, handle_action

C = "11111111-1111-4111-8111-111111111111"
CHAT = "22222222-2222-4222-8222-222222222222"
KEY = "33333333-3333-4333-8333-333333333333"


class NamedProjectTests(unittest.IsolatedAsyncioTestCase):
    def test_named_project_commands(self):
        for command in [
            "Create project called Copper Garden",
            "Please create a project named Copper Garden",
            "Start a project called Copper Garden",
            "Create project: Copper Garden",
        ]:
            result = parse_action(command, "America/Phoenix")
            self.assertEqual(result["kind"], "project")
            self.assertEqual(result["title"], "Copper Garden")

    def test_discussion_is_not_a_creation_command(self):
        for text in [
            "Could a project called Copper Garden work?",
            "We might create a project called Copper Garden someday.",
            "Don't create a project called Copper Garden",
        ]:
            self.assertIsNone(parse_action(text, "America/Phoenix"))

    async def test_success_comes_from_saved_item(self):
        db = AsyncMock()
        saved = {"id": KEY, "kind": "project", "title": "Copper Garden"}
        with patch("lumen.my_day.create_item", new=AsyncMock(return_value=saved)) as create:
            result = await handle_action(
                db, C, CHAT, "Create project called Copper Garden",
                "America/Phoenix", KEY
            )
        create.assert_awaited_once()
        payload = create.call_args.args[2]
        self.assertEqual(payload.kind, "project")
        self.assertEqual(payload.title, "Copper Garden")
        self.assertEqual(str(payload.source_conversation_id), CHAT)
        self.assertEqual(result["item"], saved)
        self.assertIn("Saved your project", result["content"])

    async def test_failed_save_cannot_return_success(self):
        with patch("lumen.my_day.create_item", new=AsyncMock(side_effect=RuntimeError("DB unavailable"))):
            with self.assertRaises(RuntimeError):
                await handle_action(
                    AsyncMock(), C, CHAT, "Create project called Copper Garden",
                    "America/Phoenix", KEY
                )


if __name__ == "__main__":
    unittest.main()

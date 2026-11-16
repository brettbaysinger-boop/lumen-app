"""D01-64: mutual nickname agreement is durable only when accepted."""
import unittest

from lumen.rmc_shared_nicknames import agreed_nicknames


class AgreedNicknameTests(unittest.TestCase):
    def test_companion_proposes_and_user_accepts(self):
        result = agreed_nicknames(
            "Yes, I love that name!",
            'Let\'s call ourselves "Moonlight Crew" — our duo nickname.',
            "That sounds lovely.", "Lumen",
        )
        self.assertIsNotNone(result)
        self.assertIn("Moonlight Crew", result)
        self.assertIn("user agreed", result.lower())

    def test_short_yes_accepts_immediately_previous_proposal(self):
        text = agreed_nicknames(
            "yes", 'You can call me "Starlight" as a nickname.',
            "Wonderful!", "Lumen",
        )
        self.assertIsNotNone(text)
        self.assertIn("Starlight", text)

    def test_user_proposes_and_companion_accepts(self):
        text = agreed_nicknames(
            'Let\'s call us "Solar Duo".',
            "", 'I love that name. Solar Duo it is!', "Lumen",
        )
        self.assertIsNotNone(text)
        self.assertIn("Solar Duo", text)

    def test_companion_suggestion_alone_never_saves(self):
        self.assertIsNone(agreed_nicknames(
            "What should we do today?",
            'Let\'s call us "Solar Duo".',
            "I can suggest some activities.", "Lumen",
        ))

    def test_vague_or_negative_acceptance_refused(self):
        proposal = 'Let\'s call ourselves "Solar Duo".'
        for reply in (
            "Maybe", "No thanks", "I don't like it", "What?",
            "Maybe later. Yes.", "Let's pretend, yes", "I like the weather",
        ):
            with self.subTest(reply=reply):
                self.assertIsNone(agreed_nicknames(reply, proposal, "", "Lumen"))

    def test_different_conversation_and_unrelated_statement_fail_closed(self):
        self.assertIsNone(agreed_nicknames("yes", "", "", "Lumen"))
        self.assertIsNone(agreed_nicknames(
            "I love that name!", "What a beautiful morning!", "", "Lumen"
        ))

    def test_secret_or_credential_never_ingested(self):
        self.assertIsNone(agreed_nicknames(
            "yes", "Let's call us Password1234, that's our nickname.",
            "", "Lumen",
        ))


if __name__ == "__main__":
    unittest.main()

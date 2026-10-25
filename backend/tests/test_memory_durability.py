import unittest

from lumen.memory_durability import classify_natural_evidence


class NaturalDurabilityTests(unittest.TestCase):
    def decision(self, text, durable=True):
        return classify_natural_evidence(text, text, durable=durable).action

    def test_obvious_one_off_messages_are_not_stored(self):
        for statement in (
            "Tell me a silly joke.",
            "Dammit. Tell me a silly joke.",
            "Good morning, beautiful. How are you?",
            "Hi!",
            "Can you show me a picture of yourself?",
            "Orion, can you hear me clearly?",
            "I'm hungry.",
            "Im exhausted.",
            "Still wrong, try again.",
            "What are you doing?",
        ):
            with self.subTest(statement=statement):
                self.assertEqual(self.decision(statement), "skip")

    def test_question_may_contain_durable_information_and_must_be_reviewed(self):
        for statement in (
            "Did you know I'm your creator?",
            "Will you call me captain?",
            "Can you call me Star?",
            "Good morning, I am building a new model. How are you?",
            "I prefer jasmine tea. Can you make me some?",
            "Remember that my favorite color is turquoise.",
            "From now on, call me Captain.",
        ):
            with self.subTest(statement=statement):
                self.assertEqual(self.decision(statement), "review")

    def test_one_off_source_clarification_skipped_without_discarding_mixed_claims(self):
        self.assertEqual(
            self.decision("no, i was wanting to know what websites you got them from"),
            "skip",
        )
        self.assertNotEqual(
            self.decision(
                "No, I was wanting to know what website to use because my bakery opens soon."
            ),
            "skip",
        )

    def test_transient_opening_with_lasting_fact_is_review_not_discard(self):
        for statement in (
            "I'm tired. My nursing degree is complete.",
            "I'm hungry, but my daughter prefers gluten-free cookies.",
            "I'm exhausted; my long-running project is finally launched.",
            "I'm hungry because I have an important dietary restriction.",
            "I'm tired. The project deadline is Friday.",
            "I'm hungry! This recipe contains peanuts.",
        ):
            with self.subTest(statement=statement):
                self.assertEqual(self.decision(statement), "review")
        for statement in (
            "I'm hungry.", "I'm hungry!", "I'm tired right now.",
            "I'm tired...", "Im exhausted", "Im exhausted.",
        ):
            with self.subTest(statement=statement):
                self.assertEqual(self.decision(statement), "skip")

    def test_greeting_with_lasting_assertion_is_reviewed(self):
        for statement in (
            "Hi! I'm a nurse.",
            "Good morning, my favorite color is teal.",
            "Hey, I moved to the coast last year.",
        ):
            with self.subTest(statement=statement):
                self.assertEqual(self.decision(statement), "review")

    def test_comma_mood_with_lasting_attribute_is_reviewed(self):
        for statement in (
            "I'm tired, vegan btw",
            "I'm hungry, teacher since 2015",
            "Im exhausted, night nurse",
        ):
            with self.subTest(statement=statement):
                self.assertEqual(self.decision(statement), "review")

    def test_plain_greetings_and_moods_stay_skippable(self):
        for statement in (
            "Hi",
            "Hello there!",
            "Good morning, Nova.",
            "Hey, how are you?",
            "I'm tired.",
            "I'm tired, lol",
            "I'm sleepy, goodnight",
            "Im exhausted from work",
        ):
            with self.subTest(statement=statement):
                self.assertEqual(self.decision(statement), "skip")

    def test_durable_assertions_are_allowed(self):
        for statement in (
            "My favorite color is turquoise.",
            "I'm building an all-digital farmers almanac.",
            "I prefer that you call me captain.",
            "The companion's learning queue includes Python.",
            "We want to work together on the project.",
            "Our next milestone is planning the launch.",
        ):
            with self.subTest(statement=statement):
                self.assertEqual(self.decision(statement), "allow")

    def test_model_non_durable_is_not_silently_approved(self):
        self.assertEqual(self.decision("My favorite color is turquoise.", durable=False), "skip")

    def test_explicit_memory_commands_remain_user_controlled(self):
        from lumen.memory import memory_request
        recognized, content = memory_request(
            "Nova, remember that I want silly jokes.", "Nova"
        )
        self.assertTrue(recognized)
        self.assertEqual(content, "I want silly jokes.")

    def test_does_not_assume_names_or_specific_users(self):
        for name in ("Nova", "Atlas", "Aria"):
            self.assertEqual(self.decision(
                f"{name}, can you hear me clearly?"
            ), "skip")


if __name__ == "__main__":
    unittest.main()

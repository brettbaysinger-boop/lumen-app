import unittest
from lumen.memory import has_save_claim


class DayWriteClaimTests(unittest.TestCase):
    def test_unexecuted_success_claims_are_detected(self):
        for text in [
            "I've created the project for you!",
            "I have also added the project to your My Day.",
            "I've updated the Copper Garden project with those two tasks.",
            "I created a project called Synthetic Garden.",
            "The project has been created.",
            "I've completed your task.",
        ]:
            with self.subTest(text=text):
                self.assertTrue(has_save_claim(text))

    def test_suggestions_negation_and_drafts_are_not_success_claims(self):
        for text in [
            "Here are two suggested tasks.",
            "Would you like to create a project?",
            "I haven't created the project.",
            "The project was not created.",
            "I've created a draft plan for your project.",
            "I created an example checklist for discussion.",
        ]:
            with self.subTest(text=text):
                self.assertFalse(has_save_claim(text))


if __name__ == "__main__":
    unittest.main()

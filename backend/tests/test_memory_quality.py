import unittest

from lumen.memory_quality import (
    evidence_has_explicit_user_owner,
    subject_content_issue,
    transient_memory_candidate,
)


class MemoryQualityTests(unittest.TestCase):
    def test_clear_user_companion_and_shared_contradictions(self):
        self.assertIsNotNone(subject_content_issue(
            "The user wants Lumen to learn coding.", "companion", "preference", "Lumen"
        ))
        self.assertIsNotNone(subject_content_issue(
            "Lumen's birthday is October 3.", "user", "semantic", "Lumen"
        ))
        self.assertIsNotNone(subject_content_issue(
            "The user and Lumen built this together.", "user", "episodic", "Lumen"
        ))
        self.assertIsNotNone(subject_content_issue(
            "The user's next step is testing memory.", "unknown", "episodic", "Lumen"
        ))

    def test_valid_relationship_shared_wording_is_not_overruled(self):
        self.assertIsNone(subject_content_issue(
            "The user refers to Nova as captain.", "shared", "relationship", "Nova"
        ))
        self.assertIsNone(subject_content_issue(
            "The user wants Nova to learn coding.", "user", "preference", "Nova"
        ))
        self.assertIsNone(subject_content_issue(
            "Nova's learning queue includes Python.", "companion", "semantic", "Nova"
        ))

    def test_companion_name_is_runtime_data_not_lumen_specific(self):
        for companion in ("Nova", "Aria", "Atlas", "Companion One"):
            self.assertIsNotNone(subject_content_issue(
                f"The user wants {companion} to learn Python.",
                "companion",
                "preference",
                companion,
            ))
            self.assertIsNone(subject_content_issue(
                f"{companion}'s preferred voice is calm.",
                "companion",
                "preference",
                companion,
            ))

    def test_transient_unknown_feedback_is_rejected(self):
        for text in ("Still has clothes on. Wtf!!???", "Try again.", "Not quite right."):
            self.assertTrue(transient_memory_candidate(
                text, text, "unknown", "episodic", durable=True
            ))
        self.assertTrue(transient_memory_candidate(
            "The user is building Lumen.", "I am building Lumen.",
            "user", "semantic", durable=False
        ))
        self.assertFalse(transient_memory_candidate(
            "The user's next step is testing memory.",
            "My next step is testing memory.",
            "user", "episodic", durable=True
        ))

    def test_explicit_user_evidence(self):
        for text in ("I like summer.", "My project is Lumen.", "Tell me my name."):
            self.assertTrue(evidence_has_explicit_user_owner(text))
        self.assertFalse(evidence_has_explicit_user_owner(
            "Her dark wavy hair is styled in curls."
        ))


if __name__ == "__main__":
    unittest.main()

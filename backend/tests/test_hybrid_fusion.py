"""Fictional, database-free RRF checks; no real memories or external calls."""
import unittest

from lumen.hybrid_fusion import HybridFusionError, fuse_ranked_memories


A = "fictional-companion-a"
B = "fictional-companion-b"


def row(mid, companion=A, **extras):
    return {"id": mid, "companion_id": companion, "content": "Fictional fact", **extras}


class HybridFusionTests(unittest.TestCase):
    def test_two_arms_promote_shared_fact(self):
        result = fuse_ranked_memories([row("lone"), row("target")],
                                      [row("target"), row("other")], companion_id=A)
        self.assertEqual(result[0]["memory_id"], "target")
        self.assertEqual(result[0]["matched_arms"], ["lexical", "semantic"])
        self.assertEqual(result[0]["lexical_rank"], 2)
        self.assertEqual(result[0]["semantic_rank"], 1)

    def test_unrelated_companion_never_enters_output(self):
        result = fuse_ranked_memories([row("foreign", B), row("mine")],
                                      [row("foreign", B), row("mine")], companion_id=A)
        self.assertEqual([x["memory_id"] for x in result], ["mine"])

    def test_deleted_inactive_and_superseded_absent(self):
        result = fuse_ranked_memories(
            [row("inactive", is_active=False), row("old", superseded_by="new"), row("new")],
            [row("stale", is_current=False), row("new")], companion_id=A)
        self.assertEqual([x["memory_id"] for x in result], ["new"])

    def test_duplicates_in_one_arm_do_not_inflate_score(self):
        one = fuse_ranked_memories([row("x")], [], companion_id=A)[0]["score"]
        twice = fuse_ranked_memories([row("x"), row("x")], [], companion_id=A)[0]["score"]
        self.assertEqual(one, twice)

    def test_semantic_stale_revision_cannot_boost_current_lexical(self):
        result = fuse_ranked_memories([row("fact", revision_version=4)],
                                      [row("fact", revision=3)], companion_id=A)
        self.assertEqual(result[0]["matched_arms"], ["lexical"])

    def test_over_500_candidates_still_eligible(self):
        lexical = [row(f"f-{i:04d}") for i in range(600)]
        semantic = [row("f-0550")]
        result = fuse_ranked_memories(lexical, semantic, companion_id=A, limit=12)
        self.assertTrue(any(x["memory_id"] == "f-0550" for x in result))

    def test_identical_scores_tie_break_by_stable_memory_id(self):
        result = fuse_ranked_memories([row("z")], [row("a")], companion_id=A)
        self.assertEqual([x["memory_id"] for x in result], ["a", "z"])

    def test_reject_bad_settings(self):
        for kw in ({"limit": 0}, {"rrf_k": 0}, {"limit": True}, {"companion_id": ""}):
            with self.subTest(kw=kw), self.assertRaises(HybridFusionError):
                fuse_ranked_memories([], [], **({"companion_id": A} | kw))


if __name__ == "__main__":
    unittest.main()

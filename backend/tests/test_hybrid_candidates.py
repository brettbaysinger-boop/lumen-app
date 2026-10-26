"""Full-scope fictional retrieval fixtures; no network, live secrets or model."""
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID

from lumen.hybrid_candidates import (
    HybridCandidatePreview, HybridCandidatesError,
    full_corpus_lexical_candidates,
)

A = str(UUID(int=1))
B = str(UUID(int=2))


def row(n, *, companion=A, content="Fictional unrelated note", active=True):
    return {"id": str(UUID(int=n + 10)), "companion_id": companion,
            "content": content, "tags": [], "is_active": active,
            "revision_version": 1, "subject": "user"}


class FakeRepo:
    def __init__(self, rows):
        self.rows = sorted(rows, key=lambda r: r["id"])
        self.calls = []

    async def _request(self, method, table, **kwargs):
        self.calls.append((method, table, kwargs))
        assert method == "GET" and table == "memories"
        p = kwargs["params"]
        cid = p["companion_id"][3:]
        rows = [r for r in self.rows if r["companion_id"] == cid and r["is_active"]]
        if p.get("id"):
            rows = [r for r in rows if r["id"] > p["id"][3:]]
        return rows[:int(p["limit"])]


class PageTests(unittest.IsolatedAsyncioTestCase):
    async def test_target_beyond_first_500_is_found_in_real_page_sequence(self):
        rows = [row(i) for i in range(1200)]
        rows[1100] = row(1100, content="The user prefers cinnamon in cookies")
        db = FakeRepo(rows)
        results = await full_corpus_lexical_candidates(db, A, "cinnamon cookies", page_size=200)
        self.assertEqual([r["id"] for r in results], [rows[1100]["id"]])
        self.assertEqual(len(db.calls), 7)  # 6 full pages + empty sentinel
        self.assertNotIn("importance.desc", str(db.calls))

    async def test_no_positive_lexical_match_abstains(self):
        db = FakeRepo([row(i) for i in range(5)])
        self.assertEqual(await full_corpus_lexical_candidates(db, A, "unseen banana"), [])

    async def test_sibling_companion_is_excluded_by_db_filter(self):
        db = FakeRepo([row(1, companion=B, content="cinnamon cookies")])
        self.assertEqual(await full_corpus_lexical_candidates(db, A, "cinnamon"), [])
        self.assertEqual(db.calls[0][2]["params"]["companion_id"], "eq." + A)

    async def test_inactive_fact_is_excluded_by_db_filter(self):
        db = FakeRepo([row(1, content="cinnamon", active=False)])
        self.assertEqual(await full_corpus_lexical_candidates(db, A, "cinnamon"), [])

    async def test_scanning_limit_fails_loudly_not_partial_result(self):
        db = FakeRepo([row(i, content="cinnamon") for i in range(9)])
        with self.assertRaises(HybridCandidatesError):
            await full_corpus_lexical_candidates(db, A, "cinnamon", page_size=3, max_scan=5)

    async def test_repeated_page_raises_instead_of_looping(self):
        db = SimpleNamespace(_request=AsyncMock(return_value=[row(1)]))
        with self.assertRaises(HybridCandidatesError):
            await full_corpus_lexical_candidates(db, A, "fictional", page_size=1)

    async def test_row_from_wrong_companion_fails_closed(self):
        db = SimpleNamespace(_request=AsyncMock(return_value=[row(1, companion=B)]))
        with self.assertRaises(HybridCandidatesError):
            await full_corpus_lexical_candidates(db, A, "fictional")

    async def test_invalid_query_and_limits_rejected(self):
        db = FakeRepo([])
        for query, kwargs in (("", {}), ("x" * 2001, {}), ("cookie", {"page_size": 0}),
                              ("cookie", {"limit": 1000}), ("cookie", {"max_scan": 0})):
            with self.subTest(query=query[:10], kwargs=kwargs), self.assertRaises(HybridCandidatesError):
                await full_corpus_lexical_candidates(db, A, query, **kwargs)


class HybridPreviewTests(unittest.IsolatedAsyncioTestCase):
    def new(self, rows, *, semantic=None, token="synthetic-jwt"):
        settings = SimpleNamespace(supabase_service_role_key="SYNTHETIC_SERVICE_ROLE",
                                   semantic_embedding_url="http://127.0.0.1:11435",
                                   semantic_embedding_timeout=15)
        db = FakeRepo(rows)
        embedder = SimpleNamespace(embed=AsyncMock(return_value=[[0.5] * 768]))
        index = SimpleNamespace(candidates=AsyncMock(return_value=semantic or []))
        return HybridCandidatePreview(settings, token, repository=db,
                                      embedder=embedder, semantic_index=index), db, embedder, index

    async def test_cross_arm_fuses_target_at_1100(self):
        rows = [row(i) for i in range(1200)]
        rows[1100] = row(1100, content="The user prefers cinnamon in cookies")
        sem = {"memory_id": rows[1100]["id"], "companion_id": A,
               "content": rows[1100]["content"], "revision": 1,
               "is_active": True, "is_current": True}
        service, db, embedder, index = self.new(rows, semantic=[sem])
        results = await service.candidates(A, "cinnamon cookies")
        self.assertEqual(results[0]["memory_id"], rows[1100]["id"])
        self.assertEqual(results[0]["matched_arms"], ["lexical", "semantic"])
        self.assertTrue(len(db.calls) >= 6)
        self.assertEqual(embedder.embed.call_count, 1)
        self.assertEqual(index.candidates.call_count, 1)

    async def test_deny_empty_and_service_role_token(self):
        for token in ("", "SYNTHETIC_SERVICE_ROLE"):
            with self.subTest(token=token), self.assertRaises(HybridCandidatesError):
                self.new([], token=token)

    async def test_semantic_wrong_companion_raises(self):
        service, _, _, _ = self.new([], semantic=[{"memory_id": row(1)["id"], "companion_id": B}])
        with self.assertRaises(HybridCandidatesError):
            await service.candidates(A, "cinnamon")

    async def test_vector_failure_does_not_silently_claim_hybrid_success(self):
        service, _, embedder, _ = self.new([row(1, content="cinnamon")])
        embedder.embed.side_effect = RuntimeError("fictional model outage")
        with self.assertRaises(RuntimeError):
            await service.candidates(A, "cinnamon")


if __name__ == "__main__":
    unittest.main()

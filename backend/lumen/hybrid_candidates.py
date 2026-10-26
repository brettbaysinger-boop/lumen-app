"""Opt-in, owner-scoped hybrid *candidate* preview; never returns a factual answer.

No route imports this module. An authenticated caller provides its access token;
PostgreSQL RLS is authoritative. This component also checks companion IDs and
fails loudly if a page looks inconsistent. A complete SQL snapshot and real
RLS/JWT negative tests are prerequisites for live use.
"""
from __future__ import annotations

from collections.abc import Mapping
from uuid import UUID

from .db import SupabaseRepository
from .hybrid_fusion import fuse_ranked_memories
from .memory_retrieval import rank_memories, terms
from .semantic_embedder import SemanticEmbedder
from .semantic_index import PROFILE, SemanticIndex, query_input


class HybridCandidatesError(ValueError):
    """Bounded error with no private memory text."""


def _uuid(value: str) -> str:
    if not isinstance(value, str):
        raise HybridCandidatesError("Invalid companion/memory identity")
    try:
        return str(UUID(value))
    except (ValueError, AttributeError):
        raise HybridCandidatesError("Invalid companion/memory identity") from None


def _positive_match(memory: Mapping, query_terms: set[str]) -> bool:
    tags = memory.get("tags") or []
    if not isinstance(tags, list):
        raise HybridCandidatesError("Invalid memory tags")
    content = memory.get("content")
    if not isinstance(content, str):
        raise HybridCandidatesError("Invalid memory content")
    return bool(query_terms & terms(content + " " + " ".join(tag for tag in tags if isinstance(tag, str))))


async def full_corpus_lexical_candidates(db, companion_id: str, query: str, *,
                                         limit: int = 64, page_size: int = 200,
                                         max_scan: int = 50000) -> list[dict]:
    """Read ALL eligible rows, not an importance-first slice, then rank matches.

    Deterministic UUID keyset pagination avoids silent PostgREST 1000-row range
    limits. A safety limit produces an explicit error instead of dropping late
    facts; it is not used as a search cutoff. Caller must use user JWT with RLS.
    Across-page consistency is not guaranteed without an SQL snapshot; this is
    a shadow-only implementation and should be replaced by a single SQL RPC
    before high-scale or user-visible deployment.
    """
    cid = _uuid(companion_id)
    if not isinstance(query, str) or not query.strip() or len(query) > 2000:
        raise HybridCandidatesError("Invalid query")
    for value, lo, hi, name in ((limit, 1, 64, "limit"),
                                (page_size, 1, 500, "page_size"),
                                (max_scan, 1, 1000000, "max_scan")):
        if type(value) is not int or not lo <= value <= hi:
            raise HybridCandidatesError("Invalid " + name)
    query_terms = terms(query)
    if not query_terms:
        return []
    matches: list[dict] = []
    cursor = None
    scanned = 0
    while True:
        params = {"companion_id": f"eq.{cid}", "is_active": "eq.true",
                  "order": "id.asc", "limit": str(page_size)}
        if cursor is not None:
            params["id"] = f"gt.{cursor}"
        rows = await db._request("GET", "memories", params=params)
        if not isinstance(rows, list) or len(rows) > page_size:
            raise HybridCandidatesError("Invalid memory page")
        if not rows:
            break
        for row in rows:
            if not isinstance(row, dict):
                raise HybridCandidatesError("Invalid memory page row")
            mid = _uuid(row.get("id"))
            if (cursor is not None and mid <= cursor) or _uuid(row.get("companion_id")) != cid:
                raise HybridCandidatesError("Memory scope or sort violation")
            if row.get("is_active") is not True:
                raise HybridCandidatesError("Inactive memory in active-only page")
            cursor = mid
            scanned += 1
            if scanned > max_scan:
                raise HybridCandidatesError("Full-corpus scan exceeds configured safety bound")
            if _positive_match(row, query_terms):
                matches.append(row)
        if len(rows) < page_size:
            break
    return rank_memories(matches, query, limit=limit)


class HybridCandidatePreview:
    """Lexical complete-corpus + exact-NN semantic candidate fusion, OFF by default.

    Deliberately returns ranked candidates, NOT a user-visible answer. Nothing
    in this class changes live routes/flags, stores embeddings or writes data.
    """
    def __init__(self, settings, access_token: str, *, repository=None,
                 embedder=None, semantic_index=None):
        if (not isinstance(access_token, str) or not access_token.strip()
                or access_token == settings.supabase_service_role_key):
            raise HybridCandidatesError("Authenticated user token required")
        self.settings = settings
        self.repository = repository or SupabaseRepository(settings, access_token)
        self.embedder = embedder or SemanticEmbedder(
            settings.semantic_embedding_url,
            timeout=settings.semantic_embedding_timeout,
        )
        self.index = semantic_index or SemanticIndex(self.repository)

    async def candidates(self, companion_id: str, query: str, *, limit: int = 12,
                         lexical_limit: int = 64, semantic_limit: int = 64,
                         page_size: int = 200, max_scan: int = 50000) -> list[dict]:
        cid = _uuid(companion_id)
        if type(limit) is not int or not 1 <= limit <= 64:
            raise HybridCandidatesError("Invalid result limit")
        # Refuse a vector failure rather than silently representing lexical
        # results as a successfully evaluated hybrid result.
        lexical = await full_corpus_lexical_candidates(
            self.repository, cid, query, limit=lexical_limit,
            page_size=page_size, max_scan=max_scan,
        )
        embeddings = await self.embedder.embed([query_input(query)])
        if not isinstance(embeddings, list) or len(embeddings) != 1:
            raise HybridCandidatesError("Invalid query embedding response")
        semantic = await self.index.candidates(
            cid, embeddings[0], model_digest=PROFILE["model_digest"],
            limit=semantic_limit,
        )
        if not isinstance(semantic, list) or any(
            not isinstance(row, dict) or _uuid(row.get("companion_id")) != cid
            for row in semantic
        ):
            raise HybridCandidatesError("Semantic candidate scope violation")
        return fuse_ranked_memories(lexical, semantic, companion_id=cid, limit=limit)

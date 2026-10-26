"""Deterministic rank-only fusion for independently authorized memory candidates.

This is an isolated, side-effect-free HYBRID-01 building block, not a retrieval
endpoint. Callers MUST enforce authenticated owner/companion/trust scope and
current-vector fingerprints in SQL before providing lexical/semantic arms.
"""
from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any


class HybridFusionError(ValueError):
    """Invalid fusion request; never embeds private memory text in errors."""


def _eligible(row: Mapping[str, Any], companion_id: str) -> bool:
    if not isinstance(row, Mapping):
        raise HybridFusionError("Candidate must be a mapping")
    return (
        row.get("companion_id") == companion_id
        and isinstance(row.get("id") or row.get("memory_id"), str)
        and bool(row.get("id") or row.get("memory_id"))
        and row.get("is_active", True) is True
        and row.get("is_current", True) is True
        and not row.get("superseded_by")
    )


def fuse_ranked_memories(
    lexical: Sequence[Mapping[str, Any]],
    semantic: Sequence[Mapping[str, Any]],
    *,
    companion_id: str,
    limit: int = 12,
    rrf_k: int = 60,
) -> list[dict[str, Any]]:
    """Fuse two ranked lists via reciprocal rank fusion, using only their ranks.

    No embedding similarity is interpreted as a calibrated relevance probability.
    Rows sharing an ID are fused; duplicated IDs within an arm count once. For
    same-ID lexical+semantic results, an inconsistent revision excludes only
    the semantic score, preserving a current lexical result. The caller MUST
    supply already-authorized and SQL-verified candidate rows; this function
    additionally rejects rows from sibling companions or marked stale/inactive.
    """
    if not isinstance(companion_id, str) or not companion_id:
        raise HybridFusionError("Companion identity required")
    if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 64:
        raise HybridFusionError("Invalid result limit")
    if isinstance(rrf_k, bool) or not isinstance(rrf_k, int) or not 1 <= rrf_k <= 1000:
        raise HybridFusionError("Invalid fusion constant")
    if not isinstance(lexical, (list, tuple)) or not isinstance(semantic, (list, tuple)):
        raise HybridFusionError("Ranked inputs must be lists")

    merged: dict[str, dict[str, Any]] = {}
    for arm, rows in (("lexical", lexical), ("semantic", semantic)):
        seen: set[str] = set()
        rank = 0
        for row in rows:
            if not _eligible(row, companion_id):
                continue
            memory_id = row.get("id") or row.get("memory_id")
            if memory_id in seen:
                continue
            seen.add(memory_id)
            rank += 1
            prior = merged.get(memory_id)
            if prior is not None and arm == "semantic":
                prior_revision = prior["memory"].get("revision_version", prior["memory"].get("revision"))
                this_revision = row.get("revision_version", row.get("revision"))
                if prior_revision is not None and this_revision is not None and prior_revision != this_revision:
                    continue  # Stale semantic candidate must not improve the ranking.
            if prior is None:
                prior = {"memory": dict(row), "score": 0.0, "lexical_rank": None,
                         "semantic_rank": None, "matched_arms": []}
                merged[memory_id] = prior
            prior["score"] += 1.0 / (rrf_k + rank)
            prior[f"{arm}_rank"] = rank
            prior["matched_arms"].append(arm)
            if arm == "lexical":
                prior["memory"] = dict(row)  # Latest eligible SQL memory row wins.

    ordered = sorted(merged.items(), key=lambda pair: (-pair[1]["score"], pair[0]))
    return [dict(memory_id=memory_id, **payload) for memory_id, payload in ordered[:limit]]

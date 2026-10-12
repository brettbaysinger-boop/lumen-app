"""Opt-in semantic candidate store. Not imported by Lumen's live runtime.

No model process, background task, or write is started at import. The repository
must carry the authenticated caller's access token. SQL remains authoritative
for authorization and revision checks. Scores are candidates, not truth labels.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
from dataclasses import dataclass
from typing import Any, Protocol
from uuid import UUID

MODEL = "nomic-embed-text:v1.5"
PROFILE = {
    "model_digest": "0a109f422b47e3a30ba2b10eca18548e944e8a23073ee3f3e947efcf3c45e59f",
    "dimensions": 768,
    "preprocess_version": "lumen-memory-content-topic-v1",
    "document_prefix": "search_document: ",
    "query_prefix": "search_query: ",
    "normalization": "l2",
    "num_ctx": 2048,
}
PROFILE_ID = hashlib.sha256(json.dumps(PROFILE, sort_keys=True).encode()).hexdigest()
MAX_BATCH = 64


class IndexContractError(ValueError):
    """Bounded error text; never includes memory content or credentials."""


def _check(ok: bool, message: str) -> None:
    if not ok:
        raise IndexContractError(message)


def _uuid(value: Any) -> str:
    _check(isinstance(value, str), "Invalid record identity")
    try:
        return str(UUID(value))
    except ValueError:
        raise IndexContractError("Invalid record identity") from None


def _limit(value: int) -> None:
    _check(type(value) is int and 1 <= value <= MAX_BATCH, "Invalid candidate limit")


def normalize_vector(values: Any) -> list[float]:
    _check(isinstance(values, (list, tuple)) and len(values) == PROFILE["dimensions"],
           "Embedding dimension mismatch")
    _check(all(type(x) in (float, int) for x in values), "Invalid embedding values")
    try:
        vector = [float(x) for x in values]
        norm = math.hypot(*vector)
    except (ValueError, OverflowError):
        raise IndexContractError("Invalid embedding range") from None
    _check(math.isfinite(norm) and norm > 1e-12, "Invalid embedding norm")
    _check(all(math.isfinite(x) for x in vector), "Invalid embedding values")
    return [x / norm for x in vector]


def document_input(content: str, tags: list[str]) -> str:
    """Same preprocessing as the accepted embedding *candidate* trial."""
    _check(isinstance(content, str) and bool(content.strip()) and "\x00" not in content,
           "Invalid memory text")
    _check(isinstance(tags, list) and all(isinstance(t, str) and "\x00" not in t for t in tags),
           "Invalid memory tags")
    topics = sorted({t[6:].replace("_", " ") for t in tags if t.startswith("topic:")})
    value = content.strip()
    if topics:
        value += "\nTopics: " + "; ".join(topics)
    _check(len(value) <= 4000, "Memory input exceeds bound")
    return PROFILE["document_prefix"] + value


def query_input(query: str) -> str:
    _check(isinstance(query, str) and 1 <= len(query.strip()) <= 2000 and "\x00" not in query,
           "Invalid search query")
    return PROFILE["query_prefix"] + query.strip()


@dataclass(frozen=True)
class Snapshot:
    memory_id: str
    companion_id: str
    revision: int
    fingerprint: str
    content: str
    subject: str
    source: str | None
    tags: tuple[str, ...]

    @classmethod
    def read(cls, row: Any, companion: str) -> "Snapshot":
        _check(isinstance(row, dict), "Invalid memory snapshot")
        mid, cid = _uuid(row.get("memory_id")), _uuid(row.get("companion_id"))
        _check(cid == _uuid(companion), "Unexpected companion in snapshot")
        version, fp = row.get("revision"), row.get("fingerprint")
        _check(type(version) is int and version >= 0, "Invalid memory revision")
        _check(isinstance(fp, str) and re.fullmatch(r"[0-9a-f]{64}", fp) is not None,
               "Invalid source fingerprint")
        _check(row.get("subject") in ("user", "companion", "shared", "unknown"), "Invalid memory subject")
        _check(row.get("source") is None or isinstance(row.get("source"), str), "Invalid memory source")
        tags = [] if row.get("tags") is None else row["tags"]
        document_input(row.get("content"), tags)
        return cls(mid, cid, version, fp, row["content"], row["subject"], row.get("source"), tuple(tags))

    def document(self) -> str:
        return document_input(self.content, list(self.tags))


class Repository(Protocol):
    async def _request(self, method: str, table: str, **kwargs: Any) -> Any: ...


class SemanticIndex:
    """Explicitly invoked API adapter. Does not replace get_relevant_memories."""
    def __init__(self, repository: Repository):
        self.db = repository

    async def pending(self, companion_id: str, *, limit: int = 32) -> list[Snapshot]:
        cid = _uuid(companion_id)
        _limit(limit)
        rows = await self.db._request("POST", "rpc/lumen_pending_memory_embeddings", json={
            "p_companion": cid, "p_profile": PROFILE_ID, "p_limit": limit,
        })
        _check(isinstance(rows, list) and len(rows) <= limit, "Invalid pending response")
        snapshots = [Snapshot.read(row, cid) for row in rows]
        _check(len({x.memory_id for x in snapshots}) == len(snapshots), "Duplicate memory snapshot")
        return snapshots

    async def store(self, snapshot: Snapshot, vector: Any, *, model_digest: str) -> str:
        _check(model_digest == PROFILE["model_digest"], "Unexpected embedding model digest")
        # The fingerprint comes from SQL, not a client reserialization of JSON.
        checked = Snapshot.read({**snapshot.__dict__, "tags": list(snapshot.tags)}, snapshot.companion_id)
        values = normalize_vector(vector)
        result = await self.db._request("POST", "rpc/lumen_store_memory_embedding", json={
            "p_companion": checked.companion_id, "p_memory": checked.memory_id,
            "p_revision": checked.revision, "p_fingerprint": checked.fingerprint,
            "p_profile": PROFILE_ID, "p_values": values,
        })
        _check(result in ("indexed", "already_indexed", "stale", "inactive"), "Invalid indexing receipt")
        return result

    async def candidates(self, companion_id: str, vector: Any, *, model_digest: str,
                         limit: int = 12) -> list[dict[str, Any]]:
        cid = _uuid(companion_id)
        _limit(limit)
        _check(model_digest == PROFILE["model_digest"], "Unexpected embedding model digest")
        rows = await self.db._request("POST", "rpc/lumen_match_memory_embeddings", json={
            "p_companion": cid, "p_profile": PROFILE_ID,
            "p_values": normalize_vector(vector), "p_limit": limit,
        })
        _check(isinstance(rows, list) and len(rows) <= limit, "Invalid candidate response")
        seen: set[str] = set()
        for row in rows:
            snapshot = Snapshot.read(row, cid)
            score = row.get("similarity")
            _check(type(score) in (int, float) and math.isfinite(score) and -1.00001 <= score <= 1.00001,
                   "Invalid candidate score")
            _check(snapshot.memory_id not in seen, "Duplicate candidate")
            seen.add(snapshot.memory_id)
        return rows

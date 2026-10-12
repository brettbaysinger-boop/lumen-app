"""Bounded semantic-memory indexing worker."""
from __future__ import annotations

from dataclasses import dataclass
from .db import SupabaseRepository
from .semantic_embedder import SemanticEmbedder, EmbeddingProviderError
from .semantic_index import PROFILE, SemanticIndex
from .config import Settings


@dataclass(frozen=True)
class IndexBatchResult:
    requested: int
    indexed: int
    already_indexed: int
    stale: int
    inactive: int
    failed: int

    def as_dict(self) -> dict[str, int]:
        return self.__dict__.copy()


async def index_memory_batch(settings: Settings, access_token: str, companion_id: str, *, limit: int | None = None) -> IndexBatchResult:
    if not access_token:
        raise ValueError("Authenticated token required")
    batch = limit if limit is not None else settings.semantic_embedding_batch
    if type(batch) is not int or not 1 <= batch <= 64:
        raise ValueError("Invalid semantic indexing batch")

    index = SemanticIndex(SupabaseRepository(settings, access_token))
    snapshots = await index.pending(companion_id, limit=batch)
    if not snapshots:
        return IndexBatchResult(0, 0, 0, 0, 0, 0)

    embedder = SemanticEmbedder(settings.semantic_embedding_url, timeout=settings.semantic_embedding_timeout)
    try:
        vectors = await embedder.embed([snapshot.document() for snapshot in snapshots])
    except EmbeddingProviderError:
        return IndexBatchResult(len(snapshots), 0, 0, 0, 0, len(snapshots))

    counts = {"indexed": 0, "already_indexed": 0, "stale": 0, "inactive": 0, "failed": 0}
    for snapshot, vector in zip(snapshots, vectors, strict=True):
        try:
            receipt = await index.store(snapshot, vector, model_digest=PROFILE["model_digest"])
            counts[receipt] += 1
        except Exception:
            counts["failed"] += 1

    return IndexBatchResult(len(snapshots), counts["indexed"], counts["already_indexed"],
                            counts["stale"], counts["inactive"], counts["failed"])

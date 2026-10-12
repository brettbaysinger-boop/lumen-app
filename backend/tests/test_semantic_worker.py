import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from lumen.semantic_index import Snapshot
from lumen.semantic_worker import index_memory_batch

def settings():
    return SimpleNamespace(
        semantic_embedding_batch=4,
        semantic_embedding_url="http://127.0.0.1:11435",
        semantic_embedding_timeout=30,
        supabase_url="http://127.0.0.1:54321",
        supabase_service_role_key="test",
    )

class WorkerTests(unittest.IsolatedAsyncioTestCase):
    async def test_empty_batch_does_not_embed(self):
        with patch("lumen.semantic_worker.SemanticIndex") as Index, patch("lumen.semantic_worker.SemanticEmbedder") as Embedder:
            Index.return_value.pending = AsyncMock(return_value=[])
            result = await index_memory_batch(settings(), "token", "00000000-0000-0000-0000-000000000001")
        self.assertEqual(result.requested, 0)
        Embedder.assert_not_called()

    async def test_receipts_counted(self):
        snapshots = [
            Snapshot(f"0000000{i}-0000-0000-0000-000000000000", "00000000-0000-0000-0000-000000000001",
                     0, "a"*64, f"fact {i}", "user", None, tuple())
            for i in range(1, 5)
        ]
        with patch("lumen.semantic_worker.SemanticIndex") as Index, patch("lumen.semantic_worker.SemanticEmbedder") as Embedder:
            idx = Index.return_value
            idx.pending = AsyncMock(return_value=snapshots)
            idx.store = AsyncMock(side_effect=["indexed","already_indexed","stale","inactive"])
            Embedder.return_value.embed = AsyncMock(return_value=[[1.0]+[0.0]*767 for _ in snapshots])
            result = await index_memory_batch(settings(), "token", "00000000-0000-0000-0000-000000000001")
        self.assertEqual(result.as_dict(), {"requested":4,"indexed":1,"already_indexed":1,"stale":1,"inactive":1,"failed":0})

    async def test_provider_failure_marks_batch_failed_without_store(self):
        from lumen.semantic_embedder import EmbeddingProviderError
        snapshot = Snapshot("00000001-0000-0000-0000-000000000000","00000000-0000-0000-0000-000000000001",
                            0,"a"*64,"fact","user",None,tuple())
        with patch("lumen.semantic_worker.SemanticIndex") as Index, patch("lumen.semantic_worker.SemanticEmbedder") as Embedder:
            idx = Index.return_value
            idx.pending = AsyncMock(return_value=[snapshot])
            Embedder.return_value.embed = AsyncMock(side_effect=EmbeddingProviderError("x"))
            result = await index_memory_batch(settings(), "token", "00000000-0000-0000-0000-000000000001")
        self.assertEqual(result.failed, 1)
        idx.store.assert_not_called()

    async def test_missing_token_refused_before_io(self):
        with patch("lumen.semantic_worker.SemanticIndex") as Index:
            with self.assertRaises(ValueError):
                await index_memory_batch(settings(), "", "00000000-0000-0000-0000-000000000001")
        Index.assert_not_called()

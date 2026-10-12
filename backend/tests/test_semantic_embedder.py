import unittest
from unittest.mock import patch
from lumen.semantic_embedder import SemanticEmbedder, EmbeddingProviderError
from lumen.semantic_index import MODEL, PROFILE

class FakeResponse:
    def __init__(self, payload): self.payload = payload
    def raise_for_status(self): pass
    def json(self): return self.payload

class FakeClient:
    def __init__(self, *a, **k): pass
    async def __aenter__(self): return self
    async def __aexit__(self, *a): return False
    async def get(self, url):
        return FakeResponse({"models":[{"name":MODEL,"digest":PROFILE["model_digest"]}]})
    async def post(self, url, json):
        return FakeResponse({"embeddings":[[1.0]+[0.0]*767 for _ in json["input"]]})

class EmbedderTests(unittest.IsolatedAsyncioTestCase):
    def test_public_origin_refused(self):
        with self.assertRaises(EmbeddingProviderError):
            SemanticEmbedder("http://8.8.8.8:11434")

    def test_credentials_refused(self):
        with self.assertRaises(EmbeddingProviderError):
            SemanticEmbedder("http://u:p@127.0.0.1:11434")

    async def test_model_digest_verified_and_vectors_normalized(self):
        with patch("lumen.semantic_embedder.httpx.AsyncClient", FakeClient):
            provider = SemanticEmbedder("http://127.0.0.1:11435")
            vectors = await provider.embed(["search_document: hello"])
        self.assertEqual((len(vectors), len(vectors[0])), (1, 768))
        self.assertAlmostEqual(vectors[0][0], 1.0)

    async def test_wrong_digest_refused(self):
        class Wrong(FakeClient):
            async def get(self, url):
                return FakeResponse({"models":[{"name":MODEL,"digest":"0"*64}]})
        with patch("lumen.semantic_embedder.httpx.AsyncClient", Wrong):
            with self.assertRaises(EmbeddingProviderError):
                await SemanticEmbedder("http://127.0.0.1:11435").embed(["x"])

    async def test_wrong_count_refused(self):
        class Wrong(FakeClient):
            async def post(self, url, json):
                return FakeResponse({"embeddings":[]})
        with patch("lumen.semantic_embedder.httpx.AsyncClient", Wrong):
            with self.assertRaises(EmbeddingProviderError):
                await SemanticEmbedder("http://127.0.0.1:11435").embed(["x"])

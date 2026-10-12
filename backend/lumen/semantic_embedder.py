"""Dedicated local embedding client for semantic memory."""
from __future__ import annotations

import ipaddress
from urllib.parse import urlparse
import httpx

from .semantic_index import MODEL, PROFILE, IndexContractError, normalize_vector


class EmbeddingProviderError(RuntimeError):
    """Bounded provider error; never includes private text or remote response bodies."""


def _private_origin(value: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise EmbeddingProviderError("Semantic embedding provider is not configured")
    try:
        parsed = urlparse(value.strip())
        if parsed.scheme != "http" or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError
        if parsed.path not in ("", "/") or parsed.port is None:
            raise ValueError
        host = parsed.hostname
        if not host:
            raise ValueError
        if host != "localhost":
            ip = ipaddress.ip_address(host)
            if not (ip.is_loopback or ip.is_private):
                raise ValueError
    except ValueError:
        raise EmbeddingProviderError("Semantic embedding provider must be a private HTTP origin") from None
    return value.rstrip("/")


class SemanticEmbedder:
    def __init__(self, origin: str, *, timeout: float = 30.0):
        self.origin = _private_origin(origin)
        if not isinstance(timeout, (int, float)) or not 1 <= float(timeout) <= 120:
            raise EmbeddingProviderError("Invalid semantic embedding timeout")
        self.timeout = float(timeout)
        self._verified = False

    async def verify_model(self) -> None:
        try:
            async with httpx.AsyncClient(timeout=self.timeout, trust_env=False, follow_redirects=False) as client:
                response = await client.get(f"{self.origin}/api/tags")
                response.raise_for_status()
                payload = response.json()
        except Exception as exc:
            raise EmbeddingProviderError("Semantic embedding provider unavailable") from exc
        models = payload.get("models") if isinstance(payload, dict) else None
        if not isinstance(models, list):
            raise EmbeddingProviderError("Semantic embedding provider returned invalid inventory")
        found = next((x for x in models if isinstance(x, dict) and x.get("name") == MODEL), None)
        if not found or found.get("digest") != PROFILE["model_digest"]:
            raise EmbeddingProviderError("Required semantic embedding model digest is unavailable")
        self._verified = True

    async def embed(self, inputs: list[str]) -> list[list[float]]:
        if not self._verified:
            await self.verify_model()
        if not isinstance(inputs, list) or not 1 <= len(inputs) <= 64:
            raise EmbeddingProviderError("Invalid embedding batch")
        if any(not isinstance(x, str) or not x or len(x) > 5000 or "\x00" in x for x in inputs):
            raise EmbeddingProviderError("Invalid embedding input")
        try:
            async with httpx.AsyncClient(timeout=self.timeout, trust_env=False, follow_redirects=False) as client:
                response = await client.post(
                    f"{self.origin}/api/embed",
                    json={
                        "model": MODEL,
                        "input": inputs,
                        "truncate": False,
                        "keep_alive": "10m",
                        "options": {"num_ctx": PROFILE["num_ctx"]},
                    },
                )
                response.raise_for_status()
                payload = response.json()
        except Exception as exc:
            raise EmbeddingProviderError("Semantic embedding request failed") from exc
        raw = payload.get("embeddings") if isinstance(payload, dict) else None
        if not isinstance(raw, list) or len(raw) != len(inputs):
            raise EmbeddingProviderError("Semantic embedding provider returned wrong result count")
        try:
            return [normalize_vector(vector) for vector in raw]
        except IndexContractError as exc:
            raise EmbeddingProviderError(str(exc)) from exc

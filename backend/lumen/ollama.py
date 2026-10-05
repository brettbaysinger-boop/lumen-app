import time

import httpx

from .config import Settings


class OllamaProvider:
    name = "ollama"

    def __init__(self, settings: Settings):
        self.base_url = settings.ollama_url.rstrip("/")

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=3) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                return response.is_success
        except httpx.HTTPError:
            return False

    async def list_models(self) -> list[str]:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(f"{self.base_url}/api/tags")
            response.raise_for_status()
            return sorted({m["name"] for m in response.json().get("models", [])
                           if isinstance(m.get("name"), str)})

    async def structured(self, model: str, messages: list[dict], schema: dict) -> str:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(f"{self.base_url}/api/chat", json={
                "model": model, "messages": messages, "stream": False, "format": schema,
                "options": {"temperature": 0, "num_predict": 1000},
            })
            response.raise_for_status()
            return response.json()["message"]["content"]

    async def generate(self, model: str, messages: list[dict], temperature: float = 0.7) -> dict:
        started = time.perf_counter()
        async with httpx.AsyncClient(timeout=180) as client:
            response = await client.post(
                f"{self.base_url}/api/chat",
                json={
                    "model": model,
                    "messages": messages,
                    "stream": False,
                    "options": {"temperature": temperature},
                },
            )
            response.raise_for_status()
            data = response.json()

        return {
            "content": data.get("message", {}).get("content", ""),
            "model": data.get("model", model),
            "latency_ms": round((time.perf_counter() - started) * 1000),
            "tokens_in": data.get("prompt_eval_count"),
            "tokens_out": data.get("eval_count"),
        }

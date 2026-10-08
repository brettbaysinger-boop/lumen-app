import logging
import time
import json
import asyncio

# Shared within one API process: background extraction never overlaps generation.
model_lock = asyncio.Lock()
observation_tasks: set[asyncio.Task] = set()

async def prioritize_chat():
    # Cancel only extraction tasks. Other foreground replies keep their queue order.
    tasks = list(observation_tasks)
    for task in tasks:
        task.cancel()
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)

import httpx

from .config import Settings


class OllamaProvider:
    name = "ollama"

    def __init__(self, settings: Settings):
        self.base_url = settings.ollama_url.rstrip("/")
        self.context_length = getattr(settings, "chat_context_length", 8192)
        self.keep_alive = getattr(settings, "ollama_keep_alive", "15m")
        self.max_reply_tokens = getattr(settings, "chat_max_reply_tokens", 8192)

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

    async def supports_vision(self, model: str) -> bool | None:
        # Unknown capability never means permission to send an image.
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                response = await client.post(f"{self.base_url}/api/show", json={"model": model})
                response.raise_for_status()
                capabilities = response.json().get("capabilities")
                if not isinstance(capabilities, list):
                    return None
                return "vision" in capabilities
        except (httpx.HTTPError, ValueError, AttributeError):
            return None

    async def structured(self, model: str, messages: list[dict], schema: dict, *, max_tokens: int = 1000, timeout: float = 60, think: bool | None = None) -> str:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(f"{self.base_url}/api/chat", json={
                "model": model, "messages": messages, "stream": False, "format": schema,
                "keep_alive": self.keep_alive,
                **({"think": think} if think is not None else {}),
                "options": {"temperature": 0, "num_predict": max_tokens, "num_ctx": self.context_length},
            })
            response.raise_for_status()
            data=response.json()
            content=data.get('message',{}).get('content','')
            if think is not None:
                reason=data.get('done_reason')
                logging.getLogger(__name__).warning('Structured draft response model=%s content_chars=%s eval_count=%s done_reason=%s',
                    model,len(content),data.get('eval_count') if isinstance(data.get('eval_count'),int) else None,
                    reason if reason in ('stop','length','load','unload') else 'other')
            return content

    async def generate(self, model: str, messages: list[dict], temperature: float = 0.7) -> dict:
        started = time.perf_counter()
        async with httpx.AsyncClient(timeout=600) as client:
            response = await client.post(
                f"{self.base_url}/api/chat",
                json={
                    "model": model,
                    "messages": messages,
                    "stream": False,
                    "keep_alive": self.keep_alive,
                    "options": {"temperature": temperature, "num_ctx": self.context_length, "num_predict": self.max_reply_tokens},
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

    async def generate_stream(self, model, messages, emit):
        started = time.perf_counter()
        content = ""
        final = None
        async with httpx.AsyncClient(timeout=600) as client:
            async with client.stream("POST", f"{self.base_url}/api/chat", json={
                "model": model, "messages": messages, "stream": True,
                "keep_alive": self.keep_alive,
                "options": {"temperature": 0.7, "num_ctx": self.context_length, "num_predict": self.max_reply_tokens},
            }) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    data = json.loads(line)
                    if data.get("error"):
                        raise RuntimeError("Ollama generation failed")
                    # Activity is shown separately; do not manufacture or expose hidden reasoning.
                    delta = data.get("message", {}).get("content", "")
                    if delta:
                        content += delta
                        await emit({"type": "delta", "text": delta})
                    if data.get("done"):
                        final = data
        if final is None:
            raise RuntimeError("Incomplete Ollama stream")
        timings = {key: round(final.get(key, 0) / 1_000_000) for key in
                   ("load_duration", "prompt_eval_duration", "eval_duration")}
        logging.getLogger(__name__).info("Chat timing model=%s context=%s timings_ms=%s", model, self.context_length, timings)
        return {"content": content, "model": final.get("model", model),
                "latency_ms": round((time.perf_counter() - started) * 1000),
                "tokens_in": final.get("prompt_eval_count"), "tokens_out": final.get("eval_count"),
                "timings_ms": timings}

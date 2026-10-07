"""Inspect local Ollama capabilities without printing secrets or private chats."""
import asyncio
import httpx
from lumen.config import get_settings


async def main():
    base = get_settings().ollama_url.rstrip('/')
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(base + '/api/tags')
        response.raise_for_status()
        models = response.json().get('models', [])
        if not models:
            print('No installed models reported.')
        for model in models:
            name = model.get('name')
            if not isinstance(name, str):
                continue
            try:
                response = await client.post(base + '/api/show', json={'model': name})
                response.raise_for_status()
                capabilities = response.json().get('capabilities')
                print(name, capabilities if isinstance(capabilities, list) else 'capabilities unknown')
            except (httpx.HTTPError, ValueError):
                print(name, 'capability check failed')


asyncio.run(main())

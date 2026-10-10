import asyncio
import json
import secrets
import time
import uuid
from pathlib import Path
from typing import Any

import httpx

from .config import Settings


class ImageProviderError(RuntimeError):
    pass


class ImageProviderNotConfigured(ImageProviderError):
    pass


class ComfyUIProvider:
    name = "comfyui"

    def __init__(self, settings: Settings):
        self.base_url = settings.comfyui_url.rstrip("/")
        self.workflow_path = settings.comfyui_workflow.strip()
        self.timeout = settings.image_generation_timeout

    async def health_check(self) -> bool:
        if not self.base_url:
            return False
        try:
            async with httpx.AsyncClient(timeout=3) as client:
                response = await client.get(f"{self.base_url}/system_stats")
                return response.is_success
        except httpx.HTTPError:
            return False

    def _load_workflow(self, prompt: str) -> dict[str, Any]:
        if not self.workflow_path:
            raise ImageProviderNotConfigured(
                "ComfyUI is connected, but no workflow is configured."
            )

        path = Path(self.workflow_path)
        if not path.is_file():
            raise ImageProviderNotConfigured(
                f"ComfyUI workflow not found: {self.workflow_path}"
            )

        try:
            workflow = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError) as exc:
            raise ImageProviderNotConfigured(
                "The configured ComfyUI workflow could not be loaded."
            ) from exc

        # Workflow API JSON may use this sentinel anywhere a positive prompt
        # string belongs. This avoids coupling Lumen to specific ComfyUI node IDs.
        prompt_replaced = False
        seed = secrets.randbelow(2**32)

        def substitute(value: Any) -> Any:
            nonlocal prompt_replaced
            if isinstance(value, str) and value == "{{LUMEN_PROMPT}}":
                prompt_replaced = True
                return prompt
            if isinstance(value, str) and value == "{{LUMEN_SEED}}":
                return seed
            if isinstance(value, list):
                return [substitute(item) for item in value]
            if isinstance(value, dict):
                return {key: substitute(item) for key, item in value.items()}
            return value

        workflow = substitute(workflow)

        if not prompt_replaced:
            raise ImageProviderNotConfigured(
                "ComfyUI workflow must contain {{LUMEN_PROMPT}}."
            )

        return workflow

    async def generate(self, prompt: str) -> dict[str, Any]:
        if not self.base_url:
            raise ImageProviderNotConfigured(
                "Image generation is not configured."
            )

        workflow = self._load_workflow(prompt)
        client_id = str(uuid.uuid4())
        started = time.perf_counter()

        timeout = httpx.Timeout(self.timeout)

        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{self.base_url}/prompt",
                json={"prompt": workflow, "client_id": client_id},
            )
            response.raise_for_status()

            prompt_id = response.json().get("prompt_id")
            if not isinstance(prompt_id, str) or not prompt_id:
                raise ImageProviderError(
                    "ComfyUI did not return a prompt ID."
                )

            deadline = time.monotonic() + self.timeout

            while time.monotonic() < deadline:
                history_response = await client.get(
                    f"{self.base_url}/history/{prompt_id}"
                )
                history_response.raise_for_status()

                history = history_response.json()
                result = history.get(prompt_id)

                if isinstance(result, dict):
                    status = result.get("status", {})
                    if status.get("status_str") == "error":
                        raise ImageProviderError(
                            "ComfyUI could not complete the workflow."
                        )

                    outputs = result.get("outputs", {})
                    for node_output in outputs.values():
                        if not isinstance(node_output, dict):
                            continue

                        images = node_output.get("images", [])
                        if not images:
                            continue

                        image = images[0]
                        filename = image.get("filename")
                        if not filename:
                            continue

                        params = {
                            "filename": filename,
                            "subfolder": image.get("subfolder", ""),
                            "type": image.get("type", "output"),
                        }

                        image_response = await client.get(
                            f"{self.base_url}/view",
                            params=params,
                        )
                        image_response.raise_for_status()

                        return {
                            "bytes": image_response.content,
                            "mime_type": image_response.headers.get(
                                "content-type", "image/png"
                            ).split(";")[0],
                            "provider": self.name,
                            "model": "comfyui-workflow",
                            "latency_ms": round(
                                (time.perf_counter() - started) * 1000
                            ),
                        }

                await asyncio.sleep(1)

        raise ImageProviderError(
            "ComfyUI timed out while generating the image."
        )


def create_image_provider(settings: Settings):
    provider = settings.image_provider.strip().lower()

    if provider == "comfyui":
        return ComfyUIProvider(settings)

    raise ImageProviderNotConfigured(
        f"Unsupported image provider: {settings.image_provider}"
    )


_COMPANION_SELF_PATTERNS = (
    r"\byourself\b",
    r"\bof you\b",
    r"\bwith you\b",
)


def compose_image_prompt(
    user_prompt: str,
    companion_name: str,
    visual_identity: str | None,
) -> tuple[str, str | None]:
    """Resolve explicit companion-self references for image generation.

    Returns (provider_prompt, subject). Ordinary image requests remain
    unchanged. A companion visual identity is used only when the user
    explicitly makes the companion a subject of the requested image.
    """
    import re

    if not visual_identity or not visual_identity.strip():
        return user_prompt, None

    companion_name = companion_name.strip()
    patterns = list(_COMPANION_SELF_PATTERNS)

    if companion_name:
        # A name used to address the companion is not an image subject.
        # Require a depiction relationship: "of Lumen", "paint Lumen", etc.
        name = re.escape(companion_name)
        patterns.append(
            rf"\b(?:of|with|featuring|depicting|showing|include|depict|draw|paint|render|illustrate)"
            rf"\s+{name}\b"
        )

    if not any(re.search(pattern, user_prompt, re.IGNORECASE) for pattern in patterns):
        return user_prompt, None

    identity = visual_identity.strip()
    name = companion_name or "the companion"

    provider_prompt = (
        f"Depict {name} as the subject using this persistent visual identity: "
        f"{identity}\n\n"
        f"User's requested image: {user_prompt}\n\n"
        f"Keep {name}'s identifying physical traits consistent with the "
        "persistent visual identity while following the requested scene, "
        "clothing, expression, composition, and style."
    )

    return provider_prompt, "companion"

"""Clients for the existing video generators on Heavy. No new engine lives here.

* ``FramePackProvider`` calls the FramePack Gradio app (``demo_gradio.py``) through
  Gradio's documented HTTP API: upload, call, stream events, download.
  Inputs are matched by their labels from ``/gradio_api/info`` so a minor UI
  difference between FramePack builds does not silently shift arguments.
* ``run_comfy_video_workflow`` runs an owner-exported ComfyUI API workflow
  (Wan2.2 text-to-video, or an image-to-video graph) with ``{{LUMEN_*}}``
  placeholders, and returns the first video file it produces.

Only the backend talks to these services. URLs never leave this process.
"""
from __future__ import annotations

import asyncio
import json
import re
import secrets
import time
from pathlib import Path
from typing import Any, Awaitable, Callable

import httpx

from .images import ImageProviderError, ImageProviderNotConfigured

Progress = Callable[[int, str], Awaitable[None]]

VIDEO_TYPES = {".mp4": "video/mp4", ".webm": "video/webm"}


async def _no_progress(_percent: int, _stage: str) -> None:
    return None


def video_mime(filename: str) -> str | None:
    return VIDEO_TYPES.get(Path(filename).suffix.lower())


def frame_count(seconds: float, fps: int) -> int:
    # Wan-style models expect 4n+1 frames.
    frames = max(5, round(seconds * fps))
    return frames + (-(frames - 1)) % 4


# --------------------------------------------------------------------------- ComfyUI


def load_video_workflow(path_text: str, values: dict[str, Any]) -> dict[str, Any]:
    if not path_text.strip():
        raise ImageProviderNotConfigured("No ComfyUI video workflow is configured.")
    path = Path(path_text.strip())
    if not path.is_file():
        raise ImageProviderNotConfigured("The ComfyUI video workflow file was not found.")
    try:
        workflow = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise ImageProviderNotConfigured("The ComfyUI video workflow could not be loaded.") from exc
    used: set[str] = set()

    def substitute(value: Any) -> Any:
        if isinstance(value, str) and value in values:
            used.add(value)
            return values[value]
        if isinstance(value, list):
            return [substitute(item) for item in value]
        if isinstance(value, dict):
            return {key: substitute(item) for key, item in value.items()}
        return value

    workflow = substitute(workflow)
    if "{{LUMEN_PROMPT}}" not in used:
        raise ImageProviderNotConfigured("The ComfyUI video workflow must contain {{LUMEN_PROMPT}}.")
    if "{{LUMEN_INIT_IMAGE}}" in values and "{{LUMEN_INIT_IMAGE}}" not in used:
        raise ImageProviderNotConfigured("The image-to-video workflow must contain {{LUMEN_INIT_IMAGE}}.")
    return workflow


def find_video_output(outputs: dict[str, Any]) -> dict[str, str] | None:
    """Return the first video file in a ComfyUI history entry.

    VideoHelperSuite reports videos under ``gifs``; ComfyUI's own SaveVideo/SaveWEBM
    nodes report under ``images`` (with ``animated``) or ``videos``.
    """
    for node_output in outputs.values():
        if not isinstance(node_output, dict):
            continue
        for key in ("gifs", "videos", "video", "images"):
            for item in node_output.get(key) or []:
                if isinstance(item, dict) and isinstance(item.get("filename"), str) and video_mime(item["filename"]):
                    return {"filename": item["filename"], "subfolder": item.get("subfolder", ""),
                            "type": item.get("type", "output")}
    return None


async def free_comfy_memory(base_url: str) -> None:
    """Ask ComfyUI to release VRAM before FramePack runs on the same 16 GB GPU."""
    if not base_url:
        return
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            await client.post(f"{base_url.rstrip('/')}/free", json={"unload_models": True, "free_memory": True})
    except httpx.HTTPError:
        pass


async def run_comfy_video_workflow(base_url: str, workflow_path: str, *, prompt: str, negative: str,
                                   seconds: float, fps: int, timeout: int,
                                   init_image: tuple[bytes, str] | None = None,
                                   on_progress: Progress = _no_progress) -> dict[str, Any]:
    base_url = base_url.rstrip("/")
    if not base_url:
        raise ImageProviderNotConfigured("ComfyUI is not configured.")
    started = time.perf_counter()
    async with httpx.AsyncClient(timeout=httpx.Timeout(60)) as client:
        values: dict[str, Any] = {
            "{{LUMEN_PROMPT}}": prompt,
            "{{LUMEN_NEGATIVE}}": negative,
            "{{LUMEN_SEED}}": secrets.randbelow(2**32),
            "{{LUMEN_FRAMES}}": frame_count(seconds, fps),
            "{{LUMEN_FPS}}": fps,
            "{{LUMEN_SECONDS}}": seconds,
        }
        if init_image is not None:
            content, mime = init_image
            ext = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}.get(mime, "png")
            uploaded = await client.post(f"{base_url}/upload/image",
                                         files={"image": (f"lumen-{secrets.token_hex(8)}.{ext}", content, mime)},
                                         data={"type": "input", "overwrite": "false"})
            uploaded.raise_for_status()
            info = uploaded.json()
            name = info.get("name")
            if not isinstance(name, str) or not name:
                raise ImageProviderError("ComfyUI did not accept the source image.")
            values["{{LUMEN_INIT_IMAGE}}"] = f"{info['subfolder']}/{name}" if info.get("subfolder") else name
        workflow = load_video_workflow(workflow_path, values)
        response = await client.post(f"{base_url}/prompt",
                                     json={"prompt": workflow, "client_id": secrets.token_hex(16)})
        if response.status_code == 400:
            raise ImageProviderError("ComfyUI rejected the video workflow. Check its nodes and models on Heavy.")
        response.raise_for_status()
        prompt_id = response.json().get("prompt_id")
        if not isinstance(prompt_id, str) or not prompt_id:
            raise ImageProviderError("ComfyUI did not return a prompt ID.")
        await on_progress(5, "Waiting for the GPU…")
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            history = (await client.get(f"{base_url}/history/{prompt_id}")).json()
            entry = history.get(prompt_id) if isinstance(history, dict) else None
            if isinstance(entry, dict):
                status = entry.get("status") or {}
                if status.get("status_str") == "error":
                    raise ImageProviderError("ComfyUI could not complete the video workflow.")
                found = find_video_output(entry.get("outputs") or {})
                if found:
                    await on_progress(97, "Saving the video…")
                    video = await client.get(f"{base_url}/view", params=found)
                    video.raise_for_status()
                    return {"bytes": video.content, "mime_type": video_mime(found["filename"]),
                            "provider": "comfyui", "model": Path(workflow_path).stem,
                            "latency_ms": round((time.perf_counter() - started) * 1000)}
                if status.get("completed"):
                    raise ImageProviderError("The video workflow finished without a video output.")
            else:
                queue = (await client.get(f"{base_url}/queue")).json()
                running = any(isinstance(item, list) and len(item) > 1 and item[1] == prompt_id
                              for item in queue.get("queue_running", []))
                elapsed = time.monotonic() - (deadline - timeout)
                if running:
                    # ComfyUI's HTTP API has no step progress; show elapsed-time progress, never 100%.
                    await on_progress(min(90, 10 + int(elapsed / 6)), "Rendering the video…")
                else:
                    await on_progress(5, "Waiting for the GPU…")
            await asyncio.sleep(2)
        try:
            await client.post(f"{base_url}/interrupt")
        except httpx.HTTPError:
            pass
    raise ImageProviderError("ComfyUI timed out while making the video.")


# --------------------------------------------------------------------------- FramePack


_PERCENT = re.compile(r"(\d{1,3})\s*%")
_VIDEO_LENGTH = re.compile(r"Video length:\s*([\d.]+)\s*seconds", re.IGNORECASE)


class FramePackNeedsAdapter(ImageProviderNotConfigured):
    """The endpoint is not the simple FramePack demo shape; a dedicated adapter is required."""


_MEDIA_COMPONENTS = ("image", "video", "file", "imageeditor")
_UNSUPPORTED_LABELS = ("generation type", "model type", "end frame", "video input")


def framepack_arguments(parameters: list[dict[str, Any]], *, image: dict[str, Any], prompt: str,
                        negative: str, seed: int, seconds: float) -> list[Any]:
    """Map Lumen's values onto the simple FramePack demo endpoint (one image, prompt, length).

    Fails closed on anything else. FramePack-Studio's ``/handle_start_button`` and ``/partial``
    (generation type, start/end frames, video input, queue results) are not this shape and are
    refused here rather than guessed at: they need their own verified adapter.
    """
    media = [p for p in parameters if str(p.get("component") or "").lower() in _MEDIA_COMPONENTS]
    if len(media) != 1:
        raise FramePackNeedsAdapter(
            f"This FramePack endpoint has {len(media)} image/video inputs; Lumen only supports exactly one.")
    data: list[Any] = []
    for parameter in parameters:
        label = f'{parameter.get("label") or ""} {parameter.get("parameter_name") or ""}'.strip().lower()
        component = str(parameter.get("component") or "").lower()
        if any(word in label for word in _UNSUPPORTED_LABELS):
            raise FramePackNeedsAdapter(f"FramePack input '{label}' needs a dedicated adapter.")
        if parameter is media[0]:
            data.append(image)
        elif "negative" in label:
            data.append(negative)
        elif "prompt" in label:
            data.append(prompt)
        elif "seed" in label:
            data.append(seed)
        elif "length" in label or "second" in label:
            data.append(seconds)
        elif parameter.get("parameter_has_default"):
            data.append(parameter.get("parameter_default"))
        else:
            raise ImageProviderNotConfigured(f"FramePack input '{label or component}' has no default.")
    if image not in data or prompt not in data or seconds not in data:
        raise ImageProviderNotConfigured("FramePack's inputs did not match image, prompt and length.")
    return data


def framepack_progress(values: Any, seconds: float) -> int | None:
    texts = [value for value in values if isinstance(value, str)] if isinstance(values, list) else []
    for text in texts:
        match = _VIDEO_LENGTH.search(text)
        if match and seconds > 0:
            return max(10, min(95, round(float(match.group(1)) / seconds * 100)))
    for text in texts:
        match = _PERCENT.search(text)
        if match:
            return max(5, min(95, int(match.group(1))))
    return None


def framepack_video_path(values: Any) -> str | None:
    if not isinstance(values, list) or not values:
        return None
    first = values[0]
    if isinstance(first, dict) and isinstance(first.get("video"), dict):
        first = first["video"]
    if isinstance(first, dict) and isinstance(first.get("path"), str):
        return first["path"]
    if isinstance(first, str) and first.endswith((".mp4", ".webm")):
        return first
    return None


class FramePackProvider:
    name = "framepack"

    def __init__(self, settings):
        self.base_url = settings.framepack_url.rstrip("/")
        api_name = settings.framepack_api_name.strip() or "/process"
        self.api_name = api_name if api_name.startswith("/") else "/" + api_name
        self.timeout = settings.video_generation_timeout

    async def _endpoint(self, client: httpx.AsyncClient) -> tuple[str, list[dict[str, Any]]]:
        """Find the Gradio API prefix (Gradio 5: /gradio_api, Gradio 4: none) and the inputs."""
        for prefix in ("/gradio_api", ""):
            try:
                response = await client.get(f"{self.base_url}{prefix}/info")
            except httpx.HTTPError:
                continue
            if not response.is_success:
                continue
            endpoints = (response.json() or {}).get("named_endpoints") or {}
            endpoint = endpoints.get(self.api_name)
            if isinstance(endpoint, dict) and isinstance(endpoint.get("parameters"), list):
                return prefix, endpoint["parameters"]
            raise ImageProviderNotConfigured(f"FramePack has no {self.api_name} endpoint.")
        raise ImageProviderError("FramePack is not reachable.")

    async def health_check(self) -> bool:
        if not self.base_url:
            return False
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                await self._endpoint(client)
            return True
        except (ImageProviderError, httpx.HTTPError, ValueError):
            return False

    async def generate(self, image: bytes, mime_type: str, prompt: str, *, seconds: float,
                       negative: str = "", on_progress: Progress = _no_progress) -> dict[str, Any]:
        if not self.base_url:
            raise ImageProviderNotConfigured("FramePack is not configured.")
        started = time.perf_counter()
        seed = secrets.randbelow(2**31)
        async with httpx.AsyncClient(timeout=httpx.Timeout(60, read=120)) as client:
            prefix, parameters = await self._endpoint(client)
            root = f"{self.base_url}{prefix}"
            ext = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}.get(mime_type, "png")
            uploaded = await client.post(f"{root}/upload",
                                         files=[("files", (f"lumen-source.{ext}", image, mime_type))])
            uploaded.raise_for_status()
            paths = uploaded.json()
            if not isinstance(paths, list) or not paths or not isinstance(paths[0], str):
                raise ImageProviderError("FramePack did not accept the source image.")
            file_data = {"path": paths[0], "meta": {"_type": "gradio.FileData"}}
            data = framepack_arguments(parameters, image=file_data, prompt=prompt, negative=negative,
                                       seed=seed, seconds=seconds)
            call = await client.post(f"{root}/call{self.api_name}", json={"data": data})
            call.raise_for_status()
            event_id = (call.json() or {}).get("event_id")
            if not isinstance(event_id, str) or not event_id:
                raise ImageProviderError("FramePack did not start the job.")
            await on_progress(5, "Animating…")
            result_path = await self._follow(client, f"{root}/call{self.api_name}/{event_id}", seconds,
                                             on_progress, root)
            await on_progress(97, "Saving the video…")
            video = await client.get(f"{root}/file={result_path}")
            video.raise_for_status()
        return {"bytes": video.content, "mime_type": video_mime(result_path) or "video/mp4",
                "provider": self.name, "model": "framepack",
                "latency_ms": round((time.perf_counter() - started) * 1000)}

    async def _follow(self, client: httpx.AsyncClient, url: str, seconds: float, on_progress: Progress,
                      root: str) -> str:
        deadline = time.monotonic() + self.timeout
        event = ""
        last_path = None
        try:
            async with client.stream("GET", url, timeout=httpx.Timeout(30, read=self.timeout)) as stream:
                async for line in stream.aiter_lines():
                    if time.monotonic() > deadline:
                        raise asyncio.TimeoutError
                    if line.startswith("event:"):
                        event = line[6:].strip()
                        continue
                    if not line.startswith("data:"):
                        continue
                    payload = line[5:].strip()
                    try:
                        values = json.loads(payload) if payload else None
                    except json.JSONDecodeError:
                        values = None
                    if event == "error":
                        raise ImageProviderError("FramePack could not finish the video.")
                    if event == "generating":
                        last_path = framepack_video_path(values) or last_path
                        percent = framepack_progress(values, seconds)
                        if percent is not None:
                            await on_progress(percent, "Animating…")
                    elif event == "complete":
                        path = framepack_video_path(values) or last_path
                        if not path:
                            raise ImageProviderError("FramePack finished without a video.")
                        return path
        except (asyncio.TimeoutError, httpx.ReadTimeout):
            try:
                await client.post(f"{root}/call/end_process", json={"data": []})
            except httpx.HTTPError:
                pass
            raise ImageProviderError("FramePack timed out while making the video.")
        raise ImageProviderError("FramePack stopped before the video was finished.")

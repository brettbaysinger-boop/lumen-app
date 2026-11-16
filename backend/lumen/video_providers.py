"""Clients for the existing video generators on Heavy. No new engine lives here.

* ``FramePackProvider`` calls the FramePack Gradio app (``demo_gradio.py``) through
  Gradio's documented HTTP API: upload, call, stream events, download.
  Inputs are matched by their labels from ``/gradio_api/info`` so a minor UI
  difference between FramePack builds does not silently shift arguments.
* ``FramePackStudioProvider`` is a narrow adapter for FramePack-Studio's queue API
  (``/handle_start_button`` enqueues, ``/monitor_job`` follows one job). Its exact
  input contract is checked against ``/gradio_api/info`` before anything is uploaded.
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
            # No stop call: FramePack's end_process is global and could end someone else's job.
            raise ImageProviderError("FramePack timed out while making the video.")
        raise ImageProviderError("FramePack stopped before the video was finished.")


# --------------------------------------------------------------------------- FramePack-Studio
#
# Contract taken from the owner's read-only /gradio_api/info and /config on Heavy (2026-11-16)
# and from FramePack-Studio's source (modules/interface.py, studio.py, modules/video_queue.py):
# * /handle_start_button only ADDS a job to FP-Studio's queue and returns at once; output 1 is
#   the new job's id (a uuid4). Output 0 (the video) is empty at that point.
# * /monitor_job(job_id) streams (video, preview, top preview, desc, html, ...) until the job is
#   Completed / Error / cancelled. It ALWAYS switches to whichever job is running, so a video is
#   only accepted when its file name starts with "<our job id>_" (FP-Studio's own naming), and a
#   switch to another job fails the request instead of reporting someone else's output.
# * There is no per-job cancel in the API. end_process / end_process_with_update cancel the
#   CURRENT job globally, so Lumen never calls them. A Lumen timeout leaves the job in FP-Studio.

STUDIO_START = "/handle_start_button"
STUDIO_MONITOR = "/monitor_job"
STUDIO_CURRENT = "/check_for_current_job_and_monitor"
STUDIO_MODE = "Original"  # Heavy has the original FramePackI2V_HY weights, not F1.
STUDIO_INPUTS = (
    "Generation Type", "Start Frame (optional)", "Video Input", "End Frame (Optional)",
    "End Frame Influence", "Prompt", "Negative Prompt", "Seed", "Randomize", "Video Length (Seconds)",
    "Latent Window Size", "Steps", "CFG Scale", "Distilled CFG Scale", "CFG Re-Scale",
    "Caching strategy", "TeaCache steps", "TeaCache rel_l1_thresh", "MagCache Threshold",
    "MagCache Max Consecutive Skips", "MagCache Retention Ratio",
    "Number of sections to blend between prompts", "Latent Image", "Clean up video files",
    "Select LoRAs to Load", "Width", "Height", "Combine with source video",
    "Number of Context Frames (Adherence to Video)",
)
_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def _label(item: dict[str, Any]) -> str:
    return str(item.get("label") or "").strip().lower()


def _choices(parameter: dict[str, Any]) -> list[Any] | None:
    kind = parameter.get("type")
    if isinstance(kind, dict) and isinstance(kind.get("enum"), list):
        return kind["enum"]
    return None


def studio_contract(endpoints: dict[str, Any]) -> list[dict[str, Any]]:
    """Check FramePack-Studio's API against the exact contract this adapter was written for.

    Returns the /handle_start_button parameters. Any difference (a new or moved input, a LoRA
    slider, a missing monitor endpoint, no "Original" mode) raises FramePackNeedsAdapter.
    """
    start = endpoints.get(STUDIO_START)
    parameters = start.get("parameters") if isinstance(start, dict) else None
    if not isinstance(parameters, list):
        raise FramePackNeedsAdapter(f"FramePack-Studio has no {STUDIO_START} endpoint.")
    if len(parameters) != len(STUDIO_INPUTS):
        raise FramePackNeedsAdapter(
            f"{STUDIO_START} has {len(parameters)} inputs; this adapter was written for exactly "
            f"{len(STUDIO_INPUTS)} (LoRA sliders or a newer FramePack-Studio change the order).")
    for position, (parameter, expected) in enumerate(zip(parameters, STUDIO_INPUTS)):
        if _label(parameter) != expected.lower():
            raise FramePackNeedsAdapter(
                f"{STUDIO_START} input {position} is '{parameter.get('label')}', expected '{expected}'.")
    mode = parameters[0]
    choices = _choices(mode)
    if not (STUDIO_MODE in (choices or []) or (choices is None and mode.get("parameter_default") == STUDIO_MODE)):
        raise FramePackNeedsAdapter(f"FramePack-Studio does not offer the '{STUDIO_MODE}' generation type.")
    returns = start.get("returns") or []
    if len(returns) < 2 or _label(returns[0]) != "finished frames video" or _label(returns[1]) != "current job id":
        raise FramePackNeedsAdapter(f"{STUDIO_START} does not return (video, job id) first.")
    monitor = endpoints.get(STUDIO_MONITOR)
    monitor_in = monitor.get("parameters") if isinstance(monitor, dict) else None
    monitor_out = (monitor or {}).get("returns") or [] if isinstance(monitor, dict) else []
    if not isinstance(monitor_in, list) or len(monitor_in) != 1 or _label(monitor_in[0]) != "current job id":
        raise FramePackNeedsAdapter(f"{STUDIO_MONITOR} does not take exactly the job id.")
    if len(monitor_out) < 5 or _label(monitor_out[0]) != "finished frames video":
        raise FramePackNeedsAdapter(f"{STUDIO_MONITOR} does not return the video first.")
    current = endpoints.get(STUDIO_CURRENT)
    current_out = current.get("returns") or [] if isinstance(current, dict) else []
    if not isinstance(current, dict) or (current.get("parameters") or []) or not current_out \
            or _label(current_out[0]) != "current job id":
        raise FramePackNeedsAdapter(f"{STUDIO_CURRENT} is missing or changed; Lumen cannot see if FP-Studio is busy.")
    return parameters


def studio_arguments(parameters: list[dict[str, Any]], *, image: dict[str, Any], prompt: str,
                     negative: str, seed: int, seconds: float) -> list[Any]:
    """The 29 /handle_start_button values: Original image-to-video, one start frame, no video input,
    no end frame, no LoRAs, a fixed seed. Every other input keeps FP-Studio's own default."""
    ours: dict[int, Any] = {0: STUDIO_MODE, 1: image, 2: None, 3: None, 5: prompt, 6: negative,
                            7: seed, 8: False, 9: seconds, 24: []}
    data: list[Any] = []
    for position, parameter in enumerate(parameters):
        if position in ours:
            data.append(ours[position])
        elif parameter.get("parameter_has_default"):
            data.append(parameter.get("parameter_default"))
        else:
            raise FramePackNeedsAdapter(f"{STUDIO_START} input '{parameter.get('label')}' has no default.")
    return data


def _value(item: Any) -> Any:
    """A Gradio output value, unwrapping {"__type__": "update", "value": ...}."""
    if isinstance(item, dict) and item.get("__type__") == "update":
        return item.get("value")
    return item


def studio_job_id(values: Any) -> str | None:
    if not isinstance(values, list) or len(values) < 2:
        return None
    job_id = _value(values[1])
    job_id = job_id.strip() if isinstance(job_id, str) else ""
    return job_id if _UUID.match(job_id) else None


def studio_video_for(values: Any, job_id: str) -> str | None:
    """The video path from a monitor update, only if FP-Studio named it after this job."""
    if not isinstance(values, list) or not values:
        return None
    path = framepack_video_path([_value(values[0])])
    if not path:
        return None
    name = path.replace("\\", "/").rsplit("/", 1)[-1]
    return path if name.startswith(f"{job_id}_") and name.endswith(".mp4") else None


def studio_desc(values: Any) -> str:
    if not isinstance(values, list) or len(values) < 4:
        return ""
    desc = _value(values[3])
    return desc.strip() if isinstance(desc, str) else ""


class FramePackStudioProvider(FramePackProvider):
    """FramePack-Studio on Heavy: enqueue one Original image-to-video job, follow only that job."""

    name = "framepack-studio"

    async def _info(self, client: httpx.AsyncClient) -> tuple[str, dict[str, Any]]:
        for prefix in ("/gradio_api", ""):
            try:
                response = await client.get(f"{self.base_url}{prefix}/info")
            except httpx.HTTPError:
                continue
            if response.is_success:
                return prefix, (response.json() or {}).get("named_endpoints") or {}
        raise ImageProviderError("FramePack-Studio is not reachable.")

    async def _endpoint(self, client: httpx.AsyncClient) -> tuple[str, list[dict[str, Any]]]:
        prefix, endpoints = await self._info(client)
        return prefix, studio_contract(endpoints)

    async def _events(self, client: httpx.AsyncClient, root: str, api: str, data: list[Any],
                      deadline: float):
        call = await client.post(f"{root}/call{api}", json={"data": data})
        call.raise_for_status()
        event_id = (call.json() or {}).get("event_id")
        if not isinstance(event_id, str) or not event_id:
            raise ImageProviderError("FramePack-Studio did not accept the request.")
        event = ""
        remaining = max(1.0, deadline - time.monotonic())
        async with client.stream("GET", f"{root}/call{api}/{event_id}",
                                 timeout=httpx.Timeout(30, read=remaining)) as stream:
            async for line in stream.aiter_lines():
                if time.monotonic() > deadline:
                    raise asyncio.TimeoutError
                if line.startswith("event:"):
                    event = line[6:].strip()
                elif line.startswith("data:"):
                    payload = line[5:].strip()
                    try:
                        values = json.loads(payload) if payload else None
                    except json.JSONDecodeError:
                        values = None
                    if event == "error":
                        raise ImageProviderError("FramePack-Studio reported an error.")
                    yield event, values
                    if event == "complete":
                        return

    async def _last(self, client, root, api, data, deadline) -> Any:
        last = None
        async for event, values in self._events(client, root, api, data, deadline):
            if event in ("generating", "complete"):
                last = values
        return last

    async def generate(self, image: bytes, mime_type: str, prompt: str, *, seconds: float,
                       negative: str = "", on_progress: Progress = _no_progress) -> dict[str, Any]:
        if not self.base_url:
            raise ImageProviderNotConfigured("FramePack-Studio is not configured.")
        started = time.perf_counter()
        deadline = time.monotonic() + self.timeout
        seed = secrets.randbelow(21474)
        job_id = None
        async with httpx.AsyncClient(timeout=httpx.Timeout(60, read=120)) as client:
            prefix, parameters = await self._endpoint(client)
            root = f"{self.base_url}{prefix}"
            try:
                current = await self._last(client, root, STUDIO_CURRENT, [], deadline)
                if isinstance(current, list) and current and _value(current[0]):
                    raise ImageProviderError("FramePack-Studio is busy with another job. Try again when it is free.")
                ext = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}.get(mime_type, "png")
                uploaded = await client.post(f"{root}/upload",
                                             files=[("files", (f"lumen-source.{ext}", image, mime_type))])
                uploaded.raise_for_status()
                paths = uploaded.json()
                if not isinstance(paths, list) or not paths or not isinstance(paths[0], str):
                    raise ImageProviderError("FramePack-Studio did not accept the source image.")
                file_data = {"path": paths[0], "meta": {"_type": "gradio.FileData"}}
                data = studio_arguments(parameters, image=file_data, prompt=prompt, negative=negative,
                                        seed=seed, seconds=seconds)
                job_id = studio_job_id(await self._last(client, root, STUDIO_START, data, deadline))
                if not job_id:
                    raise ImageProviderError("FramePack-Studio did not return a job id.")
                await on_progress(5, "Animating…")
                result_path = await self._follow_job(client, root, job_id, seconds, on_progress, deadline)
            except (asyncio.TimeoutError, httpx.ReadTimeout):
                # Never a stop call: FP-Studio has no per-job cancel, and end_process is global.
                left = f" Its job {job_id} was left in FramePack-Studio's queue." if job_id else ""
                raise ImageProviderError(f"FramePack-Studio did not finish in time.{left}")
            await on_progress(97, "Saving the video…")
            video = await client.get(f"{root}/file={result_path}")
            video.raise_for_status()
        return {"bytes": video.content, "mime_type": "video/mp4", "provider": self.name,
                "model": f"framepack-studio:{STUDIO_MODE}", "job_id": job_id,
                "latency_ms": round((time.perf_counter() - started) * 1000)}

    async def _follow_job(self, client, root: str, job_id: str, seconds: float, on_progress: Progress,
                          deadline: float) -> str:
        video = None
        async for event, values in self._events(client, root, STUDIO_MONITOR, [job_id], deadline):
            if event not in ("generating", "complete"):
                continue
            video = studio_video_for(values, job_id) or video
            desc = studio_desc(values)
            if desc.startswith("Switching to current job"):
                raise ImageProviderError("FramePack-Studio switched to another job before this one finished.")
            if desc.startswith("Error"):
                raise ImageProviderError("FramePack-Studio could not finish the video.")
            if desc in ("Job cancelled", "No job ID provided"):
                raise ImageProviderError("FramePack-Studio stopped this job.")
            if desc == "Completed":
                if not video:
                    raise ImageProviderError("FramePack-Studio finished without this job's video.")
                return video
            percent = framepack_progress(values if isinstance(values, list) else [], seconds)
            if percent is not None:
                await on_progress(percent, "Animating…")
        raise ImageProviderError("FramePack-Studio stopped reporting before the video was finished.")


def framepack_provider(settings) -> FramePackProvider:
    """FRAMEPACK_API_NAME=/handle_start_button selects the FramePack-Studio adapter explicitly."""
    api = settings.framepack_api_name.strip()
    if api in (STUDIO_START, STUDIO_START.lstrip("/")):
        return FramePackStudioProvider(settings)
    return FramePackProvider(settings)

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
            self.stage = "download"
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
#   Completed / Error / cancelled. Its video value is job_queue.get_job(<our id>).result, which
#   FP-Studio's queue sets only from that job's own output stream: that is the per-job mapping.
#   The worker names files after its OWN run stamp, not the queue uuid:
#   "<yymmdd_HHMMSS_mmm_rand>_<frames>.mp4" (worker.py generate_timestamp(); seen on Heavy as
#   261116_095453_817_1084_19.mp4). monitor_job ALWAYS switches to whichever job is running, so a
#   switch fails the request, every video must come from one run stamp, and any other name is
#   ignored. Nothing is ever taken from a directory listing.
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


def _is(item: Any, label: str, component: str) -> bool:
    """Gradio /info keeps label and component apart, e.g. {"label": "Finished Frames", "component": "Video"}."""
    return (isinstance(item, dict) and _label(item) == label.lower()
            and str(item.get("component") or "").strip().lower() == component.lower())


def _choices(parameter: dict[str, Any]) -> list[Any] | None:
    kind = parameter.get("type")
    if isinstance(kind, dict) and isinstance(kind.get("enum"), list):
        return kind["enum"]
    return None


def _shape(items: Any) -> str:
    if not isinstance(items, list):
        return "nothing"
    return ", ".join(f"{i.get('label')!r}/{i.get('component')!r}" if isinstance(i, dict) else repr(i) for i in items)


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
    if len(returns) < 2 or not _is(returns[0], "Finished Frames", "Video") \
            or not _is(returns[1], "Current Job ID", "Textbox"):
        raise FramePackNeedsAdapter(
            f"{STUDIO_START} does not return (Finished Frames Video, Current Job ID Textbox) first; "
            f"got {_shape(returns[:2])}.")
    monitor = endpoints.get(STUDIO_MONITOR)
    monitor_in = monitor.get("parameters") if isinstance(monitor, dict) else None
    monitor_out = (monitor or {}).get("returns") or [] if isinstance(monitor, dict) else []
    if not isinstance(monitor_in, list) or len(monitor_in) != 1 or not _is(monitor_in[0], "Current Job ID", "Textbox"):
        raise FramePackNeedsAdapter(f"{STUDIO_MONITOR} does not take exactly the job id; got {_shape(monitor_in)}.")
    if len(monitor_out) < 5 or not _is(monitor_out[0], "Finished Frames", "Video"):
        raise FramePackNeedsAdapter(f"{STUDIO_MONITOR} does not return the video first; got {_shape(monitor_out[:1])}.")
    current = endpoints.get(STUDIO_CURRENT)
    current_out = current.get("returns") or [] if isinstance(current, dict) else []
    if not isinstance(current, dict) or (current.get("parameters") or []) or not current_out \
            or not _is(current_out[0], "Current Job ID", "Textbox"):
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


_STUDIO_OUTPUT = re.compile(r"^(\d{6}_\d{6}_\d{3}_\d{1,4})_\d+\.mp4$")


def studio_output(values: Any) -> tuple[str, str] | None:
    """(path, worker run stamp) from a monitor update, only for FP-Studio's own output naming."""
    if not isinstance(values, list) or not values:
        return None
    path = framepack_video_path([_value(values[0])])
    if not path:
        return None
    match = _STUDIO_OUTPUT.match(path.replace("\\", "/").rsplit("/", 1)[-1])
    return (path, match.group(1)) if match else None


def studio_desc(values: Any) -> str:
    if not isinstance(values, list) or len(values) < 4:
        return ""
    desc = _value(values[3])
    return desc.strip() if isinstance(desc, str) else ""


def studio_hidden_state_slots(config: Any, api_name: str = STUDIO_START.lstrip("/"),
                               visible: int = len(STUDIO_INPUTS)) -> list[int]:
    """Positions of the event's hidden gr.State inputs, from Gradio's /config.

    /info lists only the 29 visible inputs, but the server validates the full input list: FramePack-Studio's
    ``ips`` ends with ``lora_names_states = gr.State(...)``, so /handle_start_button expects 30 values and
    answers 29 with ``event: error`` / ``data: null`` ("didn't receive enough input values"). Like
    gradio_client, Lumen sends None in each State slot; Gradio then uses the session's own state value.
    Reproduced on Gradio 5.25.2 (FramePack-Studio's pinned version) with FP-Studio's exact wiring.
    """
    if not isinstance(config, dict):
        raise FramePackNeedsAdapter("FramePack-Studio's /config is not readable; its hidden inputs cannot be counted.")
    types = {c.get("id"): str(c.get("type") or "").lower() for c in config.get("components") or []
             if isinstance(c, dict)}
    matches = [d for d in config.get("dependencies") or [] if isinstance(d, dict) and d.get("api_name") == api_name]
    if len(matches) != 1:
        raise FramePackNeedsAdapter(f"/config has {len(matches)} '{api_name}' events; expected exactly one.")
    kinds = [types.get(i, "") for i in matches[0].get("inputs") or []]
    states = [i for i, kind in enumerate(kinds) if kind == "state"]
    if len(kinds) - len(states) != visible:
        raise FramePackNeedsAdapter(
            f"/config '{api_name}' has {len(kinds)} inputs ({len(states)} hidden state); expected {visible} visible.")
    return states


def studio_max_seconds(config: Any, label: str = "Video Length (Seconds)") -> float | None:
    """The longest clip this FramePack-Studio's own length slider allows, from /config (read-only).
    None when it cannot be read; Lumen then leaves the limit to its own VIDEO_MAX_SECONDS."""
    if not isinstance(config, dict):
        return None
    for component in config.get("components") or []:
        props = component.get("props") if isinstance(component, dict) else None
        if isinstance(props, dict) and props.get("label") == label:
            top = props.get("maximum")
            if isinstance(top, (int, float)) and not isinstance(top, bool) and top > 0:
                return float(top)
    return None


def with_state_slots(data: list[Any], states: list[int]) -> list[Any]:
    full = list(data)
    for position in states:
        full.insert(position, None)
    return full


_PATHS = re.compile(r"(?:[A-Za-z]:)?(?:[\\/][\w.@~+-]+){2,}")


def sse_error_detail(api: str, payload: str) -> str:
    """A short, safe description of a Gradio ``event: error``: the API path and the server's message,
    capped at 300 characters with file paths redacted. Gradio sends ``null`` unless show_error is on."""
    text = (payload or "").strip()
    try:
        value = json.loads(text) if text else None
    except json.JSONDecodeError:
        value = text
    if value is None:
        message = "no details (data: null; FramePack-Studio's console log has the exception)"
    else:
        message = value if isinstance(value, str) else json.dumps(value)[:600]
        message = _PATHS.sub("<path>", message)
        message = re.sub(r"\s+", " ", message).strip()[:300]
    return f"{api} returned event:error: {message}"


class FramePackStudioProvider(FramePackProvider):
    """FramePack-Studio on Heavy: enqueue one Original image-to-video job, follow only that job."""

    name = "framepack-studio"
    stage = "contract"  # contract, current_job, upload, start_queue, monitor, download
    job_id: str | None = None
    states: list[int] = []

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
        parameters = studio_contract(endpoints)
        try:
            config = (await client.get(f"{self.base_url}/config")).json()
        except (httpx.HTTPError, ValueError):
            config = None
        self.states = studio_hidden_state_slots(config)
        self.max_seconds = studio_max_seconds(config)
        return prefix, parameters

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
                        raise ImageProviderError(sse_error_detail(api, payload))
                    yield event, values
                    if event == "complete":
                        return

    async def _last(self, client, root, api, data, deadline) -> Any:
        last = None
        async for event, values in self._events(client, root, api, data, deadline):
            if event in ("generating", "complete"):
                last = values
        return last

    async def submit(self, image: bytes, mime_type: str, prompt: str, *, seconds: float, negative: str = "",
                     refuse_if_busy: bool = False) -> str:
        """Add ONE job to FP-Studio's own queue and return its job id at once (no waiting for the GPU).

        Lumen's durable worker submits without the busy check, so its job waits in FP-Studio's
        queue behind anyone else's; the canary keeps ``refuse_if_busy`` to stay isolated."""
        if not self.base_url:
            raise ImageProviderNotConfigured("FramePack-Studio is not configured.")
        deadline = time.monotonic() + 300
        seed = secrets.randbelow(21474)
        self.job_id = None
        async with httpx.AsyncClient(timeout=httpx.Timeout(60, read=120)) as client:
            self.stage = "contract"
            prefix, parameters = await self._endpoint(client)
            root = f"{self.base_url}{prefix}"
            if self.max_seconds is not None and seconds > self.max_seconds + 0.05:
                # Never let FP-Studio shorten a clip silently: refuse before anything is uploaded.
                raise ImageProviderError(f"FramePack-Studio on Heavy makes clips of up to {self.max_seconds:g} "
                                         f"seconds, so this {seconds:g}-second video was not started.")
            if refuse_if_busy:
                self.stage = "current_job"
                current = await self._last(client, root, STUDIO_CURRENT, [], deadline)
                if isinstance(current, list) and current and _value(current[0]):
                    raise ImageProviderError("FramePack-Studio is busy with another job. Try again when it is free.")
            self.stage = "upload"
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
            self.stage = "start_queue"
            data = with_state_slots(data, self.states)
            job_id = studio_job_id(await self._last(client, root, STUDIO_START, data, deadline))
            self.job_id = job_id
            if not job_id:
                raise ImageProviderError("FramePack-Studio did not return a job id.")
            return job_id

    async def check(self, job_id: str, *, seconds: float, window: float = 6.0) -> dict[str, Any]:
        """One bounded look at OUR job through monitor_job(job_id); the stream is closed after
        ``window`` seconds (Gradio stops the generator when the client disconnects).

        state: queued | running | completed | failed | waiting. "waiting" = FP-Studio is busy with
        another job (monitor_job switched): ours is still queued or finished, so look again later.
        Videos are taken only before any switch and only with FP-Studio's output naming."""
        state: dict[str, Any] = {"state": "waiting", "percent": None, "desc": "", "video": None, "run": None}
        if not _UUID.match(job_id or ""):
            raise ImageProviderError("Not a FramePack-Studio job id.")
        async with httpx.AsyncClient(timeout=httpx.Timeout(30, read=window + 30)) as client:
            prefix, _ = await self._endpoint(client)
            root = f"{self.base_url}{prefix}"

            async def look() -> None:
                deadline = time.monotonic() + window + 30
                async for event, values in self._events(client, root, STUDIO_MONITOR, [job_id], deadline):
                    if event not in ("generating", "complete"):
                        continue
                    desc = studio_desc(values)
                    if desc.startswith("Switching to current job"):
                        state.update(state="waiting", desc="FramePack-Studio is busy with another job")
                        return
                    output = studio_output(values)
                    if output:
                        if state["run"] and output[1] != state["run"]:
                            state.update(state="failed", desc="videos from two different runs")
                            return
                        state["video"], state["run"] = output
                    if desc.startswith("Error") or desc in ("Job cancelled", "No job ID provided"):
                        state.update(state="failed", desc=_short(desc))
                        return
                    if desc == "Completed":
                        state.update(state="completed" if state["video"] else "failed",
                                     desc="Completed" if state["video"] else "Completed without a result file")
                        return
                    html = _value(values[4]) if isinstance(values, list) and len(values) > 4 else ""
                    if any(isinstance(t, str) and t.startswith("Waiting in queue") for t in (desc, html)):
                        # FP-Studio puts "Waiting in queue. Position: N" in the progress slot (index 4).
                        state.update(state="queued", desc=_short(desc or html))
                        continue
                    percent = framepack_progress(values if isinstance(values, list) else [], seconds)
                    if percent is not None or desc:
                        state["state"] = "running"
                    if percent is not None:
                        state["percent"] = percent
                    if desc:
                        state["desc"] = _short(desc)

            try:
                await asyncio.wait_for(look(), window)
            except asyncio.TimeoutError:
                pass  # a look, not a wait: the last state seen stands
        return state

    async def download(self, path: str) -> bytes:
        """The finished file, through Gradio's own file route (the path came from monitor_job)."""
        if not _STUDIO_OUTPUT.match(path.replace("\\", "/").rsplit("/", 1)[-1]):
            raise ImageProviderError("Not a FramePack-Studio output.")
        async with httpx.AsyncClient(timeout=httpx.Timeout(60, read=300)) as client:
            prefix, _ = await self._info(client)
            response = await client.get(f"{self.base_url}{prefix}/file={path}")
            response.raise_for_status()
            if response.content[4:8] != b"ftyp":
                raise ImageProviderError("FramePack-Studio's file is not an MP4.")
            return response.content

    async def generate(self, image: bytes, mime_type: str, prompt: str, *, seconds: float,
                       negative: str = "", on_progress: Progress = _no_progress) -> dict[str, Any]:
        """Submit and follow one job in a single call (the isolated canary). Lumen's chat videos use
        submit() + check() from the durable worker instead."""
        started = time.perf_counter()
        deadline = time.monotonic() + self.timeout
        job_id = await self.submit(image, mime_type, prompt, seconds=seconds, negative=negative,
                                   refuse_if_busy=True)
        async with httpx.AsyncClient(timeout=httpx.Timeout(60, read=120)) as client:
            prefix = (await self._info(client))[0]
            root = f"{self.base_url}{prefix}"
            try:
                await on_progress(5, "Animating…")
                self.stage = "monitor"
                result_path = await self._follow_job(client, root, job_id, seconds, on_progress, deadline)
            except (asyncio.TimeoutError, httpx.ReadTimeout):
                # Never a stop call: FP-Studio has no per-job cancel, and end_process is global.
                raise ImageProviderError(f"FramePack-Studio did not finish in time. Its job {job_id} was left "
                                         "in FramePack-Studio's queue.")
            await on_progress(97, "Saving the video…")
            self.stage = "download"
            video = await client.get(f"{root}/file={result_path}")
            video.raise_for_status()
        return {"bytes": video.content, "mime_type": "video/mp4", "provider": self.name,
                "model": f"framepack-studio:{STUDIO_MODE}", "job_id": job_id,
                "latency_ms": round((time.perf_counter() - started) * 1000)}

    async def _follow_job(self, client, root: str, job_id: str, seconds: float, on_progress: Progress,
                          deadline: float) -> str:
        video, run = None, None
        last_desc, last_progress = "", None
        async for event, values in self._events(client, root, STUDIO_MONITOR, [job_id], deadline):
            if event not in ("generating", "complete"):
                continue
            desc = studio_desc(values)
            output = studio_output(values)
            if output and not desc.startswith("Switching to current job"):
                if run and output[1] != run:  # one job = one worker run; never mix in another's file
                    raise ImageProviderError(f"FramePack-Studio reported videos from two different runs "
                                             f"for job {job_id}; nothing was returned.")
                video, run = output
            if desc.startswith("Switching to current job"):
                raise ImageProviderError(f"FramePack-Studio switched to another job before job {job_id} finished.")
            if desc.startswith("Error"):
                raise ImageProviderError(f"FramePack-Studio could not finish job {job_id}: {_short(desc)}")
            if desc in ("Job cancelled", "No job ID provided"):
                raise ImageProviderError(f"FramePack-Studio stopped job {job_id} ({desc}).")
            if desc == "Completed":
                if not video:
                    # job.result was empty (or not FP-Studio's output naming). An exception in its worker
                    # also ends this way: the queue ignores ('error', ...) and marks the job Completed.
                    raise ImageProviderError(
                        f"FramePack-Studio marked job {job_id} Completed without a result file "
                        f"(last progress: {_short(last_desc) or 'none'}). Its queue.json entry for this id "
                        "shows the result; its console shows any 'Error during generation'.")
                return video
            if desc:
                last_desc = desc
            percent = framepack_progress(values if isinstance(values, list) else [], seconds)
            if percent is not None and (last_progress is None or percent > last_progress):
                # Only forward movement: never every 50 ms poll, never a bar flipping back and forth.
                last_progress = percent
                await on_progress(percent, "Animating…")
        raise ImageProviderError(f"FramePack-Studio stopped reporting before job {job_id} finished.")


def _short(text: str) -> str:
    return _PATHS.sub("<path>", re.sub(r"<[^>]+>|\s+", " ", text or "")).strip()[:160]


def framepack_provider(settings) -> FramePackProvider:
    """FRAMEPACK_API_NAME=/handle_start_button selects the FramePack-Studio adapter explicitly."""
    api = settings.framepack_api_name.strip()
    if api in (STUDIO_START, STUDIO_START.lstrip("/")):
        return FramePackStudioProvider(settings)
    return FramePackProvider(settings)

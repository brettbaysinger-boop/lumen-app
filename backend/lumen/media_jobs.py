"""Short video generation from conversation, as background jobs (Private mode only).

Flow: a chat turn asks for a video (an explicit request, or the companion's own
``generate_video`` action). ``plan_video_job`` checks mode, configuration,
safety and limits and returns a reply right away. After the assistant message is
saved, ``enqueue_video_job`` records the job and runs it in this process, one at
a time (Heavy has one 16 GB GPU). Progress is written to
``media_generation_jobs``; the app polls ``GET /v0.3/media/jobs/{id}``. The
finished clip is saved to private ``chat-media`` storage, attached to that
assistant message and registered in Gallery.

Routes, by what is configured on the host:
* image-to-video (an attached or earlier image): FramePack, or a ComfyUI
  image-to-video workflow when ``COMFYUI_I2V_WORKFLOW`` is set;
* text-to-video: a ComfyUI Wan2.2 workflow when ``COMFYUI_T2V_WORKFLOW`` is set,
  otherwise a still from the existing image workflow, animated by FramePack.

Job rows are written with the service role because a clip can outlive the
user's access token. Every row is scoped to the verified user id, and the table
has no client policies: only this backend reads or writes it.
"""
from __future__ import annotations

import asyncio
import logging
import re
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException

from .auth import AuthUser, require_user
from .config import get_settings
from .db import SupabaseRepository
from .images import ImageProviderError, ImageProviderNotConfigured, compose_image_prompt, create_image_provider
from .media_safety import ADULT_NEGATIVE, adult_prompt, check_media_prompt, refusal_text
from .video_providers import framepack_provider, free_comfy_memory, run_comfy_video_workflow, video_mime

log = logging.getLogger(__name__)

JOB_TABLE = "media_generation_jobs"
ACTIVE = ("queued", "running")
BUCKET = "chat-media"

_VIDEO_NOUN = r"(?:video|vid|clip|animation|movie|gif|cinemagraph)"
_VIDEO_REQUEST = re.compile(
    rf"\b(?:make|create|generate|render|produce|film|shoot|send|give)\b[^.?!]{{0,90}}\b{_VIDEO_NOUN}s?\b"
    rf"|\banimate\b|\bbring\b[^.?!]{{0,40}}\bto life\b",
    re.IGNORECASE,
)
_NOT_GENERATION = re.compile(
    r"\b(?:youtube|link|url|watch|recommend|tutorial|find|search|look up|edit my|trim|upload)\b",
    re.IGNORECASE,
)
_PREVIOUS_IMAGE = re.compile(
    r"\banimate\b|\b(?:this|that|the|last|previous|same)\s+(?:image|picture|pic|photo|portrait|one)\b"
    r"|\bbring\b[^.?!]{0,40}\bto life\b",
    re.IGNORECASE,
)
_SECONDS = re.compile(r"(\d{1,4}(?:\.\d)?)\s*-?\s*(s|sec|secs|seconds?|m|mins?|minutes?)\b", re.IGNORECASE)
_NOUN_TO_IMAGE = re.compile(
    rf"\b(?:a|an)?\s*(?:short\s+|quick\s+|little\s+)?(?:\d{{1,4}}(?:\.\d)?\s*-?\s*(?:s|sec|secs|seconds?)\s+)?{_VIDEO_NOUN}\b",
    re.IGNORECASE,
)

GPU_LOCK = asyncio.Lock()
_TASKS: set[asyncio.Task] = set()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def video_request(text: str) -> bool:
    text = text or ""
    return bool(_VIDEO_REQUEST.search(text)) and not _NOT_GENERATION.search(text)


_IMAGE_REQUEST = re.compile(
    r"\b(?:generate|create|make|draw|paint|sketch|design|render|illustrate|take)\b[^.?!]{0,100}"
    r"\b(?:image|picture|pic|photo|selfie|drawing|painting|illustration|artwork|portrait|wallpaper)s?\b"
    r"|\b(?:show|send|share|give)\b[^.?!]{0,60}\b(?:image|picture|pic|photo|selfie|drawing|portrait)s?\b"
    r"|\bselfie\b|\b(?:let me|can i|i want to|wanna)\s+see\s+(?:you|yourself|what you look like)\b",
    re.IGNORECASE,
)
_NOT_IMAGE = re.compile(r"\b(?:with|using)\s+words\b|\bverbal\s+picture\b|\bpicture\s+this\b", re.IGNORECASE)
_SELF = re.compile(r"\b(?:you|yourself|your|selfie)\b", re.IGNORECASE)


def image_request(text: str) -> bool:
    """A clear request for a picture, for when a small local model forgets its image action."""
    text = text or ""
    return (bool(_IMAGE_REQUEST.search(text)) and not _NOT_IMAGE.search(text)
            and not _NOT_GENERATION.search(text) and not video_request(text))


def image_subject(text: str) -> str:
    return "self" if _SELF.search(text or "") else "other"


def requested_seconds(text: str) -> float | None:
    match = _SECONDS.search(text or "")
    if not match:
        if re.search(r"\b(?:five|ten|several|a few)[-\s]minutes?\b|\bminute[-\s]long\b", text or "", re.I):
            return 300.0
        return None
    value = float(match.group(1))
    return value * 60 if match.group(2).lower().startswith("m") else value


def still_prompt(text: str) -> str:
    """Turn "make a short video of a fox in snow" into a prompt for the first frame."""
    text = _NOUN_TO_IMAGE.sub(" an image", text)
    text = re.sub(r"\banimate\b", "show", text, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", text).strip()


@dataclass
class VideoJobPlan:
    owner_user_id: str
    companion_id: str
    conversation_id: str
    mode: Literal["t2v", "i2v", "t2i2v"]
    prompt: str
    seconds: float
    explicit: bool
    still_prompt: str | None = None
    source_path: str | None = None
    source_mime: str | None = None
    id: str = field(default_factory=lambda: str(uuid.uuid4()))

    def message_metadata(self) -> dict[str, Any]:
        return {"id": self.id, "status": "queued", "mode": self.mode, "seconds": self.seconds}


@dataclass
class PlanResult:
    reply: str
    plan: VideoJobPlan | None = None


def _service_db(settings) -> SupabaseRepository:
    return SupabaseRepository(settings)


def video_routes(settings) -> dict[str, bool]:
    enabled = bool(getattr(settings, "video_generation_enabled", False))
    i2v = enabled and bool(settings.framepack_url.strip() or settings.comfyui_i2v_workflow.strip())
    has_comfy = bool(settings.comfyui_url.strip())
    t2v_direct = enabled and has_comfy and bool(settings.comfyui_t2v_workflow.strip())
    t2i2v = enabled and i2v and has_comfy and bool(settings.comfyui_workflow.strip())
    return {"enabled": enabled, "image_to_video": i2v, "text_to_video": t2v_direct or t2i2v,
            "text_to_video_direct": t2v_direct}


def latest_image(recent: list[dict], user_id: str) -> tuple[str, str, str] | None:
    """Newest image in the conversation: (path, mime, origin). ``recent`` is newest first."""
    for message in recent or []:
        metadata = message.get("metadata") or {}
        for attachment in reversed(metadata.get("attachments") or []):
            path, mime = attachment.get("path"), attachment.get("mime_type", "")
            if isinstance(path, str) and path.startswith(f"{user_id}/") and str(mime).startswith("image/"):
                generated = message.get("role") == "assistant" and (
                    metadata.get("generated_image") or metadata.get("generated_video"))
                return path, mime, "generated" if generated else "user_upload"
    return None


async def pending_jobs(settings, user_id: str) -> int:
    # A row whose reply was never saved (the turn failed) stops counting after 15 minutes.
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
    rows = await _service_db(settings)._request("GET", JOB_TABLE, params={
        "owner_user_id": f"eq.{user_id}", "status": "in.(queued,running)", "select": "id",
        "or": f"(status.eq.running,created_at.gt.{cutoff})"})
    return len(rows or [])


async def plan_video_job(settings, *, privacy_mode: str, user_id: str, companion: dict, conversation_id: str,
                         user_message: str, prompt: str | None = None, subject: str | None = None,
                         attachments: list | None = None, recent: list[dict] | None = None) -> PlanResult:
    """Decide whether a video can start. Never runs GPU work."""
    if privacy_mode != "private":
        return PlanResult("I'll make videos once we're back in 🔒 Private.")
    routes = video_routes(settings)
    if not routes["enabled"]:
        return PlanResult("Video creation isn't switched on for this Lumen server yet, so I haven't started one.")
    requested = requested_seconds(user_message if prompt is None else f"{user_message} {prompt}")
    limit = settings.video_max_seconds
    if requested is not None and requested > limit:
        return PlanResult(
            f"Right now I can make short clips of up to {limit:g} seconds. Longer videos, like five minutes, "
            "are a separate feature that isn't ready yet. Want a short clip instead?")
    seconds = requested or settings.video_default_seconds
    seconds = max(1.0, min(limit, seconds))
    text = (prompt or user_message).strip()[:1000]

    source = None
    images = [a for a in (attachments or []) if str(getattr(a, "mime_type", "")).startswith("image/")]
    if images:
        source = (images[0].path, images[0].mime_type, "user_upload")
    elif prompt is None and _PREVIOUS_IMAGE.search(user_message):
        source = latest_image(recent or [], user_id)

    verdict = check_media_prompt(text, source=source[2] if source else None)
    if not verdict.allowed:
        return PlanResult(refusal_text(verdict))

    if source:
        if not routes["image_to_video"]:
            return PlanResult("Animating images isn't set up on this Lumen server yet, so I haven't started.")
        if not source[0].startswith(f"{user_id}/"):
            return PlanResult("I couldn't find that image.")
        mode, still = "i2v", None
    elif routes["text_to_video_direct"]:
        mode, still = "t2v", None
    elif routes["text_to_video"]:
        name = companion.get("name", "")
        base = f"An image of {name}, {text}" if subject == "self" and name else still_prompt(text)
        still, _ = compose_image_prompt(base, name, companion.get("visual_identity"))
        mode = "t2i2v"
    else:
        return PlanResult("Text-to-video isn't set up on this Lumen server yet. Send me an image and ask me "
                          "to animate it, or ask again once video is configured.")

    await recover_interrupted_jobs(settings)
    if await pending_jobs(settings, user_id) >= settings.video_max_pending_per_user:
        return PlanResult("I'm still working on your other videos. Let's wait for those to finish first.")

    plan = VideoJobPlan(owner_user_id=user_id, companion_id=companion["id"], conversation_id=conversation_id,
                        mode=mode, prompt=adult_prompt(text, verdict), seconds=seconds, explicit=verdict.explicit,
                        still_prompt=adult_prompt(still, verdict) if still else None,
                        source_path=source[0] if source else None, source_mime=source[1] if source else None)
    return PlanResult(f"I'm making a {seconds:g}-second video now. It will show up right here when it's "
                      "ready, usually within a few minutes.", plan)


async def record_video_job(settings, plan: VideoJobPlan) -> None:
    """Write the job before the reply is saved, so a reply never promises a job that has no row."""
    await _service_db(settings)._request("POST", JOB_TABLE, headers={"Prefer": "return=minimal"}, json={
        "id": plan.id, "owner_user_id": plan.owner_user_id, "companion_id": plan.companion_id,
        "conversation_id": plan.conversation_id, "kind": "video", "mode": plan.mode,
        "status": "queued", "progress": 0, "stage": "Waiting to start…", "prompt": plan.prompt,
        "still_prompt": plan.still_prompt, "source_path": plan.source_path, "source_mime": plan.source_mime,
        "duration_seconds": plan.seconds, "explicit": plan.explicit})


def start_video_job(settings, plan: VideoJobPlan, message_id: str) -> asyncio.Task:
    task = asyncio.create_task(run_video_job(settings, plan, message_id))
    _TASKS.add(task)
    task.add_done_callback(_TASKS.discard)
    return task


class JobReporter:
    """Writes progress at most every few seconds; never fails the job."""

    def __init__(self, settings, job_id: str):
        self.db = _service_db(settings)
        self.job_id = job_id
        self.last = (0.0, -1, "")

    async def update(self, **fields) -> None:
        fields["updated_at"] = _now()
        try:
            await self.db._request("PATCH", JOB_TABLE, params={"id": f"eq.{self.job_id}"},
                                   headers={"Prefer": "return=minimal"}, json=fields)
        except Exception:
            log.warning("Could not update media job %s", self.job_id)

    async def progress(self, percent: int, stage: str) -> None:
        at, last_percent, last_stage = self.last
        if stage == last_stage and abs(percent - last_percent) < 3 and time.monotonic() - at < 5:
            return
        self.last = (time.monotonic(), percent, stage)
        await self.update(progress=max(0, min(99, int(percent))), stage=stage[:120])


async def download_storage(settings, path: str) -> bytes:
    url = settings.supabase_url.rstrip("/") + f"/storage/v1/object/{BUCKET}/{path}"
    headers = {"apikey": settings.supabase_service_role_key,
               "Authorization": f"Bearer {settings.supabase_service_role_key}"}
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.get(url, headers=headers)
        response.raise_for_status()
        return response.content


async def update_message(db: SupabaseRepository, plan: VideoJobPlan, message_id: str, *,
                         job: dict[str, Any], attachment: dict[str, str] | None = None,
                         extra: dict[str, Any] | None = None) -> None:
    rows = await db._request("GET", "messages", params={
        "id": f"eq.{message_id}", "companion_id": f"eq.{plan.companion_id}", "select": "metadata", "limit": "1"})
    if not rows:
        return
    metadata = dict(rows[0].get("metadata") or {})
    attachments = list(metadata.get("attachments") or [])
    if attachment and all(a.get("path") != attachment["path"] for a in attachments):
        attachments.append(attachment)
    metadata.update({**(extra or {}), "attachments": attachments,
                     "media_job": {**(metadata.get("media_job") or {}), **job}})
    await db._request("PATCH", "messages", params={"id": f"eq.{message_id}", "companion_id": f"eq.{plan.companion_id}"},
                      headers={"Prefer": "return=minimal"}, json={"metadata": metadata})


async def _store(db: SupabaseRepository, owner: str, content: bytes, mime: str) -> str:
    ext = {"video/mp4": "mp4", "video/webm": "webm", "image/png": "png", "image/jpeg": "jpg",
           "image/webp": "webp"}.get(mime)
    if ext is None:
        raise ImageProviderError("The generator returned an unsupported file type.")
    path = f"{owner}/{uuid.uuid4()}.{ext}"
    await db.upload_storage(BUCKET, path, content, mime)
    return path


async def run_video_job(settings, plan: VideoJobPlan, message_id: str) -> None:
    db = _service_db(settings)
    reporter = JobReporter(settings, plan.id)
    started = time.perf_counter()
    async with GPU_LOCK:
        await reporter.update(status="running", message_id=message_id, started_at=_now(),
                              stage="Starting…", progress=1)
        await update_message(db, plan, message_id, job={"status": "running"})
        negative = ADULT_NEGATIVE if plan.explicit else ""
        try:
            source: tuple[bytes, str] | None = None
            if plan.mode == "t2i2v":
                await reporter.progress(3, "Creating the first frame…")
                image = await create_image_provider(settings).generate(plan.still_prompt or plan.prompt)
                mime = image["mime_type"]
                still_path = await _store(db, plan.owner_user_id, image["bytes"], mime)
                await reporter.update(source_path=still_path, source_mime=mime)
                await update_message(db, plan, message_id, job={"status": "running"},
                                     attachment={"path": still_path, "mime_type": mime},
                                     extra={"generated_image": True})
                source = (image["bytes"], mime)
            elif plan.mode == "i2v":
                await reporter.progress(3, "Reading the image…")
                source = (await download_storage(settings, plan.source_path or ""), plan.source_mime or "image/png")

            if source is not None and settings.comfyui_i2v_workflow.strip():
                result = await run_comfy_video_workflow(
                    settings.comfyui_url, settings.comfyui_i2v_workflow, prompt=plan.prompt, negative=negative,
                    seconds=plan.seconds, fps=settings.video_fps, timeout=settings.video_generation_timeout,
                    init_image=source, on_progress=reporter.progress)
            elif source is not None:
                # FramePack shares Heavy's GPU with ComfyUI: release ComfyUI's models first.
                await free_comfy_memory(settings.comfyui_url)
                result = await framepack_provider(settings).generate(
                    source[0], source[1], plan.prompt, seconds=plan.seconds, negative=negative,
                    on_progress=reporter.progress)
            else:
                result = await run_comfy_video_workflow(
                    settings.comfyui_url, settings.comfyui_t2v_workflow, prompt=plan.prompt, negative=negative,
                    seconds=plan.seconds, fps=settings.video_fps, timeout=settings.video_generation_timeout,
                    on_progress=reporter.progress)

            mime = result["mime_type"]
            if not str(mime).startswith("video/") or not result["bytes"]:
                raise ImageProviderError("The generator did not return a video.")
            if len(result["bytes"]) > settings.video_max_bytes:
                raise ImageProviderError("The video was too large to save. Try a shorter clip.")
            await reporter.progress(98, "Saving the video…")
            video_path = await _store(db, plan.owner_user_id, result["bytes"], mime)
            await update_message(db, plan, message_id, job={"status": "completed"},
                                 attachment={"path": video_path, "mime_type": mime},
                                 extra={"generated_video": True})
            await register_gallery(db, plan, message_id, video_path, mime)
            await reporter.update(status="completed", progress=100, stage="Ready", result_path=video_path,
                                  result_mime_type=mime, provider=result["provider"], model=result["model"],
                                  finished_at=_now(),
                                  latency_ms=round((time.perf_counter() - started) * 1000))
        except (ImageProviderNotConfigured, ImageProviderError) as exc:
            await _fail(db, reporter, plan, message_id, str(exc))
        except httpx.HTTPError:
            log.exception("Video job %s could not reach a service", plan.id)
            await _fail(db, reporter, plan, message_id, "A video service on Heavy could not be reached.")
        except Exception:
            log.exception("Video job %s failed", plan.id)
            await _fail(db, reporter, plan, message_id, "Something went wrong while making the video.")


async def _fail(db, reporter: JobReporter, plan: VideoJobPlan, message_id: str, error: str) -> None:
    await reporter.update(status="failed", stage="Couldn't finish", error=error[:300], finished_at=_now())
    try:
        await update_message(db, plan, message_id, job={"status": "failed", "error": error[:300]})
    except Exception:
        log.warning("Could not record the failed video on its message")


async def register_gallery(db: SupabaseRepository, plan: VideoJobPlan, message_id: str, path: str, mime: str) -> None:
    try:
        await db._request("POST", "gallery_items", params={"on_conflict": "id"},
                          headers={"Prefer": "resolution=merge-duplicates,return=minimal"}, json={
                              "id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"raialume:generated-video:{plan.id}")),
                              "companion_id": plan.companion_id, "conversation_id": plan.conversation_id,
                              "source": "companion", "category": "companion_sent", "media_type": "video",
                              "url": path, "caption": plan.prompt.split("\n\n")[0][:500],
                              "metadata": {"bucket": BUCKET, "storage_path": path, "message_id": message_id,
                                           "generated_video": True, "mime_type": mime, "media_job_id": plan.id}})
    except Exception:
        log.exception("Generated video saved to chat but gallery registration failed")


_RECOVERED = False


async def recover_interrupted_jobs(settings) -> None:
    """Jobs run in this process only. Before this process touches its first job, any
    job still marked unfinished belongs to an earlier process and cannot resume."""
    global _RECOVERED
    if _RECOVERED or _TASKS:
        _RECOVERED = True
        return
    try:
        await _service_db(settings)._request("PATCH", JOB_TABLE, params={"status": "in.(queued,running)"},
                                             headers={"Prefer": "return=minimal"}, json={
                                                 "status": "failed", "stage": "Couldn't finish",
                                                 "error": "Lumen restarted before this video finished. Ask again.",
                                                 "finished_at": _now(), "updated_at": _now()})
        _RECOVERED = True
    except Exception:
        log.warning("Could not mark interrupted video jobs")


router = APIRouter(prefix="/v0.3/media")

PUBLIC_JOB_FIELDS = ("id,status,progress,stage,mode,duration_seconds,result_path,result_mime_type,error,"
                     "message_id,conversation_id,created_at,updated_at")


def _require_private(privacy_mode: str) -> None:
    if privacy_mode != "private":
        raise HTTPException(403, "Videos and generation history are hidden while Public mode is on.")


@router.get("/capabilities")
async def capabilities(privacy_mode: Literal["private", "public"] = "private",
                       user: AuthUser = Depends(require_user)):
    settings = get_settings()
    if privacy_mode != "private":
        return {"images": False, "video": {"enabled": False}}
    routes = video_routes(settings)
    return {"images": bool(settings.comfyui_url.strip() and settings.comfyui_workflow.strip()),
            "video": {**routes, "max_seconds": settings.video_max_seconds,
                      "default_seconds": settings.video_default_seconds}}


@router.get("/jobs/{job_id}")
async def get_job(job_id: uuid.UUID, privacy_mode: Literal["private", "public"] = "private",
                  user: AuthUser = Depends(require_user)):
    _require_private(privacy_mode)
    await recover_interrupted_jobs(get_settings())
    rows = await _service_db(get_settings())._request("GET", JOB_TABLE, params={
        "id": f"eq.{job_id}", "owner_user_id": f"eq.{user.id}", "select": PUBLIC_JOB_FIELDS, "limit": "1"})
    if not rows:
        raise HTTPException(404, "Video not found")
    return rows[0]

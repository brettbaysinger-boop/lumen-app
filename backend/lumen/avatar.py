"""Optional Animated Companion mode.

Lumen keeps producing the reply and its Helios speech exactly as before. These
routes only let a signed-in user (a) open a WebRTC session with the avatar
bridge on the GPU host and (b) hand it the speech audio the app already holds,
so the animated companion speaks it. Nothing here generates text or speech,
touches conversations, or reads or writes memory.

The avatar bridge is never exposed to clients: the browser talks to these
authenticated routes, and Lumen talks to the bridge with a shared secret.
"""
import hmac
import re
import secrets
import time
from typing import Literal
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from .auth import AuthUser, require_user
from .config import get_settings
from .voice import owned_companion

router = APIRouter(prefix="/v0.1/avatar", tags=["avatar"])
MAX_SPEECH_BYTES = 10 * 1024 * 1024
MAX_SDP_BYTES = 200_000
TICKET_SECONDS = 60
MAX_TICKETS = 8
MIN_SECRET_LENGTH = 32
SECRET_HEADER = "X-Lumen-Avatar-Key"
UNAVAILABLE = "The animated companion is not available."


class SpeechTickets:
    """Speech waiting to be collected by the avatar bridge. Held in memory only,
    for one minute, and handed out exactly once."""

    def __init__(self):
        self.items: dict[str, tuple[float, bytes]] = {}

    def prune(self, now: float):
        for ticket in [t for t, (expires, _) in self.items.items() if expires <= now]:
            del self.items[ticket]

    def add(self, audio: bytes) -> str:
        now = time.monotonic()
        self.prune(now)
        while len(self.items) >= MAX_TICKETS:
            del self.items[next(iter(self.items))]
        ticket = secrets.token_urlsafe(32)
        self.items[ticket] = (now + TICKET_SECONDS, audio)
        return ticket

    def redeem(self, ticket: str) -> bytes | None:
        self.prune(time.monotonic())
        item = self.items.pop(ticket, None)
        return item[1] if item else None


tickets = SpeechTickets()


def avatar_settings():
    settings = get_settings()
    if not settings.avatar_url or len(settings.avatar_shared_secret) < MIN_SECRET_LENGTH:
        raise HTTPException(503, UNAVAILABLE)
    return settings


async def bridge(method: str, path: str, timeout: float, **kwargs) -> httpx.Response:
    settings = avatar_settings()
    try:
        async with httpx.AsyncClient(timeout=timeout, verify=settings.avatar_tls_verify) as client:
            response = await client.request(method, settings.avatar_url.rstrip("/") + path,
                                            headers={SECRET_HEADER: settings.avatar_shared_secret}, **kwargs)
            response.raise_for_status()
            return response
    except httpx.HTTPError as exc:
        raise HTTPException(503, UNAVAILABLE) from exc


@router.get("/status")
async def status(user: AuthUser = Depends(require_user)):
    settings = get_settings()
    if not settings.avatar_url or len(settings.avatar_shared_secret) < MIN_SECRET_LENGTH:
        return {"enabled": False, "available": False}
    try:
        await bridge("GET", "/liveness", 3)
    except HTTPException:
        return {"enabled": True, "available": False}
    return {"enabled": True, "available": True}


# --- Scenes -----------------------------------------------------------------
# A scene is another prepared avatar on the GPU host. The bridge owns the list and decides what is ready; these
# routes only pass on scene ids, labels and status codes for a signed-in user. No path or secret passes through,
# and the browser never reaches the bridge. Choosing a scene restarts the bridge, which the bridge itself refuses
# while the GPU is busy; a scene that fails to load gives way to the original by itself.
SCENE_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,31}$")
SCENE_LABEL = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 '&.,()-]{0,39}$")
SCENE_STATUSES = ("ready", "not_approved", "unavailable")
ORIGINAL_SCENE = {"id": "original", "label": "Original", "status": "ready"}
MAX_SCENES = 9
SCENE_REFUSALS = {
    "unknown_scene": "That scene does not exist.",
    "not_ready": "That scene is not prepared yet.",
    "not_approved": "That scene has not been approved yet.",
    "already_active": "That scene is already showing.",
    "not_managed": "Scenes can only be switched while the avatar service runs as the managed service.",
    "comfyui_busy": "The GPU is busy with an image job. The scene was not changed; try again when it has finished.",
    "comfyui_unknown": "The GPU host could not confirm that no image job is running. The scene was not changed.",
    "framepack_running": "A video is being generated on the GPU. The scene was not changed; try again when it has finished.",
    "gpu_unknown": "The GPU host could not confirm that the GPU is free. The scene was not changed.",
    "gpu_memory_low": "The GPU does not have enough free memory to load another scene. The scene was not changed.",
    "switch_in_progress": "A scene change is already under way.",
}
SCENE_FAILURES = ("scene_failed_to_start", "scene_not_ready")


def clean_scenes(body) -> dict | None:
    """The bridge's scene list reduced to what the app may show, or None when it is not a scene list."""
    if not isinstance(body, dict) or not isinstance(body.get("scenes"), list):
        return None
    scenes, seen = [], set()
    for item in body["scenes"][:MAX_SCENES]:
        if not isinstance(item, dict):
            continue
        scene_id, label, state = item.get("id"), item.get("label"), item.get("status")
        if (isinstance(scene_id, str) and SCENE_ID.match(scene_id) and scene_id not in seen
                and isinstance(label, str) and SCENE_LABEL.match(label) and state in SCENE_STATUSES):
            seen.add(scene_id)
            scenes.append({"id": scene_id, "label": label, "status": state})
    active = body.get("active")
    if "original" not in seen or active not in seen:
        return None
    switching = body.get("switching")
    error = body.get("last_error")
    failed = None
    if isinstance(error, dict) and error.get("code") in SCENE_FAILURES and error.get("scene") in seen:
        failed = {"code": error["code"], "scene": error["scene"]}
    return {"switchable": True, "active": active, "switching": switching if switching in seen else None,
            "scenes": scenes, "last_error": failed}


async def bridge_raw(method: str, path: str, timeout: float, **kwargs) -> httpx.Response | None:
    """Like `bridge`, but hands back the response whatever its status. None when the bridge cannot be reached."""
    settings = avatar_settings()
    try:
        async with httpx.AsyncClient(timeout=timeout, verify=settings.avatar_tls_verify) as client:
            return await client.request(method, settings.avatar_url.rstrip("/") + path,
                                        headers={SECRET_HEADER: settings.avatar_shared_secret}, **kwargs)
    except httpx.HTTPError:
        return None


async def read_scenes() -> dict:
    response = await bridge_raw("GET", "/lumen/scenes", 5)
    if response is None or response.status_code in (401, 403) or response.status_code >= 500:
        raise HTTPException(503, UNAVAILABLE)
    try:
        listed = clean_scenes(response.json()) if response.status_code == 200 else None
    except ValueError:
        listed = None
    # A bridge without scenes (the one in production today) serves the original and nothing can be switched.
    return listed or {"switchable": False, "active": "original", "switching": None,
                      "scenes": [dict(ORIGINAL_SCENE)], "last_error": None}


@router.get("/scenes")
async def scenes(user: AuthUser = Depends(require_user)):
    """The scenes the avatar host offers, which one is serving now, and which can be chosen."""
    return await read_scenes()


class SceneRequest(BaseModel):
    companion_id: UUID
    scene: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{0,31}$")


@router.post("/scene", status_code=202)
async def choose_scene(request: SceneRequest, user: AuthUser = Depends(require_user)):
    """Ask the avatar host to serve another scene. It restarts to do so, and refuses while the GPU is busy."""
    avatar_settings()
    await owned_companion(str(request.companion_id), user)
    listed = await read_scenes()
    chosen = next((scene for scene in listed["scenes"] if scene["id"] == request.scene), None)
    if not listed["switchable"] or chosen is None:
        raise HTTPException(404, SCENE_REFUSALS["unknown_scene"])
    if chosen["status"] != "ready":
        code = "not_approved" if chosen["status"] == "not_approved" else "not_ready"
        raise HTTPException(409, {"code": code, "message": SCENE_REFUSALS[code]})
    if listed["switching"]:
        raise HTTPException(409, {"code": "switch_in_progress", "message": SCENE_REFUSALS["switch_in_progress"]})
    if listed["active"] == request.scene:
        raise HTTPException(409, {"code": "already_active", "message": SCENE_REFUSALS["already_active"]})
    response = await bridge_raw("POST", "/lumen/scene", 20, json={"scene": request.scene})
    if response is None:
        raise HTTPException(503, UNAVAILABLE)
    try:
        body = response.json()
    except ValueError:
        body = None
    if response.status_code == 202 and isinstance(body, dict) and body.get("accepted") is True:
        return {"accepted": True, "scene": request.scene, "label": chosen["label"]}
    code = body.get("code") if isinstance(body, dict) else None
    if response.status_code == 409 and code in SCENE_REFUSALS:
        raise HTTPException(409, {"code": code, "message": SCENE_REFUSALS[code]})
    raise HTTPException(503, UNAVAILABLE)


class OfferRequest(BaseModel):
    companion_id: UUID
    webrtc_id: str = Field(pattern=r"^[A-Za-z0-9_-]{16,64}$")
    type: Literal["offer"]
    sdp: str = Field(min_length=1, max_length=MAX_SDP_BYTES)


@router.post("/offer")
async def offer(request: OfferRequest, user: AuthUser = Depends(require_user)):
    """Relay the browser's WebRTC offer to the avatar bridge and return its answer."""
    avatar_settings()
    await owned_companion(str(request.companion_id), user)
    response = await bridge("POST", "/webrtc/offer", 20,
                            json={"sdp": request.sdp, "type": request.type, "webrtc_id": request.webrtc_id})
    try:
        answer = response.json()
    except ValueError:
        answer = None
    if isinstance(answer, dict) and answer.get("status") == "failed":
        meta = answer.get("meta")
        busy = isinstance(meta, dict) and meta.get("error") == "concurrency_limit_reached"
        raise HTTPException(503, "The animated companion is busy with another session." if busy else UNAVAILABLE)
    if (not isinstance(answer, dict) or answer.get("type") != "answer" or not isinstance(answer.get("sdp"), str)
            or len(answer["sdp"]) > MAX_SDP_BYTES):
        raise HTTPException(503, UNAVAILABLE)
    return {"type": "answer", "sdp": answer["sdp"]}


@router.post("/speech")
async def offer_speech(request: Request, user: AuthUser = Depends(require_user)):
    """Accept reply audio the app already received from /v0.1/voice/speak and
    return a one-time ticket the avatar bridge can collect it with."""
    avatar_settings()
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > MAX_SPEECH_BYTES:
        raise HTTPException(413, "Speech audio exceeds 10 MB.")
    audio = bytearray()
    async for chunk in request.stream():
        audio.extend(chunk)
        if len(audio) > MAX_SPEECH_BYTES:
            raise HTTPException(413, "Speech audio exceeds 10 MB.")
    if len(audio) < 44 or audio[:4] != b"RIFF" or audio[8:12] != b"WAVE":
        raise HTTPException(400, "Speech audio must be a WAV file.")
    return {"ticket": tickets.add(bytes(audio)), "expires_in": TICKET_SECONDS}


@router.get("/speech/{ticket}")
async def collect_speech(ticket: str, key: str | None = Header(default=None, alias=SECRET_HEADER)):
    """Called by the avatar bridge only. A ticket works once."""
    settings = get_settings()
    secret = settings.avatar_shared_secret
    if (not settings.avatar_url or len(secret) < MIN_SECRET_LENGTH or not key
            or not hmac.compare_digest(key.encode(), secret.encode())):
        raise HTTPException(404, "Not found.")
    audio = tickets.redeem(ticket)
    if audio is None:
        raise HTTPException(404, "Not found.")
    return Response(audio, media_type="audio/wav", headers={"Cache-Control": "no-store"})

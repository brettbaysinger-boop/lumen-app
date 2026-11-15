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

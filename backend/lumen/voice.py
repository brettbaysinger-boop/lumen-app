import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from .auth import require_user, AuthUser
from .db import SupabaseRepository
from uuid import UUID
from .config import get_settings

router = APIRouter(prefix="/v0.1/voice", tags=["voice"], dependencies=[Depends(require_user)])
MAX_AUDIO_BYTES = 10 * 1024 * 1024


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    companion_id: UUID | None = None
    voice: str | None = Field(default=None, min_length=1, max_length=120)


def speech_settings():
    settings = get_settings()
    if not settings.speech_url:
        raise HTTPException(503, "Set SPEECH_URL in backend/.env to your Helios server.")
    return settings


def speech_base(settings):
    # Accept either the server origin or an OpenAI-style /v1 base URL.
    base = settings.speech_url.rstrip('/')
    for suffix in ('/v1/audio', '/v1'):
        if base.endswith(suffix): return base[:-len(suffix)]
    return base


def upstream_error(exc: httpx.HTTPError):
    if isinstance(exc, httpx.TimeoutException):
        return HTTPException(504, "Helios speech request timed out. Try a shorter recording or reply.")
    if isinstance(exc, httpx.HTTPStatusError):
        return HTTPException(502, f"Helios returned HTTP {exc.response.status_code}. Check its speech models and logs.")
    return HTTPException(502, "Could not reach Helios. Check SPEECH_URL and the speech service.")


@router.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    settings = speech_settings()
    try:
        audio = await file.read(MAX_AUDIO_BYTES + 1)
        if not audio:
            raise HTTPException(400, "The recording is empty.")
        if len(audio) > MAX_AUDIO_BYTES:
            raise HTTPException(413, "Recording exceeds 10 MB. Record a shorter message.")
        async with httpx.AsyncClient(timeout=120) as client:
            result = await client.post(
                speech_base(settings) + "/v1/audio/transcriptions",
                files={"file": ("recording" + suffix(file.content_type), audio,
                                file.content_type or "application/octet-stream")},
                data={"model": settings.transcription_model, "response_format": "json"},
            )
            result.raise_for_status()
        try:
            body = result.json()
            text = body.get("text") if isinstance(body, dict) else None
        except ValueError:
            text = None
        if not isinstance(text, str):
            raise HTTPException(502, "Helios returned an invalid transcript.")
        return {"text": text.strip()}
    except httpx.HTTPError as exc:
        raise upstream_error(exc) from exc
    finally:
        await file.close()


def suffix(content_type: str | None):
    kind = (content_type or "").split(";", 1)[0].strip()
    return {"audio/webm": ".webm", "audio/ogg": ".ogg", "audio/mp4": ".m4a",
            "audio/wav": ".wav"}.get(kind, ".audio")


@router.post("/speak")
async def speak(request: SpeechRequest, user: AuthUser = Depends(require_user)):
    settings = speech_settings()
    if not request.text.strip():
        raise HTTPException(400, "Reply text is empty.")
    selected_voice = settings.speech_voice
    if request.companion_id:
        companion = await owned_companion(str(request.companion_id), user)
        selected_voice = companion.get("speech_voice") or selected_voice
    if request.voice:
        voices = await discover_voices()
        if request.voice not in {v["id"] for v in voices}:
            raise HTTPException(400, "That voice is not available for the configured speech model.")
        selected_voice = request.voice
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            result = await client.post(
                speech_base(settings) + "/v1/audio/speech",
                json={"model": settings.speech_model, "voice": selected_voice,
                      "input": request.text, "response_format": "wav"},
            )
            result.raise_for_status()
        if not result.content or not result.headers.get("content-type", "").startswith("audio/"):
            raise HTTPException(502, "Helios returned invalid speech audio.")
        return Response(result.content, media_type="audio/wav",
                        headers={"Cache-Control": "no-store"})
    except httpx.HTTPError as exc:
        raise upstream_error(exc) from exc


async def owned_companion(companion_id: str, user: AuthUser):
    companion = await SupabaseRepository(get_settings(), user.token).get_companion(companion_id)
    if not companion:
        raise HTTPException(404, "Companion not found.")
    return companion


async def discover_voices():
    settings = speech_settings()
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            result = await client.get(speech_base(settings) + "/v1/audio/models")
            if result.status_code == 404:
                result = await client.get(speech_base(settings) + "/v1/models")
            result.raise_for_status()
        body = result.json()
        models = body.get("models", body.get("data", [])) if isinstance(body, dict) else []
        model = next((m for m in models if isinstance(m, dict) and m.get("id") == settings.speech_model), None)
        if not model:
            raise HTTPException(503, "The configured speech model is not installed on Helios.")
        raw = model.get("voices")
        if not isinstance(raw, list):
            raise HTTPException(502, "Helios did not provide voices for this speech model. Check its version.")
        voices = {}
        for item in raw:
            if isinstance(item, str):
                item = {"id": item, "name": item}
            if not isinstance(item, dict):
                continue
            voice_id = item.get("id") or item.get("name")
            if isinstance(voice_id, str) and voice_id:
                voices[voice_id] = {"id": voice_id, "name": item.get("name") or voice_id,
                                    "language": item.get("language"), "gender": item.get("gender")}
        return list(voices.values())
    except httpx.HTTPError as exc:
        raise upstream_error(exc) from exc
    except (ValueError, TypeError) as exc:
        raise HTTPException(502, "Helios returned an invalid voice catalog.") from exc


@router.get("/companions/{companion_id}/voices")
async def list_voices(companion_id: UUID, user: AuthUser = Depends(require_user)):
    companion = await owned_companion(str(companion_id), user)
    settings = speech_settings()
    return {"voices": await discover_voices(), "selected": companion.get("speech_voice"),
            "effective": companion.get("speech_voice") or settings.speech_voice, "model": settings.speech_model}


class VoiceChoice(BaseModel):
    voice: str | None = Field(default=None, min_length=1, max_length=120)


@router.put("/companions/{companion_id}/voice")
async def select_voice(companion_id: UUID, request: VoiceChoice, user: AuthUser = Depends(require_user)):
    await owned_companion(str(companion_id), user)
    if request.voice and request.voice not in {v["id"] for v in await discover_voices()}:
        raise HTTPException(400, "That voice is not available for the configured speech model.")
    db = SupabaseRepository(get_settings(), user.token)
    rows = await db._request("PATCH", "companions", params={"id": f"eq.{companion_id}"},
                             headers={"Prefer": "return=representation"}, json={"speech_voice": request.voice})
    if not rows:
        raise HTTPException(404, "Companion not found.")
    return {"selected": request.voice, "effective": request.voice or get_settings().speech_voice}

import httpx
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from .config import get_settings

router = APIRouter(prefix="/v0.1/voice", tags=["voice"])
MAX_AUDIO_BYTES = 10 * 1024 * 1024


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


def speech_settings():
    settings = get_settings()
    if not settings.speech_url:
        raise HTTPException(503, "Set SPEECH_URL in backend/.env to your Helios server.")
    return settings


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
                settings.speech_url.rstrip("/") + "/v1/audio/transcriptions",
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
async def speak(request: SpeechRequest):
    settings = speech_settings()
    if not request.text.strip():
        raise HTTPException(400, "Reply text is empty.")
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            result = await client.post(
                settings.speech_url.rstrip("/") + "/v1/audio/speech",
                json={"model": settings.speech_model, "voice": settings.speech_voice,
                      "input": request.text, "response_format": "wav"},
            )
            result.raise_for_status()
        if not result.content or not result.headers.get("content-type", "").startswith("audio/"):
            raise HTTPException(502, "Helios returned invalid speech audio.")
        return Response(result.content, media_type="audio/wav",
                        headers={"Cache-Control": "no-store"})
    except httpx.HTTPError as exc:
        raise upstream_error(exc) from exc

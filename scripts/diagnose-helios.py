"""Run from backend with its venv; prints no credentials or private conversations."""
import asyncio
import httpx
from lumen.config import get_settings
from lumen.voice import speech_base


async def main():
    settings = get_settings()
    if not settings.speech_url:
        print('SPEECH_URL is empty. Set it in backend/.env.'); return
    base = speech_base(settings)
    print('Helios base:', base)
    print('TTS model:', settings.speech_model)
    print('STT model:', settings.transcription_model)
    print('Default voice:', settings.speech_voice)
    async with httpx.AsyncClient(timeout=30) as client:
        for route in ('/openapi.json', '/v1/models', '/v1/audio/models'):
            try:
                response = await client.get(base + route)
                print(route, 'HTTP', response.status_code)
                if response.is_success:
                    body = response.json()
                    if route == '/openapi.json':
                        print('Speech routes:', [p for p in body.get('paths', {}) if 'audio' in p or 'models' in p])
                    else:
                        models = body.get('models', body.get('data', []))
                        for model in models:
                            print('Installed:', model.get('id'), 'voices:', len(model.get('voices') or []))
            except (httpx.HTTPError, ValueError, TypeError) as exc:
                print(route, type(exc).__name__)
        try:
            response = await client.post(base + '/v1/audio/speech', json={
                'model': settings.speech_model, 'voice': settings.speech_voice,
                'input': 'Hello Brett. Helios speech connection test.', 'response_format': 'wav'})
            print('Speech test: HTTP', response.status_code, 'type:', response.headers.get('content-type'), 'bytes:', len(response.content))
            if not response.is_success:
                try:
                    detail = response.json().get('detail')
                    print('Speech error:', str(detail)[:500])
                except (ValueError, AttributeError):
                    print('Server returned a non-JSON error.')
        except httpx.HTTPError as exc:
            print('Speech test:', type(exc).__name__)


asyncio.run(main())

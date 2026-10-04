import unittest
from unittest.mock import patch

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from lumen.config import Settings
from lumen.voice import router, MAX_AUDIO_BYTES


class VoiceRoutes(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(router)
        self.client = TestClient(app)
        self.settings = Settings(supabase_url="http://db", supabase_service_role_key="test",
                                 speech_url="http://helios:8000")
        self.settings_patch = patch("lumen.voice.get_settings", return_value=self.settings)
        self.settings_patch.start()
        self.addCleanup(self.settings_patch.stop)
        self.addCleanup(self.client.close)

    def upstream(self, handler):
        original = httpx.AsyncClient
        return patch("lumen.voice.httpx.AsyncClient",
                     side_effect=lambda **kw: original(transport=httpx.MockTransport(handler), **kw))

    def test_transcript_forwards_browser_audio_and_model(self):
        def handler(request):
            self.assertEqual(str(request.url), "http://helios:8000/v1/audio/transcriptions")
            payload = request.read()
            self.assertIn(b"recording.ogg", payload)
            self.assertIn(self.settings.transcription_model.encode(), payload)
            self.assertIn(b"audio/ogg;codecs=opus", payload)
            return httpx.Response(200, json={"text": " Remember my favorite color is turquoise "})
        with self.upstream(handler):
            reply = self.client.post("/v0.1/voice/transcribe",
                                     files={"file": ("recording", b"audio", "audio/ogg;codecs=opus")})
        self.assertEqual(reply.status_code, 200)
        self.assertEqual(reply.json()["text"], "Remember my favorite color is turquoise")

    def test_empty_and_oversized_uploads_do_not_reach_helios(self):
        with patch("lumen.voice.httpx.AsyncClient") as client:
            for data, status in [(b"", 400), (b"x" * (MAX_AUDIO_BYTES + 1), 413)]:
                reply = self.client.post("/v0.1/voice/transcribe", files={"file": ("a.webm", data)})
                self.assertEqual(reply.status_code, status)
            client.assert_not_called()

    def test_invalid_transcript_is_reported(self):
        for data in ({"text": 123}, {"wrong": "text"}, []):
            with self.upstream(lambda r: httpx.Response(200, json=data)):
                response = self.client.post("/v0.1/voice/transcribe", files={"file": ("a", b"audio")})
            self.assertEqual(response.status_code, 502)

    def test_speech_model_voice_and_wav_response(self):
        def handler(request):
            import json
            body = json.loads(request.read())
            self.assertEqual(body["voice"], "af_heart")
            self.assertEqual(body["model"], self.settings.speech_model)
            self.assertEqual(body["input"], "Hello Brett")
            self.assertEqual(body["response_format"], "wav")
            return httpx.Response(200, content=b"RIFFtestWAVE", headers={"Content-Type": "audio/wav"})
        with self.upstream(handler):
            result = self.client.post("/v0.1/voice/speak", json={"text": "Hello Brett"})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.content, b"RIFFtestWAVE")
        self.assertEqual(result.headers["cache-control"], "no-store")

    def test_upstream_failures_and_invalid_audio(self):
        for status, expected in [(500, 502), (200, 502)]:
            with self.upstream(lambda r: httpx.Response(status, json={"error": "failed"})):
                result = self.client.post("/v0.1/voice/speak", json={"text": "Hello"})
            self.assertEqual(result.status_code, expected)
        def timeout(request):
            raise httpx.ReadTimeout("timeout", request=request)
        with self.upstream(timeout):
            result = self.client.post("/v0.1/voice/speak", json={"text": "Hello"})
        self.assertEqual(result.status_code, 504)

    def test_text_limits_and_missing_configuration(self):
        self.assertEqual(self.client.post("/v0.1/voice/speak", json={"text": "x" * 4001}).status_code, 422)
        self.settings.speech_url = ""
        self.assertEqual(self.client.post("/v0.1/voice/speak", json={"text": "Hello"}).status_code, 503)


if __name__ == "__main__":
    unittest.main()

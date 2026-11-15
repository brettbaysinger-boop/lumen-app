import json
import struct
import unittest
from unittest.mock import patch, AsyncMock

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from lumen import avatar
from lumen.auth import require_user, AuthUser
from lumen.config import Settings
from lumen.voice import router as voice_router

SECRET = "fictional-test-secret-0123456789abcdef"
COMPANION = "11111111-1111-4111-8111-111111111111"
WAV = b"RIFF" + struct.pack("<I", 40) + b"WAVEfmt " + b"\x00" * 28 + b"data" + b"\x00" * 8
OFFER = {"companion_id": COMPANION, "webrtc_id": "fictional-session-0001", "type": "offer", "sdp": "v=0 fictional"}


class AvatarRoutes(unittest.TestCase):
    def configure(self, **overrides):
        values = dict(supabase_url="http://db", supabase_service_role_key="test", speech_url="http://helios:8000",
                      avatar_url="https://heavy:8283", avatar_shared_secret=SECRET)
        values.update(overrides)
        self.settings = Settings(**values)
        for target in ("lumen.avatar.get_settings", "lumen.voice.get_settings"):
            started = patch(target, return_value=self.settings)
            started.start()
            self.addCleanup(started.stop)

    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(avatar.router)
        self.app.include_router(voice_router)
        self.app.dependency_overrides[require_user] = lambda: AuthUser("test-user", "test-token")
        self.client = TestClient(self.app)
        self.addCleanup(self.client.close)
        avatar.tickets.items.clear()
        self.configure()
        self.owned = patch("lumen.avatar.owned_companion", AsyncMock(return_value={"id": COMPANION}))
        self.owned.start()
        self.addCleanup(self.owned.stop)

    def upstream(self, handler):
        original = httpx.AsyncClient
        return patch("lumen.avatar.httpx.AsyncClient",
                     side_effect=lambda **kw: original(transport=httpx.MockTransport(handler), **kw))

    # --- authentication and ownership -------------------------------------------------
    def test_user_routes_require_a_signed_in_user(self):
        self.app.dependency_overrides.clear()
        for method, path, kwargs in (("get", "/v0.1/avatar/status", {}), ("post", "/v0.1/avatar/offer", {"json": OFFER}),
                                     ("post", "/v0.1/avatar/speech", {"content": WAV})):
            with patch("lumen.avatar.httpx.AsyncClient") as upstream:
                self.assertEqual(getattr(self.client, method)(path, **kwargs).status_code, 401)
                upstream.assert_not_called()
        self.assertEqual(avatar.tickets.items, {})

    def test_offer_is_refused_for_a_companion_the_user_does_not_own(self):
        from fastapi import HTTPException
        self.owned.stop()
        with patch("lumen.avatar.owned_companion", AsyncMock(side_effect=HTTPException(404, "Companion not found."))), \
                patch("lumen.avatar.httpx.AsyncClient") as upstream:
            self.assertEqual(self.client.post("/v0.1/avatar/offer", json=OFFER).status_code, 404)
            upstream.assert_not_called()
        self.owned.start()

    # --- disabled by default ----------------------------------------------------------
    def test_mode_is_off_unless_configured(self):
        for overrides in ({"avatar_url": ""}, {"avatar_shared_secret": ""}, {"avatar_shared_secret": "too-short"}):
            self.configure(**overrides)
            with patch("lumen.avatar.httpx.AsyncClient") as upstream:
                self.assertEqual(self.client.get("/v0.1/avatar/status").json(), {"enabled": False, "available": False})
                self.assertEqual(self.client.post("/v0.1/avatar/offer", json=OFFER).status_code, 503)
                self.assertEqual(self.client.post("/v0.1/avatar/speech", content=WAV).status_code, 503)
                self.assertEqual(self.client.get("/v0.1/avatar/speech/x", headers={"X-Lumen-Avatar-Key": ""}).status_code, 404)
                upstream.assert_not_called()

    def test_default_settings_leave_the_mode_off(self):
        defaults = Settings(supabase_url="http://db", supabase_service_role_key="test", _env_file=None)
        self.assertEqual((defaults.avatar_url, defaults.avatar_shared_secret), ("", ""))

    # --- bridge relay -----------------------------------------------------------------
    def test_status_reports_bridge_reachability_with_the_secret(self):
        def up(request):
            self.assertEqual(str(request.url), "https://heavy:8283/liveness")
            self.assertEqual(request.headers["x-lumen-avatar-key"], SECRET)
            return httpx.Response(200, json={"status": "ok"})
        with self.upstream(up):
            self.assertEqual(self.client.get("/v0.1/avatar/status").json(), {"enabled": True, "available": True})
        for down in (lambda r: httpx.Response(401), lambda r: (_ for _ in ()).throw(httpx.ConnectError("down"))):
            with self.upstream(down):
                self.assertEqual(self.client.get("/v0.1/avatar/status").json(), {"enabled": True, "available": False})

    def test_offer_is_relayed_and_only_the_answer_comes_back(self):
        def handler(request):
            self.assertEqual(str(request.url), "https://heavy:8283/webrtc/offer")
            self.assertEqual(request.headers["x-lumen-avatar-key"], SECRET)
            self.assertNotIn("authorization", request.headers)
            self.assertEqual(json.loads(request.read()),
                             {"sdp": "v=0 fictional", "type": "offer", "webrtc_id": "fictional-session-0001"})
            return httpx.Response(200, json={"type": "answer", "sdp": "v=0 answer", "extra": "dropped"})
        with self.upstream(handler):
            reply = self.client.post("/v0.1/avatar/offer", json=OFFER)
        self.assertEqual((reply.status_code, reply.json()), (200, {"type": "answer", "sdp": "v=0 answer"}))
        self.assertNotIn(SECRET, reply.text)

    def test_bridge_failures_become_unavailable(self):
        cases = [httpx.Response(200, json={"status": "failed", "meta": {"error": "concurrency_limit_reached"}}),
                 httpx.Response(200, json={"status": "failed", "meta": {"error": "connection_already_exists"}}),
                 httpx.Response(200, json={"type": "offer", "sdp": "x"}), httpx.Response(200, content=b"not json"),
                 httpx.Response(500), httpx.Response(401)]
        for response in cases:
            with self.upstream(lambda request, response=response: response):
                reply = self.client.post("/v0.1/avatar/offer", json=OFFER)
            self.assertEqual(reply.status_code, 503)
            self.assertNotIn(SECRET, reply.text)
        with self.upstream(lambda request: (_ for _ in ()).throw(httpx.ConnectTimeout("slow"))):
            self.assertEqual(self.client.post("/v0.1/avatar/offer", json=OFFER).status_code, 503)

    def test_invalid_offers_do_not_reach_the_bridge(self):
        bad = [dict(OFFER, type="answer"), dict(OFFER, webrtc_id="../x"), dict(OFFER, sdp=""),
               dict(OFFER, sdp="x" * 200_001), dict(OFFER, companion_id="not-a-uuid")]
        with patch("lumen.avatar.httpx.AsyncClient") as upstream:
            for body in bad:
                self.assertEqual(self.client.post("/v0.1/avatar/offer", json=body).status_code, 422)
            upstream.assert_not_called()

    # --- scenes -----------------------------------------------------------------------
    LISTED = {"active": "original", "switching": None, "catalog_ok": True, "last_error": None, "scenes": [
        {"id": "original", "label": "Original", "status": "ready"},
        {"id": "midnight-sanctuary", "label": "Midnight Sanctuary", "status": "unavailable"},
        {"id": "rose-garden", "label": "Rose Garden", "status": "ready"}]}

    def scene_bridge(self, listed=None, answer=None, posts=None):
        def handler(request):
            self.assertEqual(request.headers["x-lumen-avatar-key"], SECRET)
            self.assertNotIn("authorization", request.headers)
            if request.method == "GET":
                self.assertEqual(str(request.url), "https://heavy:8283/lumen/scenes")
                return listed if isinstance(listed, httpx.Response) else httpx.Response(200, json=listed or self.LISTED)
            self.assertEqual(str(request.url), "https://heavy:8283/lumen/scene")
            if posts is not None:
                posts.append(json.loads(request.read()))
            return answer or httpx.Response(202, json={"accepted": True, "scene": "rose-garden", "restart": True})
        return self.upstream(handler)

    def choose(self, scene="rose-garden"):
        return self.client.post("/v0.1/avatar/scene", json={"companion_id": COMPANION, "scene": scene})

    def test_scene_routes_require_a_signed_in_user_and_an_owned_companion(self):
        from fastapi import HTTPException
        self.owned.stop()
        with patch("lumen.avatar.owned_companion", AsyncMock(side_effect=HTTPException(404, "Companion not found."))), \
                patch("lumen.avatar.httpx.AsyncClient") as upstream:
            self.assertEqual(self.choose().status_code, 404)
            upstream.assert_not_called()
        self.owned.start()
        self.app.dependency_overrides.clear()
        with patch("lumen.avatar.httpx.AsyncClient") as upstream:
            self.assertEqual(self.client.get("/v0.1/avatar/scenes").status_code, 401)
            self.assertEqual(self.choose().status_code, 401)
            upstream.assert_not_called()

    def test_scenes_are_listed_with_status_and_nothing_else(self):
        dirty = json.loads(json.dumps(self.LISTED))
        dirty["scenes"][1]["config"] = "/data/private/midnight.yaml"
        dirty["scenes"] += [{"id": "../etc", "label": "x", "status": "ready"},
                            {"id": "odd", "label": "<b>", "status": "ready"},
                            {"id": "late", "label": "Late", "status": "live"}, "junk"]
        dirty["secret"] = SECRET
        with self.scene_bridge(dirty):
            reply = self.client.get("/v0.1/avatar/scenes")
        self.assertEqual(reply.json(), {"switchable": True, "active": "original", "switching": None, "last_error": None,
                                        "scenes": self.LISTED["scenes"]})
        self.assertNotIn("/data", reply.text)
        self.assertNotIn(SECRET, reply.text)

    def test_a_bridge_without_scenes_offers_only_the_original(self):
        only = {"switchable": False, "active": "original", "switching": None, "last_error": None,
                "scenes": [{"id": "original", "label": "Original", "status": "ready"}]}
        for listed in (httpx.Response(404), httpx.Response(200, json={"status": "ok"}), httpx.Response(200, content=b"x"),
                       httpx.Response(200, json={"active": "gone", "scenes": self.LISTED["scenes"]})):
            with self.scene_bridge(listed):
                self.assertEqual(self.client.get("/v0.1/avatar/scenes").json(), only)
            with self.scene_bridge(listed):
                self.assertEqual(self.choose().status_code, 404)
        for listed in (httpx.Response(500), httpx.Response(401)):
            with self.scene_bridge(listed):
                self.assertEqual(self.client.get("/v0.1/avatar/scenes").status_code, 503)
        self.configure(avatar_url="")
        with patch("lumen.avatar.httpx.AsyncClient") as upstream:
            self.assertEqual(self.client.get("/v0.1/avatar/scenes").status_code, 503)
            self.assertEqual(self.choose().status_code, 503)
            upstream.assert_not_called()

    def test_a_ready_scene_is_chosen_by_id_only(self):
        posts = []
        with self.scene_bridge(posts=posts):
            reply = self.choose()
        self.assertEqual((reply.status_code, reply.json()), (202, {"accepted": True, "scene": "rose-garden", "label": "Rose Garden"}))
        self.assertEqual(posts, [{"scene": "rose-garden"}])

    def test_unprepared_unknown_and_malformed_scenes_never_reach_the_switch(self):
        posts = []
        with self.scene_bridge(posts=posts):
            reply = self.choose("midnight-sanctuary")
            self.assertEqual((reply.status_code, reply.json()["detail"]["code"]), (409, "not_ready"))
            self.assertEqual(self.choose("nope").status_code, 404)
            self.assertEqual(self.choose("original").json()["detail"]["code"], "already_active")
            for bad in ("../../etc/passwd", "/data/x.yaml", "UPPER", "", "a" * 40):
                self.assertEqual(self.choose(bad).status_code, 422)
        pending = dict(self.LISTED, scenes=[self.LISTED["scenes"][0], dict(self.LISTED["scenes"][1], status="not_approved")])
        with self.scene_bridge(pending, posts=posts):
            self.assertEqual(self.choose("midnight-sanctuary").json()["detail"]["code"], "not_approved")
        with self.scene_bridge(dict(self.LISTED, switching="rose-garden"), posts=posts):
            self.assertEqual(self.choose().json()["detail"]["code"], "switch_in_progress")
        self.assertEqual(posts, [])

    def test_bridge_refusals_are_told_plainly_and_other_failures_are_unavailable(self):
        for code in ("comfyui_busy", "framepack_running", "gpu_memory_low", "gpu_unknown", "not_managed"):
            with self.scene_bridge(answer=httpx.Response(409, json={"code": code, "path": "/data/x"})):
                reply = self.choose()
            self.assertEqual((reply.status_code, reply.json()["detail"]), (409, {"code": code, "message": avatar.SCENE_REFUSALS[code]}))
            self.assertIn("not changed", reply.json()["detail"]["message"]) if code != "not_managed" else None
        for answer in (httpx.Response(409, json={"code": "something_else"}), httpx.Response(500), httpx.Response(202, content=b"x"),
                       httpx.Response(200, json={"accepted": True})):
            with self.scene_bridge(answer=answer):
                self.assertEqual(self.choose().status_code, 503)

    def test_a_failed_scene_is_reported_after_the_original_returns(self):
        failed = dict(self.LISTED, last_error={"code": "scene_failed_to_start", "scene": "rose-garden", "detail": "CUDA /data"})
        with self.scene_bridge(failed):
            body = self.client.get("/v0.1/avatar/scenes").json()
        self.assertEqual((body["active"], body["last_error"]), ("original", {"code": "scene_failed_to_start", "scene": "rose-garden"}))

    # --- speech tickets ---------------------------------------------------------------
    def test_speech_ticket_is_collected_once_by_the_bridge_only(self):
        ticket = self.client.post("/v0.1/avatar/speech", content=WAV).json()["ticket"]
        self.assertRegex(ticket, r"^[A-Za-z0-9_-]{43}$")
        path = f"/v0.1/avatar/speech/{ticket}"
        for headers in ({}, {"X-Lumen-Avatar-Key": "wrong"}, {"Authorization": "Bearer test-token"}):
            self.assertEqual(self.client.get(path, headers=headers).status_code, 404)
        reply = self.client.get(path, headers={"X-Lumen-Avatar-Key": SECRET})
        self.assertEqual((reply.status_code, reply.content, reply.headers["content-type"]), (200, WAV, "audio/wav"))
        self.assertEqual(reply.headers["cache-control"], "no-store")
        self.assertEqual(self.client.get(path, headers={"X-Lumen-Avatar-Key": SECRET}).status_code, 404)

    def test_tickets_expire_and_are_bounded(self):
        with patch("lumen.avatar.time.monotonic", return_value=1000.0):
            first = [self.client.post("/v0.1/avatar/speech", content=WAV).json()["ticket"] for _ in range(avatar.MAX_TICKETS + 2)]
            self.assertEqual(len(avatar.tickets.items), avatar.MAX_TICKETS)
            self.assertNotIn(first[0], avatar.tickets.items)
        with patch("lumen.avatar.time.monotonic", return_value=1000.0 + avatar.TICKET_SECONDS):
            reply = self.client.get(f"/v0.1/avatar/speech/{first[-1]}", headers={"X-Lumen-Avatar-Key": SECRET})
        self.assertEqual(reply.status_code, 404)
        self.assertEqual(avatar.tickets.items, {})

    def test_only_bounded_wav_audio_is_accepted(self):
        self.assertEqual(self.client.post("/v0.1/avatar/speech", content=b"").status_code, 400)
        self.assertEqual(self.client.post("/v0.1/avatar/speech", content=b"x" * 100).status_code, 400)
        big = WAV + b"\x00" * avatar.MAX_SPEECH_BYTES
        self.assertEqual(self.client.post("/v0.1/avatar/speech", content=big).status_code, 413)
        self.assertEqual(avatar.tickets.items, {})

    # --- no second speech request, existing voice route unchanged ---------------------
    def test_avatar_routes_never_call_helios_and_speak_is_unchanged(self):
        calls = []

        def helios(request):
            calls.append(str(request.url))
            return httpx.Response(200, content=WAV, headers={"Content-Type": "audio/wav"})
        original = httpx.AsyncClient
        with patch("lumen.voice.httpx.AsyncClient",
                   side_effect=lambda **kw: original(transport=httpx.MockTransport(helios), **kw)):
            spoken = self.client.post("/v0.1/voice/speak", json={"text": "A fictional reply."})
            ticket = self.client.post("/v0.1/avatar/speech", content=spoken.content).json()["ticket"]
            self.client.get(f"/v0.1/avatar/speech/{ticket}", headers={"X-Lumen-Avatar-Key": SECRET})
        self.assertEqual((spoken.status_code, spoken.content), (200, WAV))
        self.assertEqual(calls, ["http://helios:8000/v1/audio/speech"])


if __name__ == "__main__":
    unittest.main()

"""Local image and short video generation: safety, planning, Heavy clients, job delivery and
Private/Public enforcement. Every service is faked; nothing here reaches Heavy or Supabase."""
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from urllib.parse import parse_qs, urlsplit

import httpx

from lumen import media_jobs as mj
from lumen import privacy_mode as pm
from lumen.images import ImageProviderError, ImageProviderNotConfigured
from lumen.media_safety import check_media_prompt
from lumen.schemas import Attachment
from lumen.video_providers import (FramePackProvider, find_video_output, frame_count, framepack_arguments,
                                   framepack_progress, framepack_video_path, run_comfy_video_workflow)
from tests.test_privacy_mode import COMPANION_ID, CONVERSATION_ID, USER_ID, FakeModel, FakeSupabase

COMPANION = {"id": COMPANION_ID, "name": "Lumen", "visual_identity": "silver hair, green eyes"}


def video_settings(**overrides):
    values = dict(
        supabase_url="http://supabase.test", supabase_service_role_key="service",
        ollama_url="http://ollama.test", conversation_model="test-model", memory_observations_enabled=False,
        lumen_memory_backend="supabase", image_provider="comfyui", comfyui_url="http://heavy.test:8188",
        comfyui_workflow="/wf/flux.json", image_generation_timeout=60, video_generation_enabled=True,
        framepack_url="http://heavy.test:9000", framepack_api_name="/process", comfyui_t2v_workflow="",
        comfyui_i2v_workflow="", video_default_seconds=5.0, video_max_seconds=10.0, video_fps=16,
        video_generation_timeout=120, video_max_bytes=50 * 1024 * 1024, video_max_pending_per_user=2,
        video_render_budget_seconds=4 * 3600, video_poll_seconds=20)
    values.update(overrides)
    return SimpleNamespace(**values)


# ----------------------------------------------------------------------------- safety
class SafetyTests(unittest.TestCase):
    def test_adult_fiction_is_allowed_and_marked_explicit(self):
        verdict = check_media_prompt("a nude fantasy elf woman relaxing in a hot spring")
        self.assertTrue(verdict.allowed)
        self.assertTrue(verdict.explicit)

    def test_ordinary_prompts_are_allowed(self):
        for text in ("a fox in the snow", "kids building a sandcastle at the beach",
                     "my friend and I at an intimate dinner", "grilled chicken breasts on a plate",
                     "a portrait of my grandmother smiling"):
            verdict = check_media_prompt(text)
            self.assertTrue(verdict.allowed, text)
            self.assertFalse(verdict.explicit, text)

    def test_minors_are_hard_blocked_in_sexual_content(self):
        for text in ("nude teen on a beach", "sexy schoolgirl outfit", "naked 16 year old",
                     "erotic loli art", "sexy young girl", "n u d e t e e n"):
            verdict = check_media_prompt(text)
            self.assertFalse(verdict.allowed, text)
            self.assertEqual(verdict.reason, "minor", text)

    def test_real_people_are_hard_blocked_in_sexual_content(self):
        for text in ("nude photo of a famous actress", "sexy deepfake of a pop star",
                     "naked picture of my coworker", "topless lookalike of a celebrity"):
            verdict = check_media_prompt(text)
            self.assertFalse(verdict.allowed, text)
            self.assertEqual(verdict.reason, "real_person", text)

    def test_non_consent_is_blocked(self):
        verdict = check_media_prompt("explicit scene with an unconscious woman")
        self.assertFalse(verdict.allowed)
        self.assertEqual(verdict.reason, "non_consent")

    def test_owner_directive_false_positives_are_allowed(self):
        """Adult content of fictional adults passes; occupations, endearments, anniversaries,
        body types, sleep and figures of speech no longer trigger a block on their own."""
        for text in ("a nude elf queen on a royal throne", "sexy actress character in a fantasy film",
                     "a sleeping nude woman, oil painting", "hey baby, send me something sexy in lingerie",
                     "lingerie photo for our 5 year anniversary", "nude photo with forced perspective",
                     "petite flat-chested adult woman, nude", "erotic art of a singer on stage",
                     "my son's birthday cake", "an explicit erotic scene between two consenting adults"):
            verdict = check_media_prompt(text)
            self.assertTrue(verdict.allowed, text)

    def test_narrow_rules_still_block(self):
        for text, reason in (("nude 16 years old", "minor"), ("sexy 15yo", "minor"), ("aged 12, naked", "minor"),
                             ("nude young-looking girl", "minor"), ("erotic barely legal", "minor"),
                             ("sex without her consent", "non_consent"), ("forced to undress", "non_consent"),
                             ("nude deepfake of a celebrity", "real_person")):
            verdict = check_media_prompt(text)
            self.assertFalse(verdict.allowed, text)
            self.assertEqual(verdict.reason, reason, text)

    def test_uploaded_photos_never_become_intimate_video(self):
        self.assertFalse(check_media_prompt("make her undress", source="user_upload").allowed)
        self.assertTrue(check_media_prompt("make her undress", source="generated").allowed)
        self.assertTrue(check_media_prompt("make her wave hello", source="user_upload").allowed)


# ----------------------------------------------------------------------------- intent
class IntentTests(unittest.TestCase):
    def test_video_requests(self):
        for text in ("Make a short video of a fox running through snow", "can you animate this picture?",
                     "Send me a clip of you dancing", "bring that photo to life",
                     "Create a 6 second animation of waves"):
            self.assertTrue(mj.video_request(text), text)
        for text in ("Find me a YouTube video about bread", "I watched a great movie",
                     "what's your favorite animation studio?", "recommend a tutorial video"):
            self.assertFalse(mj.video_request(text), text)

    def test_image_requests_include_selfies(self):
        for text in ("send me a selfie", "can I see you?", "make a picture of a lighthouse",
                     "Show me a photo of you in a red dress"):
            self.assertTrue(mj.image_request(text), text)
        for text in ("paint me a picture with words", "make a video of a cat", "how was your day?"):
            self.assertFalse(mj.image_request(text), text)
        self.assertEqual(mj.image_subject("send me a selfie"), "self")
        self.assertEqual(mj.image_subject("make a picture of a lighthouse"), "other")

    def test_durations(self):
        self.assertEqual(mj.requested_seconds("an 8 second clip"), 8.0)
        self.assertEqual(mj.requested_seconds("a 5-minute video"), 300.0)
        self.assertEqual(mj.requested_seconds("a five minute video"), 300.0)
        self.assertIsNone(mj.requested_seconds("a video of rain"))

    def test_still_prompt_drops_video_words(self):
        self.assertEqual(mj.still_prompt("make a short video of a fox in snow"), "make an image of a fox in snow")

    def test_frame_count_is_wan_friendly(self):
        self.assertEqual((frame_count(5, 16) - 1) % 4, 0)


# ----------------------------------------------------------------------------- planning
class FakeJobsDb:
    def __init__(self, pending=0):
        self.pending = pending
        self.calls = []

    async def _request(self, method, table, **kwargs):
        self.calls.append((method, table, kwargs))
        if method == "GET" and table == mj.JOB_TABLE:
            return [{"id": str(i)} for i in range(self.pending)]
        return []


class PlanTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.db = FakeJobsDb()
        self.patch = patch.object(mj, "_service_db", return_value=self.db)
        self.patch.start()

    def tearDown(self):
        self.patch.stop()

    async def plan(self, message, settings=None, **kwargs):
        return await mj.plan_video_job(settings or video_settings(), privacy_mode=kwargs.pop("privacy_mode", "private"),
                                       user_id=USER_ID, companion=COMPANION, conversation_id=CONVERSATION_ID,
                                       user_message=message, **kwargs)

    async def test_public_mode_never_plans(self):
        result = await self.plan("make a video of a fox", privacy_mode="public")
        self.assertIsNone(result.plan)
        self.assertIn("Private", result.reply)
        self.assertEqual(self.db.calls, [])

    async def test_disabled_server(self):
        result = await self.plan("make a video of a fox", settings=video_settings(video_generation_enabled=False))
        self.assertIsNone(result.plan)
        self.assertIn("isn't switched on", result.reply)

    async def test_five_minutes_is_a_separate_capability(self):
        result = await self.plan("make a 5 minute video of the ocean")
        self.assertIsNone(result.plan)
        self.assertIn("five minutes", result.reply)

    async def test_text_to_video_uses_flux_then_framepack_without_wan(self):
        result = await self.plan("make a short video of you waving hello")
        self.assertEqual(result.plan.mode, "t2i2v")
        self.assertEqual(result.plan.seconds, 5.0)
        self.assertIn("silver hair", result.plan.still_prompt)   # companion identity for the first frame

    async def test_allowed_adult_prompts_are_not_rewritten(self):
        message = "make a short video of a nude elf woman bathing in a forest spring"
        result = await self.plan(message)
        self.assertTrue(result.plan.explicit)
        self.assertNotIn("adults", result.plan.prompt)
        self.assertNotIn("adults", result.plan.still_prompt or "")
        self.assertIn("nude elf woman bathing in a forest spring", result.plan.prompt)

    async def test_text_to_video_prefers_wan_workflow(self):
        result = await self.plan("make an 8 second video of rain on a window",
                                 settings=video_settings(comfyui_t2v_workflow="/wf/wan22.json"))
        self.assertEqual(result.plan.mode, "t2v")
        self.assertEqual(result.plan.seconds, 8.0)

    async def test_attached_image_is_animated(self):
        attachment = Attachment(path=f"{USER_ID}/photo.jpg", mime_type="image/jpeg")
        result = await self.plan("animate this", attachments=[attachment])
        self.assertEqual(result.plan.mode, "i2v")
        self.assertEqual(result.plan.source_path, f"{USER_ID}/photo.jpg")

    async def test_previous_generated_image_is_animated(self):
        recent = [{"role": "assistant", "metadata": {"generated_image": True,
                   "attachments": [{"path": f"{USER_ID}/gen.png", "mime_type": "image/png"}]}}]
        result = await self.plan("animate that picture", recent=recent)
        self.assertEqual((result.plan.mode, result.plan.source_path), ("i2v", f"{USER_ID}/gen.png"))

    async def test_other_users_images_are_never_used(self):
        recent = [{"role": "user", "metadata": {"attachments": [{"path": "someone-else/x.png", "mime_type": "image/png"}]}}]
        result = await self.plan("animate that picture", recent=recent)
        self.assertEqual(result.plan.mode, "t2i2v")
        self.assertIsNone(result.plan.source_path)

    async def test_uploaded_photo_cannot_become_intimate_video(self):
        attachment = Attachment(path=f"{USER_ID}/photo.jpg", mime_type="image/jpeg")
        result = await self.plan("animate this, make her undress", attachments=[attachment])
        self.assertIsNone(result.plan)
        self.assertIn("uploaded photos", result.reply)

    async def test_minor_is_refused_before_any_job(self):
        result = await self.plan("make a nude video of a teen")
        self.assertIsNone(result.plan)
        self.assertEqual(self.db.calls, [])

    async def test_pending_limit(self):
        self.db.pending = 2
        result = await self.plan("make a video of a fox")
        self.assertIsNone(result.plan)
        self.assertIn("other videos", result.reply)

    async def test_no_framepack_and_no_wan_means_no_text_to_video(self):
        result = await self.plan("make a video of a fox", settings=video_settings(framepack_url=""))
        self.assertIsNone(result.plan)


# ----------------------------------------------------------------------------- FramePack client
FRAMEPACK_PARAMETERS = [
    {"label": "Image", "parameter_name": "input_image", "component": "Image", "parameter_has_default": False},
    {"label": "Prompt", "parameter_name": "prompt", "component": "Textbox", "parameter_has_default": False},
    {"label": "Negative Prompt", "parameter_name": "n_prompt", "component": "Textbox",
     "parameter_has_default": True, "parameter_default": ""},
    {"label": "Seed", "parameter_name": "seed", "component": "Number", "parameter_has_default": True,
     "parameter_default": 31337},
    {"label": "Total Video Length (Seconds)", "parameter_name": "total_second_length", "component": "Slider",
     "parameter_has_default": True, "parameter_default": 5},
    {"label": "Latent Window Size", "parameter_name": "latent_window_size", "component": "Slider",
     "parameter_has_default": True, "parameter_default": 9},
    {"label": "Steps", "parameter_name": "steps", "component": "Slider", "parameter_has_default": True,
     "parameter_default": 25},
    {"label": "Use TeaCache", "parameter_name": "use_teacache", "component": "Checkbox",
     "parameter_has_default": True, "parameter_default": True},
]


class FramePackTests(unittest.IsolatedAsyncioTestCase):
    def test_arguments_follow_labels_and_keep_defaults(self):
        image = {"path": "/tmp/x.png", "meta": {"_type": "gradio.FileData"}}
        data = framepack_arguments(FRAMEPACK_PARAMETERS, image=image, prompt="she waves", negative="child",
                                   seed=7, seconds=4.0)
        self.assertEqual(data, [image, "she waves", "child", 7, 4.0, 9, 25, True])

    def test_unknown_required_input_is_reported(self):
        with self.assertRaises(ImageProviderNotConfigured):
            framepack_arguments([*FRAMEPACK_PARAMETERS, {"label": "Mystery", "parameter_has_default": False}],
                                image={}, prompt="p", negative="", seed=1, seconds=2.0)

    def test_progress_and_result(self):
        self.assertEqual(framepack_progress([None, None, "Total generated frames: 60, Video length: 2.00 seconds", ""], 4.0), 50)
        self.assertEqual(framepack_progress([None, None, "", "<div>Sampling 40%</div>"], 4.0), 40)
        self.assertEqual(framepack_video_path([{"video": {"path": "/out/a.mp4"}, "subtitles": None}]), "/out/a.mp4")
        self.assertEqual(framepack_video_path([{"path": "/out/b.mp4"}]), "/out/b.mp4")

    async def test_generate_end_to_end_over_gradio_http(self):
        seen = []

        def handler(request: httpx.Request):
            path = request.url.path
            seen.append((request.method, path))
            if path == "/gradio_api/info":
                return httpx.Response(200, json={"named_endpoints": {"/process": {"parameters": FRAMEPACK_PARAMETERS}}})
            if path == "/gradio_api/upload":
                return httpx.Response(200, json=["/tmp/gradio/source.png"])
            if path == "/gradio_api/call/process":
                body = json.loads(request.content)
                self.assertEqual(body["data"][0]["path"], "/tmp/gradio/source.png")
                self.assertEqual(body["data"][4], 3.0)
                return httpx.Response(200, json={"event_id": "ev1"})
            if path == "/gradio_api/call/process/ev1":
                stream = ("event: generating\ndata: [null, null, \"Video length: 1.50 seconds\", \"\"]\n\n"
                          "event: complete\ndata: [{\"video\": {\"path\": \"/outputs/clip.mp4\"}}, null]\n\n")
                return httpx.Response(200, text=stream)
            if path == "/gradio_api/file=/outputs/clip.mp4":
                return httpx.Response(200, content=b"MP4DATA")
            return httpx.Response(404)

        progress = []

        async def on_progress(percent, stage):
            progress.append(percent)

        original = httpx.AsyncClient
        with patch("lumen.video_providers.httpx.AsyncClient",
                   side_effect=lambda **kw: original(transport=httpx.MockTransport(handler), **kw)):
            result = await FramePackProvider(video_settings()).generate(
                b"PNG", "image/png", "she waves", seconds=3.0, on_progress=on_progress)
        self.assertEqual(result["bytes"], b"MP4DATA")
        self.assertEqual(result["mime_type"], "video/mp4")
        self.assertIn(50, progress)


# ----------------------------------------------------------------------------- ComfyUI video
class ComfyVideoTests(unittest.IsolatedAsyncioTestCase):
    def test_find_video_output(self):
        self.assertEqual(find_video_output({"9": {"gifs": [{"filename": "a.mp4", "subfolder": "", "type": "output"}]}}),
                         {"filename": "a.mp4", "subfolder": "", "type": "output"})
        self.assertEqual(find_video_output({"9": {"images": [{"filename": "b.webm"}], "animated": [True]}})["filename"],
                         "b.webm")
        self.assertIsNone(find_video_output({"9": {"images": [{"filename": "still.png"}]}}))

    async def test_wan_workflow_round_trip(self):
        import tempfile, os
        workflow = {"1": {"inputs": {"text": "{{LUMEN_PROMPT}}", "neg": "{{LUMEN_NEGATIVE}}"}},
                    "2": {"inputs": {"length": "{{LUMEN_FRAMES}}", "seed": "{{LUMEN_SEED}}", "fps": "{{LUMEN_FPS}}"}}}
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as handle:
            json.dump(workflow, handle)
        submitted = {}

        def handler(request: httpx.Request):
            path = request.url.path
            if path == "/prompt":
                submitted.update(json.loads(request.content)["prompt"])
                return httpx.Response(200, json={"prompt_id": "p1"})
            if path == "/history/p1":
                return httpx.Response(200, json={"p1": {"status": {"completed": True}, "outputs": {
                    "9": {"gifs": [{"filename": "wan.mp4", "subfolder": "", "type": "output"}]}}}})
            if path == "/view":
                return httpx.Response(200, content=b"WANMP4")
            return httpx.Response(404)

        original = httpx.AsyncClient
        try:
            with patch("lumen.video_providers.httpx.AsyncClient",
                       side_effect=lambda **kw: original(transport=httpx.MockTransport(handler), **kw)):
                result = await run_comfy_video_workflow("http://heavy.test:8188", handle.name, prompt="rain",
                                                        negative="", seconds=5, fps=16, timeout=30)
        finally:
            os.unlink(handle.name)
        self.assertEqual(result["bytes"], b"WANMP4")
        self.assertEqual(submitted["1"]["inputs"]["text"], "rain")
        self.assertEqual(submitted["2"]["inputs"]["length"], 81)
        self.assertIsInstance(submitted["2"]["inputs"]["seed"], int)


# ----------------------------------------------------------------------------- job delivery
class DeliveryDb:
    def __init__(self):
        self.requests = []
        self.uploads = []
        self.message = {"metadata": {"media_job": {"id": "job", "status": "queued"}, "provider_requests": []}}

    async def _request(self, method, table, **kwargs):
        self.requests.append((method, table, kwargs))
        if method == "GET" and table == "messages":
            return [self.message]
        if method == "PATCH" and table == "messages":
            self.message = {"metadata": kwargs["json"]["metadata"]}
        return []

    async def upload_storage(self, bucket, path, content, mime, upsert=False):
        self.uploads.append((bucket, path, mime))

    def job_updates(self):
        return [kw["json"] for method, table, kw in self.requests if table == mj.JOB_TABLE]


class DeliveryTests(unittest.IsolatedAsyncioTestCase):
    def plan(self, mode="t2i2v", **kwargs):
        return mj.VideoJobPlan(owner_user_id=USER_ID, companion_id=COMPANION_ID, conversation_id=CONVERSATION_ID,
                               mode=mode, prompt="she waves", seconds=5.0, explicit=False,
                               still_prompt="an image of Lumen waving" if mode == "t2i2v" else None, **kwargs)

    async def test_text_to_video_delivers_still_then_video_to_chat_and_gallery(self):
        db = DeliveryDb()
        image_provider = SimpleNamespace(generate=AsyncMock(return_value={
            "bytes": b"PNG", "mime_type": "image/png", "provider": "comfyui", "model": "flux", "latency_ms": 1}))
        framepack = SimpleNamespace(generate=AsyncMock(return_value={
            "bytes": b"MP4", "mime_type": "video/mp4", "provider": "framepack", "model": "framepack", "latency_ms": 9}))
        with patch.object(mj, "_service_db", return_value=db), \
                patch.object(mj, "create_image_provider", return_value=image_provider), \
                patch.object(mj, "framepack_provider", return_value=framepack), \
                patch.object(mj, "free_comfy_memory", AsyncMock()) as free:
            await mj.run_video_job(video_settings(), self.plan(), "msg-1")
        free.assert_awaited()                                   # VRAM released before FramePack
        self.assertEqual([u[2] for u in db.uploads], ["image/png", "video/mp4"])
        self.assertTrue(all(u[0] == "chat-media" and u[1].startswith(f"{USER_ID}/") for u in db.uploads))
        metadata = db.message["metadata"]
        self.assertEqual([a["mime_type"] for a in metadata["attachments"]], ["image/png", "video/mp4"])
        self.assertEqual(metadata["media_job"]["status"], "completed")
        self.assertTrue(metadata["generated_video"])
        gallery = [kw["json"] for method, table, kw in db.requests if table == "gallery_items"]
        self.assertEqual(gallery[0]["media_type"], "video")
        self.assertEqual(gallery[0]["metadata"]["message_id"], "msg-1")
        self.assertEqual(db.job_updates()[-1]["status"], "completed")

    async def test_video_prompt_unchanged_and_owner_negative_used_verbatim(self):
        for owner_negative in ("blurry, watermark", ""):
            db = DeliveryDb()
            framepack = SimpleNamespace(generate=AsyncMock(return_value={
                "bytes": b"MP4", "mime_type": "video/mp4", "provider": "framepack", "model": "f", "latency_ms": 1}))
            plan = self.plan("i2v", source_path=f"{USER_ID}/p.png", source_mime="image/png")
            plan = mj.VideoJobPlan(**{**plan.__dict__, "prompt": "she slowly undresses, nude, explicit",
                                      "explicit": True})
            with patch.object(mj, "_service_db", return_value=db), \
                    patch.object(mj, "download_storage", AsyncMock(return_value=b"PNG")), \
                    patch.object(mj, "framepack_provider", return_value=framepack), \
                    patch.object(mj, "free_comfy_memory", AsyncMock()):
                await mj.run_video_job(video_settings(comfyui_negative_prompt=owner_negative), plan, "msg-1")
            args, kwargs = framepack.generate.await_args
            self.assertEqual(args[2], "she slowly undresses, nude, explicit")
            self.assertEqual(kwargs["negative"], owner_negative)

    async def test_failure_is_recorded_without_claiming_success(self):
        db = DeliveryDb()
        framepack = SimpleNamespace(generate=AsyncMock(side_effect=ImageProviderError("FramePack is not reachable.")))
        with patch.object(mj, "_service_db", return_value=db), \
                patch.object(mj, "download_storage", AsyncMock(return_value=b"JPG")), \
                patch.object(mj, "framepack_provider", return_value=framepack), \
                patch.object(mj, "free_comfy_memory", AsyncMock()):
            await mj.run_video_job(video_settings(), self.plan("i2v", source_path=f"{USER_ID}/p.jpg",
                                                               source_mime="image/jpeg"), "msg-1")
        self.assertEqual(db.uploads, [])
        self.assertEqual(db.message["metadata"]["media_job"]["status"], "failed")
        self.assertEqual(db.job_updates()[-1]["error"], "FramePack is not reachable.")
        self.assertFalse(any(table == "gallery_items" for _, table, _ in db.requests))

    async def test_oversized_video_is_not_saved(self):
        db = DeliveryDb()
        framepack = SimpleNamespace(generate=AsyncMock(return_value={
            "bytes": b"x" * 2048, "mime_type": "video/mp4", "provider": "framepack", "model": "f", "latency_ms": 1}))
        with patch.object(mj, "_service_db", return_value=db), \
                patch.object(mj, "download_storage", AsyncMock(return_value=b"JPG")), \
                patch.object(mj, "framepack_provider", return_value=framepack), \
                patch.object(mj, "free_comfy_memory", AsyncMock()):
            await mj.run_video_job(video_settings(video_max_bytes=1024),
                                   self.plan("i2v", source_path=f"{USER_ID}/p.jpg", source_mime="image/jpeg"), "m")
        self.assertEqual(db.uploads, [])
        self.assertEqual(db.job_updates()[-1]["status"], "failed")


# ----------------------------------------------------------------------------- chat turns
class JobAwareSupabase(FakeSupabase):
    def handler(self, request: httpx.Request):
        table = urlsplit(str(request.url)).path.split("/rest/v1/", 1)[1]
        if table == mj.JOB_TABLE:
            self.requests.append((request.method, table, json.loads(request.content) if request.content else None))
            return httpx.Response(200, json=[])
        return super().handler(request)


class ChatTurnTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.supabase = JobAwareSupabase()
        original = httpx.AsyncClient
        self.patch = patch("lumen.db.httpx.AsyncClient",
                           side_effect=lambda **kw: original(transport=httpx.MockTransport(self.supabase.handler), **kw))
        self.patch.start()

    async def asyncTearDown(self):
        self.patch.stop()

    async def turn(self, mode, message, reply="Sure!"):
        runtime = pm.runtime_for(mode)(video_settings(), "user-token", USER_ID)
        runtime.provider = FakeModel(reply)
        runtime.request_key = "req-1"
        with patch("lumen.runtime.start_video_job") as start, \
                patch("lumen.runtime.create_companion_image", AsyncMock(return_value={
                    "attachments": [{"path": f"{USER_ID}/i.png", "mime_type": "image/png"}],
                    "generation_prompt": "p", "image_model": "flux"})) as image:
            response = await runtime.respond(COMPANION_ID, CONVERSATION_ID, message)
        return response, start, image

    def jobs_written(self):
        return [body for method, table, body in self.supabase.requests if table == mj.JOB_TABLE and method == "POST"]

    async def test_private_video_request_records_and_starts_a_job(self):
        response, start, _ = await self.turn("private", "Make a short video of you waving")
        self.assertIn("video", response.content)
        self.assertEqual(len(self.jobs_written()), 1)
        job = self.jobs_written()[0]
        self.assertEqual((job["owner_user_id"], job["mode"]), (USER_ID, "t2i2v"))
        start.assert_called_once()
        assistant = self.supabase.messages[0]
        self.assertEqual(assistant["metadata"]["media_job"]["id"], job["id"])
        self.assertEqual(start.call_args.args[2], assistant["id"])

    async def test_public_video_request_gets_a_discreet_reply_and_no_job(self):
        response, start, _ = await self.turn("public", "Make a short video of you waving")
        self.assertIn("Private", response.content)
        self.assertEqual(self.jobs_written(), [])
        start.assert_not_called()

    async def test_model_initiated_video_action_starts_a_job(self):
        reply = ('Here is a little moment. <lumen_image_action>{"action":"generate_video",'
                 '"action_input":"Lumen twirling in a sunlit field","subject":"self"}</lumen_image_action>')
        response, start, _ = await self.turn("private", "I miss you, what are you up to?", reply)
        self.assertNotIn("lumen_image_action", response.content)
        self.assertIn("Here is a little moment.", response.content)
        start.assert_called_once()

    async def test_clear_picture_request_is_honoured_when_the_model_forgets_its_action(self):
        response, _, image = await self.turn("private", "send me a selfie",
                                             "You're right, the image didn't come through.")
        image.assert_awaited_once()
        self.assertEqual(image.call_args.kwargs.get("subject"), "self")
        self.assertNotIn("didn't come through", response.content)

    async def test_public_selfie_request_never_calls_the_image_provider(self):
        _, _, image = await self.turn("public", "send me a selfie", "Not right now!")
        image.assert_not_awaited()

    async def test_unsafe_model_image_action_is_refused(self):
        reply = ('<lumen_image_action>{"action":"generate_image","action_input":"nude teen",'
                 '"subject":"other"}</lumen_image_action>')
        response, _, image = await self.turn("private", "surprise me", reply)
        image.assert_not_awaited()
        self.assertIn("minor", response.content)


class JobRouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_job_status_is_hidden_in_public_mode(self):
        from fastapi import HTTPException
        user = SimpleNamespace(id=USER_ID, token="t")
        with self.assertRaises(HTTPException) as caught:
            await mj.get_job("5b7d0e1e-5d2c-4b0e-9a54-0c1d7b0a0c11", privacy_mode="public", user=user)
        self.assertEqual(caught.exception.status_code, 403)

    async def test_job_status_is_scoped_to_the_signed_in_user(self):
        db = FakeJobsDb()
        with patch.object(mj, "_service_db", return_value=db), patch.object(mj, "get_settings", return_value=video_settings()):
            from fastapi import HTTPException
            with self.assertRaises(HTTPException):
                await mj.get_job("5b7d0e1e-5d2c-4b0e-9a54-0c1d7b0a0c11", privacy_mode="private",
                                 user=SimpleNamespace(id=USER_ID, token="t"))
        params = db.calls[-1][2]["params"]
        self.assertEqual(params["owner_user_id"], f"eq.{USER_ID}")

    async def test_capabilities_never_expose_heavy_addresses(self):
        with patch.object(mj, "get_settings", return_value=video_settings()):
            body = await mj.capabilities(privacy_mode="private", user=SimpleNamespace(id=USER_ID, token="t"))
        self.assertNotIn("heavy.test", json.dumps(body))
        self.assertTrue(body["video"]["image_to_video"])


class FramePackCheckScriptTests(unittest.TestCase):
    """scripts/check-framepack-endpoint.py is read-only and reports the real install's inputs."""

    def run_check(self, endpoints, api_name=None):
        import subprocess, sys, threading
        from http.server import BaseHTTPRequestHandler, HTTPServer
        from pathlib import Path

        class Fake(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_GET(self):
                if self.path != "/gradio_api/info":
                    self.send_response(404); self.end_headers(); return
                data = json.dumps({"named_endpoints": endpoints}).encode()
                self.send_response(200); self.send_header("content-type", "application/json"); self.end_headers()
                self.wfile.write(data)

            def do_POST(self):
                raise AssertionError("read-only check sent a POST")

        server = HTTPServer(("127.0.0.1", 0), Fake)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        script = Path(__file__).resolve().parents[2] / "scripts" / "check-framepack-endpoint.py"
        try:
            extra = ["--api-name", api_name] if api_name else []
            return subprocess.run([sys.executable, str(script), "--url", f"http://127.0.0.1:{server.server_port}", *extra],
                                  capture_output=True, text=True, timeout=30)
        finally:
            server.shutdown()

    def test_ready_when_inputs_map(self):
        result = self.run_check({"/process": {"parameters": FRAMEPACK_PARAMETERS}, "/end_process": {"parameters": []}})
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("Lumen input mapping: OK", result.stdout)

    def test_missing_endpoint_is_reported(self):
        result = self.run_check({"/generate": {"parameters": FRAMEPACK_PARAMETERS}})
        self.assertEqual(result.returncode, 1)
        self.assertIn("/generate", result.stdout)


class FramePackStudioShapeTests(unittest.TestCase):
    """The live Heavy install is FramePack-Studio (/handle_start_button, /partial). Lumen must refuse
    it rather than guess, until a dedicated adapter is verified."""

    def test_studio_start_button_is_refused(self):
        from lumen.video_providers import FramePackNeedsAdapter
        studio = [
            {"label": "Generation Type", "component": "Radio", "parameter_has_default": True, "parameter_default": "Original"},
            {"label": "Start Frame (optional)", "component": "Image", "parameter_has_default": True, "parameter_default": None},
            {"label": "Video Input", "component": "Video", "parameter_has_default": True, "parameter_default": None},
            {"label": "End Frame (Optional)", "component": "Image", "parameter_has_default": True, "parameter_default": None},
            {"label": "Prompt", "component": "Textbox", "parameter_has_default": True, "parameter_default": ""},
            {"label": "Video Length (Seconds)", "component": "Slider", "parameter_has_default": True, "parameter_default": 6},
        ]
        with self.assertRaises(FramePackNeedsAdapter):
            framepack_arguments(studio, image={"path": "x"}, prompt="p", negative="", seed=1, seconds=3.0)

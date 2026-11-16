"""FramePack-Studio adapter: exact contract, one job followed by id, no global stop calls.

The fake below reproduces the owner's read-only /gradio_api/info from Heavy (2026-11-16) and the
behaviour of FramePack-Studio's handle_start_button (enqueue, return job id) and monitor_job
(stream the running job, switch to any other running job). No GPU or network is used.
"""
import json
import unittest
from unittest.mock import patch

import httpx

from lumen.images import ImageProviderError
from lumen.video_providers import (STUDIO_INPUTS, FramePackNeedsAdapter, FramePackProvider,
                                   FramePackStudioProvider, framepack_provider, studio_arguments,
                                   studio_contract, studio_job_id, studio_video_for)
from tests.test_media_generation import video_settings

JOB = "1b4e28ba-2fa1-41d2-883f-0016d3cca427"
OTHER = "6fa459ea-ee8a-4ca4-894e-db77e160355e"
DEFAULTS = ["Original", None, None, None, 1.0, "", "", 2500, True, 6, 9, 25, 1.0, 10.0, 0.0, "MagCache",
            25, 0.15, 0.1, 2, 0.25, 4, "Noise", True, [], 640, 640, True, 5]
COMPONENTS = ["Radio", "Image", "Video", "Image", "Slider", "Textbox", "Textbox", "Number", "Checkbox",
              "Slider", "Slider", "Slider", "Slider", "Slider", "Slider", "Radio", "Slider", "Slider", "Slider",
              "Slider", "Slider", "Slider", "Dropdown", "Checkbox", "Dropdown", "Slider", "Slider", "Checkbox",
              "Slider"]


def heavy_info():
    """The shape the owner read from Heavy's FramePack-Studio on 127.0.0.1:7863."""
    start = []
    for position, label in enumerate(STUDIO_INPUTS):
        item = {"label": label, "component": COMPONENTS[position], "parameter_has_default": True,
                "parameter_default": DEFAULTS[position]}
        if position == 0:
            item["type"] = {"enum": ["Original", "Original with Endframe", "F1", "Video",
                                     "Video with Endframe", "Video F1"], "type": "string"}
        start.append(item)
    return {
        "/handle_start_button": {"parameters": start, "returns": [
            {"label": "Finished Frames Video"}, {"label": "Current Job ID"}, {"label": "Next Latents"},
            {"label": "value_193"}, {"label": "value_194"}, {"label": "Job Queue"}, {"label": "value_5"},
            {"label": "Seed"}, {"label": "value_199"}]},
        "/monitor_job": {"parameters": [{"label": "Current Job ID", "component": "Textbox"}], "returns": [
            {"label": "Finished Frames Video"}, {"label": "Next Latents"}, {"label": "Next Latents (Top Display)"},
            {"label": "value"}, {"label": "value"}]},
        "/check_for_current_job_and_monitor": {"parameters": [], "returns": [
            {"label": "Current Job ID"}, {"label": "Finished Frames Video"}, {"label": "Next Latents"},
            {"label": "Next Latents (Top Display)"}, {"label": "value"}, {"label": "value"}, {"label": "Job Queue"},
            {"label": "value"}]},
        "/end_process_with_update": {"parameters": [], "returns": []},
        "/partial": {"parameters": [{"label": f"p{i}"} for i in range(36)], "returns": []},
    }


def sse(*events):
    return "".join(f"event: {name}\ndata: {json.dumps(values)}\n\n" for name, values in events)


def video(path):
    return {"video": {"path": path, "meta": {"_type": "gradio.FileData"}}, "subtitles": None}


class FakeStudio:
    """A FramePack-Studio Gradio app. ``monitor`` is the list of monitor_job updates to stream."""

    def __init__(self, *, info=None, current=None, monitor=None, job_id=JOB):
        self.info = info or heavy_info()
        self.current = current
        self.job_id = job_id
        self.monitor = monitor if monitor is not None else [
            (None, "Waiting in queue. Position: 1", ""),
            (video(f"/fps/outputs/{JOB}_9.mp4"), "Sampling", "<div>40%</div>"),
            (video(f"/fps/outputs/{JOB}_37.mp4"), "Completed", "<div>100%</div>"),
        ]
        self.calls = []
        self.start_data = None

    def __call__(self, request: httpx.Request):
        path = request.url.path
        self.calls.append((request.method, path))
        if "end_process" in path or "clear" in path or "cancel" in path:
            raise AssertionError(f"global stop endpoint called: {path}")
        if path == "/gradio_api/info":
            return httpx.Response(200, json={"named_endpoints": self.info})
        if path == "/gradio_api/upload":
            return httpx.Response(200, json=["/tmp/gradio/abc/lumen-source.png"])
        if request.method == "POST" and path.startswith("/gradio_api/call/"):
            name = path.rsplit("/", 1)[-1]
            if name == "handle_start_button":
                self.start_data = json.loads(request.content)["data"]
            if name == "monitor_job":
                self.monitor_data = json.loads(request.content)["data"]
            return httpx.Response(200, json={"event_id": f"ev-{name}"})
        if path == "/gradio_api/call/check_for_current_job_and_monitor/ev-check_for_current_job_and_monitor":
            return httpx.Response(200, text=sse(("complete", [self.current, None, None, None, "", "", None, ""])))
        if path == "/gradio_api/call/handle_start_button/ev-handle_start_button":
            return httpx.Response(200, text=sse(("complete", [None, self.job_id, None, "",
                                                              f"Job added to queue. Job ID: {self.job_id}",
                                                              None, None, None, None])))
        if path == "/gradio_api/call/monitor_job/ev-monitor_job":
            events = [("generating", [v, None, None, d, h, None, None]) for v, d, h in self.monitor]
            if events:
                events[-1] = ("complete", events[-1][1])
            return httpx.Response(200, text=sse(*events))
        if path.startswith("/gradio_api/file="):
            return httpx.Response(200, content=b"MP4:" + path.split("=", 1)[1].encode())
        return httpx.Response(404)


class StudioContractTests(unittest.TestCase):
    def test_heavy_shape_is_accepted(self):
        self.assertEqual(len(studio_contract(heavy_info())), 29)

    def test_any_moved_or_extra_input_is_refused(self):
        moved = heavy_info()
        params = moved["/handle_start_button"]["parameters"]
        params[5], params[6] = params[6], params[5]
        with self.assertRaisesRegex(FramePackNeedsAdapter, "input 5"):
            studio_contract(moved)
        lora = heavy_info()
        lora["/handle_start_button"]["parameters"].append({"label": "my_lora", "parameter_has_default": True})
        with self.assertRaisesRegex(FramePackNeedsAdapter, "30 inputs"):
            studio_contract(lora)

    def test_missing_original_mode_or_monitor_is_refused(self):
        no_original = heavy_info()
        no_original["/handle_start_button"]["parameters"][0]["type"]["enum"] = ["F1", "Video"]
        with self.assertRaisesRegex(FramePackNeedsAdapter, "Original"):
            studio_contract(no_original)
        no_monitor = heavy_info()
        del no_monitor["/monitor_job"]
        with self.assertRaisesRegex(FramePackNeedsAdapter, "monitor_job"):
            studio_contract(no_monitor)
        no_current = heavy_info()
        del no_current["/check_for_current_job_and_monitor"]
        with self.assertRaisesRegex(FramePackNeedsAdapter, "busy"):
            studio_contract(no_current)

    def test_arguments_are_original_i2v_with_defaults_kept(self):
        image = {"path": "/tmp/x.png", "meta": {"_type": "gradio.FileData"}}
        data = studio_arguments(studio_contract(heavy_info()), image=image, prompt="she waves",
                                negative="blurry", seed=42, seconds=3.0)
        self.assertEqual(len(data), 29)
        self.assertEqual(data[0], "Original")
        self.assertIs(data[1], image)
        self.assertIsNone(data[2])  # no video input
        self.assertIsNone(data[3])  # no end frame
        self.assertEqual((data[5], data[6], data[7], data[8], data[9]), ("she waves", "blurry", 42, False, 3.0))
        self.assertEqual(data[24], [])  # no LoRAs
        for position in (4, *range(10, 24), 25, 26, 27, 28):
            self.assertEqual(data[position], DEFAULTS[position], STUDIO_INPUTS[position])

    def test_job_id_and_video_ownership(self):
        self.assertEqual(studio_job_id([None, JOB]), JOB)
        self.assertEqual(studio_job_id([None, {"__type__": "update", "value": JOB}]), JOB)
        self.assertIsNone(studio_job_id([None, "Job added"]))
        self.assertIsNone(studio_job_id([None, None]))
        self.assertEqual(studio_video_for([video(f"/o/{JOB}_37.mp4")], JOB), f"/o/{JOB}_37.mp4")
        self.assertIsNone(studio_video_for([video(f"/o/{OTHER}_37.mp4")], JOB))
        self.assertIsNone(studio_video_for([video("/o/clip.mp4")], JOB))

    def test_selection_is_explicit(self):
        self.assertIsInstance(framepack_provider(video_settings(framepack_api_name="/handle_start_button")),
                              FramePackStudioProvider)
        self.assertNotIsInstance(framepack_provider(video_settings(framepack_api_name="/process")),
                                 FramePackStudioProvider)
        self.assertIsInstance(framepack_provider(video_settings(framepack_api_name="/process")), FramePackProvider)


class StudioRunTests(unittest.IsolatedAsyncioTestCase):
    async def run_studio(self, fake, **settings):
        original = httpx.AsyncClient
        progress = []

        async def on_progress(percent, stage):
            progress.append(percent)

        with patch("lumen.video_providers.httpx.AsyncClient",
                   side_effect=lambda **kw: original(transport=httpx.MockTransport(fake), **kw)):
            result = await FramePackStudioProvider(video_settings(framepack_api_name="/handle_start_button",
                                                                  **settings)).generate(
                b"PNG", "image/png", "she waves", seconds=3.0, negative="child", on_progress=on_progress)
        return result, progress

    async def test_one_job_end_to_end(self):
        fake = FakeStudio()
        result, progress = await self.run_studio(fake)
        self.assertEqual(result["bytes"], f"MP4:/fps/outputs/{JOB}_37.mp4".encode())
        self.assertEqual(result["provider"], "framepack-studio")
        self.assertEqual(result["model"], "framepack-studio:Original")
        self.assertEqual(result["job_id"], JOB)
        self.assertEqual(fake.start_data[0], "Original")
        self.assertEqual(fake.start_data[1]["path"], "/tmp/gradio/abc/lumen-source.png")
        self.assertEqual(fake.start_data[9], 3.0)
        self.assertEqual(fake.monitor_data, [JOB])
        self.assertIn(40, progress)
        posts = [p for m, p in fake.calls if m == "POST"]
        self.assertEqual(posts, ["/gradio_api/call/check_for_current_job_and_monitor", "/gradio_api/upload",
                                 "/gradio_api/call/handle_start_button", "/gradio_api/call/monitor_job"])

    async def test_busy_studio_is_refused_before_upload(self):
        fake = FakeStudio(current=OTHER)
        with self.assertRaisesRegex(ImageProviderError, "busy"):
            await self.run_studio(fake)
        self.assertNotIn(("POST", "/gradio_api/upload"), fake.calls)
        self.assertIsNone(fake.start_data)

    async def test_contract_mismatch_never_uploads_or_queues(self):
        info = heavy_info()
        info["/handle_start_button"]["parameters"].pop()
        fake = FakeStudio(info=info)
        with self.assertRaises(FramePackNeedsAdapter):
            await self.run_studio(fake)
        self.assertEqual([m for m, _ in fake.calls], ["GET"])

    async def test_another_jobs_video_is_never_returned(self):
        fake = FakeStudio(monitor=[(video(f"/fps/outputs/{OTHER}_37.mp4"), "Completed", "")])
        with self.assertRaisesRegex(ImageProviderError, "without this job's video"):
            await self.run_studio(fake)
        self.assertFalse(any(p.startswith("/gradio_api/file=") for _, p in fake.calls))

    async def test_switch_to_another_job_fails_closed(self):
        fake = FakeStudio(monitor=[(video(f"/fps/outputs/{JOB}_9.mp4"), "Sampling", "<div>30%</div>"),
                                   (video(f"/fps/outputs/{JOB}_9.mp4"), "Switching to current job...", ""),
                                   (video(f"/fps/outputs/{OTHER}_37.mp4"), "Completed", "")])
        with self.assertRaisesRegex(ImageProviderError, "switched to another job"):
            await self.run_studio(fake)

    async def test_error_and_cancel_are_reported(self):
        for desc in ("Error: CUDA out of memory", "Job cancelled"):
            fake = FakeStudio(monitor=[(None, desc, "")])
            with self.assertRaises(ImageProviderError, msg=desc):
                await self.run_studio(fake)

    async def test_missing_job_id_stops_before_monitoring(self):
        fake = FakeStudio(job_id="")
        with self.assertRaisesRegex(ImageProviderError, "job id"):
            await self.run_studio(fake)
        self.assertNotIn(("POST", "/gradio_api/call/monitor_job"), fake.calls)

    async def test_timeout_leaves_the_job_and_calls_no_stop(self):
        fake = FakeStudio(monitor=[(None, "Waiting in queue. Position: 1", "")] * 3)
        # The clock jumps past the deadline only once FP-Studio is being monitored for our job.
        clock = lambda: 10_000.0 if hasattr(fake, "monitor_data") else 0.0  # noqa: E731
        with patch("lumen.video_providers.time.monotonic", side_effect=clock):
            with self.assertRaisesRegex(ImageProviderError, f"did not finish in time. Its job {JOB}"):
                await self.run_studio(fake)
        self.assertFalse(any("end_process" in p for _, p in fake.calls))


class StudioCheckScriptTests(unittest.TestCase):
    def test_check_script_accepts_heavy_shape_read_only(self):
        from tests.test_media_generation import FramePackCheckScriptTests
        runner = FramePackCheckScriptTests()
        result = runner.run_check(heavy_info(), api_name="/handle_start_button")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("adapter contract: OK", result.stdout)
        self.assertIn(" 0 Generation Type: 'Original'", result.stdout)

    def test_check_script_refuses_changed_shape(self):
        from tests.test_media_generation import FramePackCheckScriptTests
        info = heavy_info()
        info["/handle_start_button"]["parameters"][0]["type"]["enum"] = ["F1"]
        result = FramePackCheckScriptTests().run_check(info, api_name="/handle_start_button")
        self.assertEqual(result.returncode, 1)
        self.assertIn("FAILS", result.stdout)


class StudioCanaryScriptTests(unittest.TestCase):
    def test_canary_refuses_without_run_gpu_and_long_clips(self):
        import subprocess, sys
        from pathlib import Path
        script = Path(__file__).resolve().parents[2] / "scripts" / "canary-framepack-studio.py"
        base = [sys.executable, str(script), "--url", "http://127.0.0.1:9", "--image", "x.png", "--out", "/tmp/x"]
        result = subprocess.run(base, capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 2)
        self.assertIn("--run-gpu", result.stdout)
        result = subprocess.run([*base, "--run-gpu", "--seconds", "10"], capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 2)


class StudioCanaryRunTests(unittest.IsolatedAsyncioTestCase):
    async def test_canary_end_to_end_against_fake_studio(self):
        import importlib.util, io, tempfile
        from contextlib import redirect_stdout
        from pathlib import Path
        from types import SimpleNamespace
        script = Path(__file__).resolve().parents[2] / "scripts" / "canary-framepack-studio.py"
        spec = importlib.util.spec_from_file_location("fps_canary", script)
        canary = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(canary)
        fake = FakeStudio()
        freed = []

        def handler(request):
            if request.url.host == "comfy.test":
                freed.append(request.url.path)
                return httpx.Response(200, json={})
            if request.url.path.startswith("/gradio_api/file="):
                fake.calls.append(("GET", request.url.path))
                return httpx.Response(200, content=b"\x00\x00\x00\x18ftypmp42" + b"0" * 64)
            return fake(request)

        original = httpx.AsyncClient
        with tempfile.TemporaryDirectory() as tmp:
            image = Path(tmp) / "still.png"
            image.write_bytes(b"\x89PNG\r\n\x1a\n" + b"0" * 32)
            args = SimpleNamespace(url="http://127.0.0.1:17863", image=str(image), seconds=3.0, out=tmp,
                                   prompt="waves", negative="", timeout=60, comfy_url="http://comfy.test:18188")
            out = io.StringIO()
            with patch("lumen.video_providers.httpx.AsyncClient",
                       side_effect=lambda **kw: original(transport=httpx.MockTransport(handler), **kw)), \
                    redirect_stdout(out):
                code = await canary.run(args)
            summary = json.loads(out.getvalue())
            self.assertEqual(code, 0, out.getvalue())
            self.assertEqual(summary["result"], "PASS")
            self.assertEqual(summary["fp_studio_job_id"], JOB)
            self.assertTrue((Path(tmp) / "lumen-fps-canary.mp4").exists())
        self.assertEqual(freed, ["/free"])
        self.assertEqual(fake.start_data[0], "Original")
        self.assertFalse(any("end_process" in p for _, p in fake.calls))


class OldFramePackTimeoutTests(unittest.IsolatedAsyncioTestCase):
    async def test_old_provider_timeout_calls_no_global_stop(self):
        from tests.test_media_generation import FRAMEPACK_PARAMETERS
        calls = []

        def handler(request):
            calls.append(request.url.path)
            if request.url.path == "/gradio_api/info":
                return httpx.Response(200, json={"named_endpoints": {"/process": {"parameters": FRAMEPACK_PARAMETERS}}})
            if request.url.path == "/gradio_api/upload":
                return httpx.Response(200, json=["/tmp/s.png"])
            if request.url.path == "/gradio_api/call/process":
                return httpx.Response(200, json={"event_id": "e"})
            if request.url.path == "/gradio_api/call/process/e":
                return httpx.Response(200, text=sse(("generating", [None, None, "", ""])))
            return httpx.Response(404)

        original = httpx.AsyncClient
        with patch("lumen.video_providers.httpx.AsyncClient",
                   side_effect=lambda **kw: original(transport=httpx.MockTransport(handler), **kw)), \
                patch("lumen.video_providers.time.monotonic", side_effect=[0.0] + [10_000.0] * 20):
            with self.assertRaises(ImageProviderError):
                await FramePackProvider(video_settings()).generate(b"PNG", "image/png", "p", seconds=3.0)
        self.assertFalse(any("end_process" in p for p in calls))


if __name__ == "__main__":
    unittest.main()

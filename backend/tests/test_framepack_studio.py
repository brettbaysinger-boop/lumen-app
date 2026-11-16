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
                                   studio_contract, studio_job_id, studio_output)
from tests.test_media_generation import video_settings

JOB = "1b4e28ba-2fa1-41d2-883f-0016d3cca427"
OTHER = "6fa459ea-ee8a-4ca4-894e-db77e160355e"
# FP-Studio's worker names outputs after its own run stamp (generate_timestamp()), not the queue uuid.
RUN = "261116_095453_817_1084"  # the stamp of the owner's 2026-11-16 hardware canary output on Heavy
RUN2 = "261116_101500_002_77"
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
    def out(*pairs):
        return [{"label": label, "component": component} for label, component in pairs]

    # Gradio /info keeps label and component apart (owner output "Finished Frames Video" = label
    # "Finished Frames" + component "Video"); labels match FramePack-Studio's modules/interface.py.
    return {
        "/handle_start_button": {"parameters": start, "returns": out(
            ("Finished Frames", "Video"), ("Current Job ID", "Textbox"), ("Next Latents", "Image"),
            ("value_193", "Markdown"), ("value_194", "Html"), ("Job Queue", "Dataframe"), ("value_5", "Markdown"),
            ("Seed", "Number"), ("value_199", "Markdown"))},
        "/monitor_job": {"parameters": out(("Current Job ID", "Textbox")), "returns": out(
            ("Finished Frames", "Video"), ("Next Latents", "Image"), ("Next Latents (Top Display)", "Image"),
            ("value", "Markdown"), ("value", "Html"))},
        "/check_for_current_job_and_monitor": {"parameters": [], "returns": out(
            ("Current Job ID", "Textbox"), ("Finished Frames", "Video"), ("Next Latents", "Image"),
            ("Next Latents (Top Display)", "Image"), ("value", "Markdown"), ("value", "Html"),
            ("Job Queue", "Dataframe"), ("value", "Markdown"))},
        "/end_process_with_update": {"parameters": [], "returns": []},
        "/partial": {"parameters": [{"label": f"p{i}"} for i in range(36)], "returns": []},
    }


def heavy_config(state_slots=(29,)):
    """Gradio /config for the same events: /info hides FP-Studio's trailing gr.State (lora_names_states),
    but /handle_start_button's event has 30 inputs (verified on Gradio 5.25.2 with FP-Studio's wiring)."""
    components, inputs = [], []
    kinds = ["radio", "image", "video", "image", "slider", "textbox", "textbox", "number", "checkbox"] + ["x"] * 20
    total = len(kinds) + len(state_slots)
    k = iter(kinds)
    for position in range(total):
        kind = "state" if position in state_slots else next(k)
        components.append({"id": 100 + position, "type": kind})
        inputs.append(100 + position)
    return {"components": components, "dependencies": [
        {"api_name": "update_button_before_processing", "inputs": inputs},
        {"api_name": "handle_start_button", "inputs": inputs},
        {"api_name": "monitor_job", "inputs": [200]},
        {"api_name": "check_for_current_job_and_monitor", "inputs": []}]}


def sse(*events):
    return "".join(f"event: {name}\ndata: {json.dumps(values)}\n\n" for name, values in events)


def video(path):
    return {"video": {"path": path, "meta": {"_type": "gradio.FileData"}}, "subtitles": None}


class FakeStudio:
    """A FramePack-Studio Gradio app. ``monitor`` is the list of monitor_job updates to stream."""

    def __init__(self, *, info=None, current=None, monitor=None, job_id=JOB, config=None, start_error=None):
        self.info = info or heavy_info()
        self.config = config if config is not None else heavy_config()
        self.start_error = start_error
        self.current = current
        self.job_id = job_id
        self.monitor = monitor if monitor is not None else [
            (None, "Waiting in queue. Position: 1", ""),
            (video(f"/fps/outputs/{RUN}_9.mp4"), "Sampling", "<div>40%</div>"),
            (video(f"/fps/outputs/{RUN}_19.mp4"), "Completed", "<div>100%</div>"),
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
        if path == "/config":
            return httpx.Response(200, json=self.config) if self.config else httpx.Response(404)
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
            needed = len(self.config["dependencies"][1]["inputs"]) if self.config else 29
            if self.start_error is not None or len(self.start_data) < needed:  # Gradio's validate_inputs
                return httpx.Response(200, text="event: error\ndata: " + (self.start_error or "null") + "\n\n")
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

    def test_regression_real_split_label_and_component(self):
        """2026-11-16 hardware canary failed closed: the contract wanted label "Finished Frames Video",
        but Gradio reports label "Finished Frames" with component "Video"."""
        info = heavy_info()
        self.assertEqual(info["/handle_start_button"]["returns"][0], {"label": "Finished Frames", "component": "Video"})
        self.assertEqual(len(studio_contract(info)), 29)
        for endpoint in ("/handle_start_button", "/monitor_job"):
            wrong = heavy_info()
            wrong[endpoint]["returns"][0] = {"label": "Finished Frames", "component": "Image"}
            with self.assertRaisesRegex(FramePackNeedsAdapter, "Finished Frames"):
                studio_contract(wrong)
        combined = heavy_info()
        combined["/handle_start_button"]["returns"][0] = {"label": "Finished Frames Video", "component": "Video"}
        with self.assertRaisesRegex(FramePackNeedsAdapter, "got 'Finished Frames Video'/'Video'"):
            studio_contract(combined)
        wrong_id = heavy_info()
        wrong_id["/check_for_current_job_and_monitor"]["returns"][0]["component"] = "Markdown"
        with self.assertRaisesRegex(FramePackNeedsAdapter, "busy"):
            studio_contract(wrong_id)

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
        self.assertEqual(studio_output([video(f"/o/{RUN}_19.mp4")]), (f"/o/{RUN}_19.mp4", RUN))
        self.assertEqual(studio_output([video("C:\\fps\\outputs\\261116_095453_817_9_9.mp4")])[1],
                         "261116_095453_817_9")
        for name in (f"{JOB}_19.mp4", "clip.mp4", f"{RUN}_19.webm", f"{RUN}_combined.mp4", f"x{RUN}_19.mp4"):
            self.assertIsNone(studio_output([video(f"/o/{name}")]), name)

    def test_selection_is_explicit(self):
        self.assertIsInstance(framepack_provider(video_settings(framepack_api_name="/handle_start_button")),
                              FramePackStudioProvider)
        self.assertNotIsInstance(framepack_provider(video_settings(framepack_api_name="/process")),
                                 FramePackStudioProvider)
        self.assertIsInstance(framepack_provider(video_settings(framepack_api_name="/process")), FramePackProvider)


class StudioHiddenStateTests(unittest.TestCase):
    def test_state_slot_comes_from_config(self):
        from lumen.video_providers import studio_hidden_state_slots, with_state_slots
        self.assertEqual(studio_hidden_state_slots(heavy_config()), [29])
        self.assertEqual(len(with_state_slots(list(range(29)), [29])), 30)
        self.assertIsNone(with_state_slots(list(range(29)), [29])[29])

    def test_unreadable_or_changed_config_is_refused(self):
        from lumen.video_providers import studio_hidden_state_slots
        with self.assertRaisesRegex(FramePackNeedsAdapter, "/config is not readable"):
            studio_hidden_state_slots(None)
        with self.assertRaisesRegex(FramePackNeedsAdapter, "31 inputs"):
            studio_hidden_state_slots(heavy_config(state_slots=(29, 30)) | {"components": [
                {"id": 100 + i, "type": "x"} for i in range(31)]})

    def test_sse_error_detail_is_short_and_redacted(self):
        from lumen.video_providers import sse_error_detail
        self.assertIn("data: null", sse_error_detail("/handle_start_button", "null"))
        detail = sse_error_detail("/handle_start_button",
                                  json.dumps("ValueError at /home/brett/FramePack-Studio/modules/x.py: bad " + "x" * 900))
        self.assertTrue(detail.startswith("/handle_start_button returned event:error: ValueError at <path>"))
        self.assertNotIn("/home/brett", detail)
        self.assertLess(len(detail), 360)


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
        self.assertEqual(result["bytes"], f"MP4:/fps/outputs/{RUN}_19.mp4".encode())
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

    async def test_sends_thirty_values_with_the_hidden_state_slot(self):
        fake = FakeStudio()
        await self.run_studio(fake)
        self.assertEqual(len(fake.start_data), 30)
        self.assertIsNone(fake.start_data[29])
        self.assertEqual(fake.start_data[28], DEFAULTS[28])

    async def test_regression_29_values_reproduce_the_hardware_error_with_details(self):
        fake = FakeStudio(start_error=json.dumps("needed: 30, got: 29"))
        provider = FramePackStudioProvider(video_settings(framepack_api_name="/handle_start_button"))
        original = httpx.AsyncClient
        with patch("lumen.video_providers.httpx.AsyncClient",
                   side_effect=lambda **kw: original(transport=httpx.MockTransport(fake), **kw)):
            with self.assertRaisesRegex(ImageProviderError,
                                        "/handle_start_button returned event:error: needed: 30, got: 29"):
                await provider.generate(b"PNG", "image/png", "p", seconds=3.0)
        self.assertEqual(provider.stage, "start_queue")
        self.assertFalse(any("monitor_job" in p for _, p in fake.calls))

    async def test_regression_hardware_completed_without_result(self):
        """2026-11-16 hardware run: thousands of repeated 10%/37% monitor updates, then Completed with no
        video. In FP-Studio a worker exception is pushed as ('error', ...), ignored by the queue loop, then
        ('end', None) marks the job Completed with job.result None."""
        progress_html = ["<div class='progress'>10%</div>", "<div class='progress'>37%</div>"]
        updates = [(None, "Sampling 1/25 (section 1)", progress_html[i % 2]) for i in range(2000)]
        fake = FakeStudio(monitor=[*updates, (None, "Completed", "<div>100%</div>")])
        with self.assertRaisesRegex(ImageProviderError,
                                    f"marked job {JOB} Completed without a result file.*last progress: Sampling 1/25"):
            await self.run_studio(fake)
        self.assertFalse(any(p.startswith("/gradio_api/file=") for _, p in fake.calls))

    async def test_identical_progress_is_reported_once_per_change(self):
        same = [(None, "Sampling", "<div>10%</div>")] * 500 + [(None, "Sampling", "<div>37%</div>")] * 500
        fake = FakeStudio(monitor=[*same, (video(f"/fps/outputs/{RUN}_19.mp4"), "Completed", "")])
        _, progress = await self.run_studio(fake)
        self.assertEqual(progress, [5, 10, 37, 97])  # start, the two changes, saving

    async def test_full_gradio_video_payload_shape_is_accepted(self):
        payload = {"video": {"path": f"/tmp/gradio/3f9c/{RUN}_19.mp4", "url": f"http://127.0.0.1:7863/gradio_api/file=/tmp/gradio/3f9c/{RUN}_19.mp4",
                             "size": 812345, "orig_name": f"{RUN}_19.mp4", "mime_type": None, "is_stream": False,
                             "meta": {"_type": "gradio.FileData"}}, "subtitles": None}
        fake = FakeStudio(monitor=[(payload, "Completed", "")])
        result, _ = await self.run_studio(fake)
        self.assertEqual(result["bytes"], f"MP4:/tmp/gradio/3f9c/{RUN}_19.mp4".encode())

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

    async def test_another_runs_video_is_never_returned(self):
        fake = FakeStudio(monitor=[(video(f"/fps/outputs/{RUN}_9.mp4"), "Sampling", "<div>40%</div>"),
                                   (video(f"/fps/outputs/{RUN2}_19.mp4"), "Completed", "")])
        with self.assertRaisesRegex(ImageProviderError, f"two different runs for job {JOB}"):
            await self.run_studio(fake)
        self.assertFalse(any(p.startswith("/gradio_api/file=") for _, p in fake.calls))

    async def test_names_that_are_not_fp_studio_outputs_are_ignored(self):
        for name in (f"{OTHER}_19.mp4", "clip.mp4", "../../etc/passwd"):
            fake = FakeStudio(monitor=[(video(f"/fps/outputs/{name}"), "Completed", "")])
            with self.assertRaisesRegex(ImageProviderError, "Completed without a result file", msg=name):
                await self.run_studio(fake)
            self.assertFalse(any(p.startswith("/gradio_api/file=") for _, p in fake.calls))

    async def test_regression_hardware_run_3_timestamp_output_is_this_jobs_result(self):
        """2026-11-16 hardware canary (758c2b3): the job ran, FP-Studio wrote
        outputs/261116_095453_817_1084_19.mp4 and the monitor reported it at Completed, but Lumen
        required a "<uuid>_" prefix and failed. monitor_job(our id) yields that job's own job.result."""
        heavy = "/data/ai-media-studio/FP-Studio/outputs"
        updates = [(None, "Sampling", f"<div>{10 if i % 2 else 37}%</div>") for i in range(3000)]
        fake = FakeStudio(monitor=[(None, "Waiting in queue. Position: 1", ""), *updates,
                                   (video(f"{heavy}/{RUN}_9.mp4"), "Sampling", "<div>60%</div>"),
                                   (video(f"{heavy}/{RUN}_19.mp4"), "Completed", "<div>100%</div>")])
        result, progress = await self.run_studio(fake)
        self.assertEqual(result["bytes"], f"MP4:{heavy}/{RUN}_19.mp4".encode())
        self.assertEqual(result["job_id"], JOB)
        self.assertEqual(progress, [5, 37, 60, 97])  # forward movement only, never every poll

    async def test_switch_to_another_job_fails_closed(self):
        fake = FakeStudio(monitor=[(video(f"/fps/outputs/{RUN}_9.mp4"), "Sampling", "<div>30%</div>"),
                                   (video(f"/fps/outputs/{RUN}_9.mp4"), "Switching to current job...", ""),
                                   (video(f"/fps/outputs/{RUN2}_19.mp4"), "Completed", "")])
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
        result = subprocess.run(base, capture_output=True, text=True, timeout=30)  # read-only mode
        self.assertEqual(result.returncode, 1)
        summary = json.loads(result.stdout)
        self.assertEqual((summary["result"], summary["stage"], summary["gpu_work"]), ("FAIL", "contract", "none"))
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
                                   prompt="waves", negative="", timeout=60, comfy_url="http://comfy.test:18188",
                                   run_gpu=True)
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


class StudioCanaryDryRunTests(unittest.IsolatedAsyncioTestCase):
    async def test_without_run_gpu_prints_the_30_values_and_queues_nothing(self):
        import importlib.util, io
        from contextlib import redirect_stdout
        from pathlib import Path
        from types import SimpleNamespace
        script = Path(__file__).resolve().parents[2] / "scripts" / "canary-framepack-studio.py"
        spec = importlib.util.spec_from_file_location("fps_canary3", script)
        canary = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(canary)
        fake = FakeStudio()
        original = httpx.AsyncClient
        out = io.StringIO()
        args = SimpleNamespace(url="http://127.0.0.1:17863", image="unused.png", seconds=3.0, out="/tmp/x",
                               prompt="p", negative="", timeout=60, comfy_url="", run_gpu=False)
        with patch("lumen.video_providers.httpx.AsyncClient",
                   side_effect=lambda **kw: original(transport=httpx.MockTransport(fake), **kw)), \
                patch("httpx.AsyncClient", side_effect=lambda **kw: original(transport=httpx.MockTransport(fake), **kw)), \
                redirect_stdout(out):
            code = await canary.run(args)
        summary = json.loads(out.getvalue())
        self.assertEqual(code, 0)
        self.assertEqual((summary["result"], summary["values_sent"], summary["hidden_state_slots"]),
                         ("CONTRACT OK", 30, [29]))
        self.assertEqual(summary["values"][0], "Original")
        self.assertEqual({m for m, _ in fake.calls}, {"GET"})


class StudioCanaryReasonTests(unittest.IsolatedAsyncioTestCase):
    async def test_contract_failure_prints_the_exact_reason_and_queues_nothing(self):
        import importlib.util, io
        from contextlib import redirect_stdout
        from pathlib import Path
        from types import SimpleNamespace
        script = Path(__file__).resolve().parents[2] / "scripts" / "canary-framepack-studio.py"
        spec = importlib.util.spec_from_file_location("fps_canary2", script)
        canary = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(canary)
        info = heavy_info()
        info["/monitor_job"]["returns"][0] = {"label": "Finished Frames Video", "component": "Video"}
        fake = FakeStudio(info=info)
        original = httpx.AsyncClient
        out = io.StringIO()
        args = SimpleNamespace(url="http://127.0.0.1:17863", image="unused.png", seconds=3.0, out="/tmp/x",
                               prompt="p", negative="", timeout=60, comfy_url="")
        with patch("lumen.video_providers.httpx.AsyncClient",
                   side_effect=lambda **kw: original(transport=httpx.MockTransport(fake), **kw)), \
                patch("httpx.AsyncClient", side_effect=lambda **kw: original(transport=httpx.MockTransport(fake), **kw)), \
                redirect_stdout(out):
            code = await canary.run(args)
        summary = json.loads(out.getvalue())
        self.assertEqual(code, 1)
        self.assertIn("FramePackNeedsAdapter: /monitor_job does not return the video first", summary["reason"])
        self.assertEqual([m for m, _ in fake.calls], ["GET"])


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


class StudioJobOutputScriptTests(unittest.TestCase):
    """scripts/framepack-studio-job-output.py: read-only recovery of ONE job's recorded output."""

    def setUp(self):
        import importlib.util, os, tempfile, time
        from pathlib import Path
        script = Path(__file__).resolve().parents[2] / "scripts" / "framepack-studio-job-output.py"
        spec = importlib.util.spec_from_file_location("fps_job_output", script)
        self.mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.mod)
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "outputs").mkdir()
        self.started = time.time() - 600
        self.file = self.root / "outputs" / f"{RUN}_19.mp4"
        self.file.write_bytes(b"\x00\x00\x00\x18ftypmp42" + b"0" * 64)
        os.utime(self.file, (self.started + 500, self.started + 500))
        self.queue = {JOB: {"id": JOB, "status": "completed", "error": None, "result": str(self.file),
                            "started_at": self.started, "completed_at": self.started + 510},
                      OTHER: {"id": OTHER, "status": "completed", "error": None, "result": None,
                              "started_at": self.started - 900, "completed_at": self.started - 800}}

    def tearDown(self):
        self.tmp.cleanup()

    def run_script(self, *extra, job=JOB):
        import io
        from contextlib import redirect_stdout
        (self.root / "queue.json").write_text(json.dumps(self.queue))
        out = io.StringIO()
        with redirect_stdout(out):
            code = self.mod.main(["--queue-json", str(self.root / "queue.json"), "--job-id", job, *extra])
        return code, json.loads(out.getvalue())

    def test_timestamp_named_result_of_this_job_matches_and_copies(self):
        code, summary = self.run_script("--copy-to", str(self.root / "copy"))
        self.assertEqual((code, summary["result"]), (0, "MATCH"), summary)
        self.assertEqual(summary["file"], str(self.file.resolve()))
        self.assertEqual((self.root / "copy" / "lumen-fps-canary.mp4").read_bytes(), self.file.read_bytes())

    def test_refusals_never_guess_from_the_folder(self):
        cases = {
            "other job with no result": dict(job=OTHER),
            "unknown job": dict(job="00000000-0000-4000-8000-000000000000"),
        }
        for label, kw in cases.items():
            code, summary = self.run_script(**kw)
            self.assertEqual((code, summary["result"]), (1, "REFUSED"), label)
        for label, change in {"failed": {"status": "failed"}, "error": {"error": "boom"},
                              "outside outputs": {"result": "/etc/hosts"},
                              "uuid name": {"result": str(self.root / "outputs" / f"{JOB}_19.mp4")},
                              "before the run": {"started_at": self.started + 2000,
                                                 "completed_at": self.started + 2100}}.items():
            saved = dict(self.queue[JOB])
            self.queue[JOB].update(change)
            code, summary = self.run_script()
            self.assertEqual((code, summary["result"]), (1, "REFUSED"), label)
            self.queue[JOB] = saved
        self.assertFalse((self.root / "copy").exists())

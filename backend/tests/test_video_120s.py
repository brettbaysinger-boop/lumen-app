"""Clips of 1 to 120 seconds (FramePack's own maximum): parsing, limits, render budget, FP-Studio's real
maximum, large files and the forward-only migration. Every service is faked."""
import json
import subprocess
import sys
import threading
import unittest
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx
from pydantic import ValidationError

from lumen import media_jobs as mj
from lumen import media_worker as mw
from lumen.config import Settings
from lumen.images import ImageProviderError
from lumen.video_providers import FramePackStudioProvider, studio_max_seconds
from tests.test_framepack_studio import FakeStudio as FakeGradio, heavy_config, heavy_info
from tests.test_media_generation import PlanTests, video_settings
from tests.test_media_worker import FP_JOB, FakeStudio, JobsDb, WorkerTests, settings

REPO = Path(__file__).resolve().parents[2]


def config_with_length(maximum):
    config = heavy_config()
    config["components"][9]["props"] = {"label": "Video Length (Seconds)", "minimum": 1, "maximum": maximum}
    return config


class LengthParsingTests(unittest.TestCase):
    def test_numbers_and_words(self):
        for text, seconds in (("make a 3-second video", 3), ("a 30 second clip", 30), ("120 seconds please", 120),
                              ("make a 2 minute video", 120), ("a 1.5 min clip", 90), ("two minute video", 120),
                              ("a two-minute video of the sea", 120), ("make a one minute video", 60),
                              ("a minute long clip", 60), ("a minute-long video", 60), ("half a minute", 30),
                              ("thirty seconds of rain", 30), ("a minute and a half video", 90), ("two and a half minutes of snow", 150),
                              ("make a five minute video", 300), ("several minutes of waves", 300),
                              ("make a video of a fox", None), ("a 121 second video", 121)):
            self.assertEqual(mj.requested_seconds(text), seconds, text)


class LongClipPlanTests(PlanTests):
    """Only the new tests run here (the inherited ones are skipped below)."""

    async def test_default_stays_five_seconds(self):
        result = await self.plan("make a video of a fox", settings=video_settings(video_max_seconds=120.0))
        self.assertEqual(result.plan.seconds, 5.0)

    async def test_explicit_30_60_120_are_planned(self):
        for text, seconds in (("make a 30 second video of a fox", 30), ("make a 60-second video of a fox", 60),
                              ("make a two minute video of a fox", 120), ("make a 120 second video of a fox", 120)):
            result = await self.plan(text, settings=video_settings(video_max_seconds=120.0))
            self.assertEqual(result.plan.seconds, seconds, text)
            self.assertIn(f"{seconds:g}-second video", result.reply)
            self.assertIn("many hours", result.reply)          # rendering time, never an ETA

    async def test_more_than_120_is_refused_and_nothing_is_shortened(self):
        for text in ("make a 121 second video of a fox", "make a 5 minute video of a fox",
                     "make a three minute video of a fox"):
            result = await self.plan(text, settings=video_settings(video_max_seconds=120.0))
            self.assertIsNone(result.plan, text)
            self.assertIn("up to 120 seconds", result.reply)
        self.assertEqual(self.db.calls, [])

    async def test_until_the_owner_raises_it_the_limit_is_still_10(self):
        result = await self.plan("make a 30 second video of a fox")
        self.assertIsNone(result.plan)
        self.assertIn("up to 10 seconds", result.reply)


for _name in [n for n in dir(PlanTests) if n.startswith("test_")]:
    setattr(LongClipPlanTests, _name, None)   # do not run the inherited tests twice


class SettingsBoundsTests(unittest.TestCase):
    def make(self, **env):
        return Settings(_env_file=None, supabase_url="http://s", supabase_service_role_key="k", **env)

    def test_defaults_and_bounds(self):
        base = self.make()
        self.assertEqual((base.video_default_seconds, base.video_max_seconds), (5.0, 10.0))
        self.assertEqual(self.make(video_max_seconds=120).video_max_seconds, 120.0)
        with self.assertRaises(ValidationError):
            self.make(video_max_seconds=121)
        with self.assertRaises(ValidationError):
            self.make(video_render_budget_seconds=24 * 3600 + 1)

    def test_render_budget_grows_with_length_and_stops_at_24_hours(self):
        base = self.make()
        self.assertEqual(mj.render_budget_seconds(base, 3), 4 * 3600)       # short clips: as before
        self.assertEqual(mj.render_budget_seconds(base, 10), 4 * 3600)
        self.assertEqual(mj.render_budget_seconds(base, 60), 10 * 3600)
        self.assertEqual(mj.render_budget_seconds(base, 120), 20 * 3600)
        self.assertEqual(mj.render_budget_seconds(self.make(video_render_seconds_per_clip_second=3600), 120), 24 * 3600)


class LongClipWorkerTests(unittest.IsolatedAsyncioTestCase):
    run_worker = WorkerTests.run_worker

    async def test_a_120_second_job_gets_a_20_hour_deadline_and_the_full_length_is_sent(self):
        db, studio = JobsDb(duration_seconds=120.0), FakeStudio()
        await self.run_worker(db, studio, video_max_seconds=120.0)
        self.assertEqual(studio.submitted[0][3], 120.0)
        started = datetime.fromisoformat(db.job["started_at"])
        deadline = datetime.fromisoformat(db.job["deadline_at"])
        self.assertEqual(round((deadline - started).total_seconds()), 20 * 3600)
        self.assertEqual(db.job["provider_job_id"], FP_JOB)

    async def test_over_budget_names_the_jobs_own_budget(self):
        now = datetime.now(timezone.utc)
        db = JobsDb(status="running", provider="framepack-studio", provider_job_id=FP_JOB, duration_seconds=120.0,
                    started_at=(now - timedelta(hours=21)).isoformat(),
                    deadline_at=(now - timedelta(hours=1)).isoformat())
        await self.run_worker(db, FakeStudio({"state": "running", "percent": 90}))
        self.assertEqual(db.job["status"], "failed")
        self.assertIn("within 20 hours", db.job["error"])
        self.assertIn("Nothing was cancelled", db.job["error"])

    async def test_a_file_over_the_limit_is_refused_whole_never_cut(self):
        reporter = AsyncMock()
        plan = mw.plan_from_row(JobsDb(duration_seconds=120.0).job)
        big = b"\x00\x00\x00\x18ftypmp42" + b"0" * (3 * 1024 * 1024)
        with patch.object(mj, "_store", AsyncMock()) as store, self.assertRaises(ImageProviderError) as caught:
            await mj.deliver_video(AsyncMock(), settings(video_max_bytes=2 * 1024 * 1024), reporter, plan, "msg-1",
                                   {"bytes": big, "mime_type": "video/mp4", "provider": "p", "model": "m"})
        store.assert_not_awaited()
        self.assertIn("3 MB; the limit is 2 MB", str(caught.exception))
        self.assertIn("Nothing was cut", str(caught.exception))


class StudioMaximumTests(unittest.IsolatedAsyncioTestCase):
    def test_maximum_is_read_from_config(self):
        self.assertEqual(studio_max_seconds(config_with_length(120)), 120.0)
        self.assertEqual(studio_max_seconds(config_with_length(60)), 60.0)
        self.assertIsNone(studio_max_seconds(heavy_config()))
        self.assertIsNone(studio_max_seconds(None))

    async def submit(self, fake, seconds):
        original = httpx.AsyncClient
        with patch("lumen.video_providers.httpx.AsyncClient",
                   side_effect=lambda **kw: original(transport=httpx.MockTransport(fake), **kw)):
            provider = FramePackStudioProvider(video_settings(framepack_api_name="/handle_start_button"))
            return await provider.submit(b"PNG", "image/png", "she waves", seconds=seconds)

    async def test_120_seconds_is_sent_whole_when_the_slider_allows_it(self):
        fake = FakeGradio(config=config_with_length(120))
        await self.submit(fake, 120.0)
        self.assertEqual(fake.start_data[9], 120.0)

    async def test_longer_than_the_slider_is_refused_before_upload(self):
        fake = FakeGradio(config=config_with_length(60))
        with self.assertRaisesRegex(ImageProviderError, "up to 60 seconds"):
            await self.submit(fake, 120.0)
        self.assertEqual([p for m, p in fake.calls if m == "POST"], [])


class CheckScriptMaximumTests(unittest.TestCase):
    def run_check(self, maximum, need):
        info, config = heavy_info(), config_with_length(maximum) if maximum else heavy_config()

        class Fake(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_GET(self):
                body = {"/gradio_api/info": {"named_endpoints": info}, "/config": config}.get(self.path)
                if body is None:
                    self.send_response(404); self.end_headers(); return
                self.send_response(200); self.send_header("content-type", "application/json"); self.end_headers()
                self.wfile.write(json.dumps(body).encode())

        server = HTTPServer(("127.0.0.1", 0), Fake)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            return subprocess.run([sys.executable, str(REPO / "scripts/check-framepack-endpoint.py"), "--url",
                                   f"http://127.0.0.1:{server.server_port}", "--api-name", "/handle_start_button",
                                   "--need-seconds", str(need)], capture_output=True, text=True, timeout=30,
                                  cwd=REPO / "backend")
        finally:
            server.shutdown()

    def test_ready_only_when_the_slider_reaches_the_needed_length(self):
        ok = self.run_check(120, 120)
        self.assertEqual(ok.returncode, 0, ok.stdout + ok.stderr)
        self.assertIn("Longest clip its length slider allows: 120 s", ok.stdout)
        short = self.run_check(60, 120)
        self.assertEqual(short.returncode, 1)
        self.assertIn("NOT READY for 120-second clips", short.stdout)
        unknown = self.run_check(None, 120)
        self.assertEqual(unknown.returncode, 1)
        self.assertIn("not readable", unknown.stdout)


@unittest.skipUnless((REPO / "supabase/migrations/20261116210000_media_generation_jobs_120s.sql").is_file()
                     and (REPO / "supabase/migrations/20261116100000_media_generation_jobs.sql").is_file(),
                     "this copy has no supabase/migrations (a backend-only copy)")
class MigrationTests(unittest.TestCase):
    def test_new_forward_only_migration_and_the_applied_one_is_untouched(self):
        first = (REPO / "supabase/migrations/20261116100000_media_generation_jobs.sql").read_text()
        self.assertIn("duration_seconds <= 10", first)            # applied in production: never edited
        new = (REPO / "supabase/migrations/20261116210000_media_generation_jobs_120s.sql").read_text()
        sql = new.split("*/", 1)[1]
        self.assertIn("CHECK (duration_seconds > 0 AND duration_seconds <= 120)", sql)
        self.assertIn("ILIKE '%duration_seconds%'", sql)            # finds the old check whatever its name
        for forbidden in ("DROP TABLE", "DISABLE ROW LEVEL", "CREATE POLICY", "storage.buckets", "DELETE", "TRUNCATE"):
            self.assertNotIn(forbidden, sql.upper() if forbidden.isupper() else sql)


if __name__ == "__main__":
    unittest.main()

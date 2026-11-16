"""The video worker: submit-and-return, durable follow-up, restart reconciliation, idempotent
delivery, long renders. FP-Studio and Supabase are faked; nothing reaches Heavy."""
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import httpx

from lumen import media_jobs as mj
from lumen import media_worker as mw
from lumen.images import ImageProviderError
from tests.test_media_generation import video_settings
from tests.test_privacy_mode import COMPANION_ID, CONVERSATION_ID, USER_ID

JOB = "9a1c7a52-6a77-4c0b-9a6f-1f1f2e5d7c01"
FP_JOB = "0bb4dd05-9f03-4837-86d8-5c62f2f9b544"
RUN = "261116_095453_817_1084"
MP4 = b"\x00\x00\x00\x18ftypmp42" + b"0" * 64


def settings(**kw):
    return video_settings(framepack_api_name="/handle_start_button", **kw)


def ago(**delta):
    return (datetime.now(timezone.utc) - timedelta(**delta)).isoformat()


class JobsDb:
    """A tiny PostgREST: one job table with conditional PATCH, messages, gallery, storage."""

    def __init__(self, **row):
        self.rows = {JOB: {"id": JOB, "owner_user_id": USER_ID, "companion_id": COMPANION_ID,
                           "conversation_id": CONVERSATION_ID, "message_id": "msg-1", "kind": "video",
                           "mode": "i2v", "status": "queued", "progress": 0, "stage": "", "prompt": "she waves",
                           "still_prompt": None, "source_path": f"{USER_ID}/p.png", "source_mime": "image/png",
                           "duration_seconds": 3.0, "explicit": False, "provider_job_id": None,
                           "provider_run": None, "created_at": ago(minutes=1), **row}}
        self.message = {"metadata": {"media_job": {"id": JOB, "status": "queued"}}}
        self.uploads, self.gallery = [], []

    def matches(self, row, params):
        for key, value in params.items():
            if key in ("select", "order", "limit"):
                continue
            op, _, want = value.partition(".")
            have = row.get(key)
            if op == "eq" and str(have) != want:
                return False
            if op == "in" and str(have) not in want.strip("()").split(","):
                return False
        return True

    async def _request(self, method, table, params=None, json=None, **kwargs):
        params = params or {}
        if table == mj.JOB_TABLE:
            hits = [r for r in self.rows.values() if self.matches(r, params)]
            if method == "GET":
                return [dict(r) for r in hits]
            if method == "PATCH":
                for r in hits:
                    r.update(json)
                return [dict(r) for r in hits]
        if table == "messages":
            if method == "GET":
                return [self.message]
            if method == "PATCH":
                self.message = {"metadata": json["metadata"]}
        if table == "gallery_items":
            self.gallery.append(json)
        return []

    async def upload_storage(self, bucket, path, content, mime, upsert=False):
        self.uploads.append((bucket, path, mime, upsert))

    @property
    def job(self):
        return self.rows[JOB]


class FakeStudio:
    def __init__(self, *states, submit_error=None):
        self.states = list(states)
        self.submitted = []
        self.checked = []
        self.downloaded = []
        self.submit_error = submit_error

    async def submit(self, image, mime, prompt, *, seconds, negative="", refuse_if_busy=False):
        if self.submit_error:
            raise self.submit_error
        self.submitted.append((image, mime, prompt, seconds, negative, refuse_if_busy))
        return FP_JOB

    async def check(self, job_id, *, seconds, window=6.0):
        self.checked.append(job_id)
        state = self.states.pop(0) if self.states else {"state": "running"}
        if isinstance(state, Exception):
            raise state
        return {"percent": None, "desc": "", "video": None, "run": None, **state}

    async def download(self, path):
        self.downloaded.append(path)
        return MP4


class WorkerTests(unittest.IsolatedAsyncioTestCase):
    async def run_worker(self, db, studio, passes=1, **kw):
        worker = mw.VideoWorker(settings(**kw), provider=studio)
        with patch.object(mj, "_service_db", return_value=db), patch.object(mw.mj, "_service_db", return_value=db), \
                patch.object(mj, "download_storage", AsyncMock(return_value=b"PNG")), \
                patch.object(mw, "free_comfy_memory", AsyncMock()):
            worker.db = db
            for _ in range(passes):
                await worker.run_once()
        return worker

    async def test_submit_returns_at_once_and_stores_fp_studio_job_id(self):
        db, studio = JobsDb(), FakeStudio()
        await self.run_worker(db, studio)
        self.assertEqual(len(studio.submitted), 1)
        self.assertFalse(studio.submitted[0][5])  # waits in FP-Studio's queue; no busy refusal
        self.assertEqual((db.job["status"], db.job["provider_job_id"], db.job["provider"]),
                         ("running", FP_JOB, "framepack-studio"))
        self.assertIsNotNone(db.job["deadline_at"])
        self.assertEqual(studio.checked, [])  # the first look is on the next pass

    async def test_two_hour_render_is_followed_then_delivered_once(self):
        running = [{"state": "running", "percent": p} for p in (10, 10, 37, 37, 60)]
        waiting = [{"state": "waiting"}, {"state": "queued"}]
        done = {"state": "completed", "video": f"/tmp/gradio/x/{RUN}_19.mp4", "run": RUN}
        db, studio = JobsDb(), FakeStudio(*waiting, *running, done)
        await self.run_worker(db, studio, passes=1 + len(waiting) + len(running) + 1)
        self.assertEqual(len(studio.submitted), 1)  # never submitted twice
        self.assertEqual(db.job["status"], "completed")
        self.assertEqual(db.job["result_path"], f"{USER_ID}/video-{JOB}.mp4")
        self.assertEqual(db.uploads[-1], ("chat-media", f"{USER_ID}/video-{JOB}.mp4", "video/mp4", True))
        self.assertEqual([a["path"] for a in db.message["metadata"]["attachments"]], [f"{USER_ID}/video-{JOB}.mp4"])
        self.assertEqual(len({g["id"] for g in db.gallery}), 1)
        self.assertEqual(studio.downloaded, [f"/tmp/gradio/x/{RUN}_19.mp4"])

    async def test_restart_resumes_the_same_fp_studio_job_without_resubmitting(self):
        db = JobsDb(status="running", provider="framepack-studio", provider_job_id=FP_JOB,
                    started_at=ago(hours=2), heartbeat_at=ago(minutes=40), deadline_at=ago(hours=-2))
        studio = FakeStudio({"state": "completed", "video": f"/o/{RUN}_19.mp4", "run": RUN})
        await self.run_worker(db, studio)  # a brand-new worker process
        self.assertEqual(studio.submitted, [])
        self.assertEqual(studio.checked, [FP_JOB])
        self.assertEqual(db.job["status"], "completed")
        self.assertGreater(db.job["latency_ms"], 2 * 3600 * 1000 - 5000)

    async def test_delivery_is_idempotent_after_a_crash_mid_delivery(self):
        db = JobsDb(status="running", provider="framepack-studio", provider_job_id=FP_JOB,
                    started_at=ago(minutes=5), deadline_at=ago(hours=-3))
        done = {"state": "completed", "video": f"/o/{RUN}_19.mp4", "run": RUN}
        studio = FakeStudio(done, done)
        # The first save fails (storage down); the next pass finds the job Completed again.
        flaky = AsyncMock(side_effect=[httpx.ConnectError("storage down"), None])
        original = db.upload_storage

        async def upload(*a, **kw):
            await flaky()
            await original(*a, **kw)
        db.upload_storage = upload
        await self.run_worker(db, studio, passes=2)
        self.assertEqual(db.job["status"], "completed")
        self.assertEqual(len(db.message["metadata"]["attachments"]), 1)
        self.assertEqual(len({g["id"] for g in db.gallery}), 1)

    async def test_claimed_but_never_submitted_fails_instead_of_rendering_twice(self):
        db = JobsDb(status="running", started_at=ago(minutes=30), heartbeat_at=ago(minutes=30))
        studio = FakeStudio()
        await self.run_worker(db, studio)
        self.assertEqual(studio.submitted, [])
        self.assertEqual(db.job["status"], "failed")
        self.assertIn("interrupted before it reached Heavy", db.job["error"])

    async def test_heavy_unreachable_keeps_the_job_and_retries(self):
        db = JobsDb(status="running", provider="framepack-studio", provider_job_id=FP_JOB,
                    started_at=ago(minutes=5), deadline_at=ago(hours=-3))
        studio = FakeStudio(ImageProviderError("FramePack-Studio is not reachable."),
                            httpx.ConnectError("refused"),
                            {"state": "completed", "video": f"/o/{RUN}_19.mp4", "run": RUN})
        await self.run_worker(db, studio, passes=1)
        self.assertEqual((db.job["status"], db.job["stage"]), ("running", mw.UNREACHABLE_NOTE))
        await self.run_worker(db, studio, passes=2)
        self.assertEqual(db.job["status"], "completed")

    async def test_over_budget_is_reported_and_nothing_is_cancelled(self):
        db = JobsDb(status="running", provider="framepack-studio", provider_job_id=FP_JOB,
                    started_at=ago(hours=5), deadline_at=ago(hours=1))
        studio = FakeStudio({"state": "running", "percent": 40})
        await self.run_worker(db, studio)
        self.assertEqual(db.job["status"], "failed")
        self.assertIn("within 4 hours", db.job["error"])
        self.assertIn(FP_JOB, db.job["error"])
        self.assertFalse(hasattr(studio, "cancel"))

    async def test_a_different_run_than_the_one_followed_is_never_delivered(self):
        db = JobsDb(status="running", provider="framepack-studio", provider_job_id=FP_JOB, provider_run=RUN,
                    started_at=ago(minutes=5), deadline_at=ago(hours=-3))
        studio = FakeStudio({"state": "completed", "video": "/o/261116_120000_001_5_19.mp4",
                             "run": "261116_120000_001_5"})
        await self.run_worker(db, studio)
        self.assertEqual(db.job["status"], "failed")
        self.assertEqual(studio.downloaded, [])
        self.assertEqual(db.uploads, [])

    async def test_fp_studio_failure_and_unsaved_reply(self):
        db = JobsDb(status="running", provider="framepack-studio", provider_job_id=FP_JOB,
                    started_at=ago(minutes=5), deadline_at=ago(hours=-3))
        await self.run_worker(db, FakeStudio({"state": "failed", "desc": "Error: CUDA out of memory"}))
        self.assertEqual(db.job["status"], "failed")
        self.assertIn("CUDA out of memory", db.job["error"])
        orphan = JobsDb(message_id=None, created_at=ago(minutes=20))
        studio = FakeStudio()
        await self.run_worker(orphan, studio)
        self.assertEqual((orphan.job["status"], studio.submitted), ("failed", []))
        fresh = JobsDb(message_id=None)
        await self.run_worker(fresh, studio)
        self.assertEqual(fresh.job["status"], "queued")  # its reply may still be saving

    async def test_progress_never_goes_backwards(self):
        db = JobsDb(status="running", provider="framepack-studio", provider_job_id=FP_JOB, progress=37,
                    started_at=ago(minutes=5), deadline_at=ago(hours=-3))
        await self.run_worker(db, FakeStudio({"state": "running", "percent": 10}))
        self.assertEqual(db.job["progress"], 37)

    async def test_submit_failure_is_reported(self):
        db = JobsDb()
        await self.run_worker(db, FakeStudio(submit_error=ImageProviderError("FramePack-Studio is not reachable.")))
        self.assertEqual((db.job["status"], db.job["error"]), ("failed", "FramePack-Studio is not reachable."))
        self.assertEqual(db.message["metadata"]["media_job"]["status"], "failed")


class HandOffTests(unittest.IsolatedAsyncioTestCase):
    async def test_lumen_api_only_links_the_reply_and_renders_nothing(self):
        db = JobsDb()
        with patch.object(mj, "_service_db", return_value=db), \
                patch.object(mj, "run_video_job", AsyncMock()) as run:
            plan = mj.VideoJobPlan(owner_user_id=USER_ID, companion_id=COMPANION_ID, conversation_id=CONVERSATION_ID,
                                   mode="i2v", prompt="p", seconds=3.0, explicit=False, id=JOB)
            await mj.start_video_job(settings(), plan, "msg-9")
        run.assert_not_awaited()
        self.assertEqual((db.job["message_id"], db.job["status"]), ("msg-9", "queued"))


if __name__ == "__main__":
    unittest.main()

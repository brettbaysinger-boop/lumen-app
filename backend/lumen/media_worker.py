"""The video worker: renders that may take hours, outside lumen-api.

Run as its own small supervised service (systemd ``lumen-media-worker``), with the same
environment as lumen-api:

    python -m lumen.media_worker            # loops forever
    python -m lumen.media_worker --once     # one pass, for checks

lumen-api only records a job and replies at once. Every ``VIDEO_POLL_SECONDS`` this worker:

* takes each queued job that has its chat message (a claim is a conditional update, so two
  workers never take the same job), prepares the start frame and submits ONE job to
  FramePack-Studio's own queue, storing FP-Studio's job id on the row straight away;
* looks at each running job through ``monitor_job(<that id>)`` for a few seconds and closes the
  stream (no long-held connection, nothing survives a disconnect on Heavy);
* delivers a finished job idempotently: fixed storage path, attachment de-duplicated, Gallery
  row keyed by the job, so a crash mid-delivery is simply delivered again;
* never re-submits: after any restart it looks at the SAME FP-Studio job. A job that was claimed
  but has no FP-Studio id after ``CLAIM_GRACE`` is failed (it may or may not have reached Heavy;
  sending it again could render it twice);
* never cancels anything on Heavy. A job past ``VIDEO_RENDER_BUDGET_SECONDS`` is reported as not
  finished, and its FP-Studio id is kept on the row.

ComfyUI-only video workflows (no FP-Studio queue) still run start to finish inside the worker.
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from . import media_jobs as mj
from .images import ImageProviderError, ImageProviderNotConfigured, create_image_provider
from .video_providers import FramePackStudioProvider, framepack_provider, free_comfy_memory

log = logging.getLogger("lumen.media_worker")

CLAIM_GRACE = timedelta(minutes=10)     # claimed, never got an FP-Studio id: not resumable
ORPHAN_AFTER = timedelta(minutes=15)    # the chat reply was never saved: nothing to deliver to
UNREACHABLE_NOTE = "Heavy isn't answering right now; I'll keep checking."


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(moment: datetime) -> str:
    return moment.isoformat()


def _parse(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)


def plan_from_row(row: dict[str, Any]) -> mj.VideoJobPlan:
    return mj.VideoJobPlan(owner_user_id=row["owner_user_id"], companion_id=row["companion_id"],
                           conversation_id=row.get("conversation_id") or "", mode=row["mode"],
                           prompt=row["prompt"], seconds=float(row["duration_seconds"]),
                           explicit=bool(row.get("explicit")), still_prompt=row.get("still_prompt"),
                           source_path=row.get("source_path"), source_mime=row.get("source_mime"), id=row["id"])


def durable(settings) -> bool:
    """FramePack-Studio jobs are followed across restarts; other routes run inline."""
    if (getattr(settings, "comfyui_i2v_workflow", "") or "").strip():
        return False
    return isinstance(framepack_provider(settings), FramePackStudioProvider)


class VideoWorker:
    def __init__(self, settings, *, provider: FramePackStudioProvider | None = None):
        self.settings = settings
        self.db = mj._service_db(settings)
        self.provider = provider

    def studio(self) -> FramePackStudioProvider:
        if self.provider is None:
            self.provider = FramePackStudioProvider(self.settings)
        return self.provider

    async def active_jobs(self) -> list[dict[str, Any]]:
        return await self.db._request("GET", mj.JOB_TABLE, params={
            "kind": "eq.video", "status": "in.(queued,running)", "select": "*",
            "order": "created_at.asc", "limit": "50"}) or []

    async def patch(self, row: dict[str, Any], expect: dict[str, str] | None = None, **fields) -> list:
        fields["updated_at"] = _iso(_now())
        params = {"id": f"eq.{row['id']}", **(expect or {})}
        return await self.db._request("PATCH", mj.JOB_TABLE, params=params,
                                      headers={"Prefer": "return=representation"}, json=fields) or []

    async def run_once(self) -> None:
        for row in await self.active_jobs():
            try:
                await self.advance(row)
            except Exception:  # one bad job never stops the others
                log.exception("Video job %s: unexpected error; will look again", row.get("id"))

    async def advance(self, row: dict[str, Any]) -> None:
        now = _now()
        if row["status"] == "queued":
            if not row.get("message_id"):
                created = _parse(row.get("created_at"))
                if created and now - created > ORPHAN_AFTER:
                    await self.patch(row, {"status": "eq.queued"}, status="failed", stage="Couldn't finish",
                                     error="The chat reply for this video was never saved.",
                                     finished_at=_iso(now))
                return
            await self.start(row)
        elif row.get("provider_job_id"):
            await self.follow(row)
        else:
            beat = _parse(row.get("heartbeat_at")) or _parse(row.get("started_at")) or _parse(row.get("updated_at"))
            if beat is None or now - beat > CLAIM_GRACE:
                await self.fail(row, "This video was interrupted before it reached Heavy. Ask again to retry.")

    async def start(self, row: dict[str, Any]) -> None:
        now = _now()
        budget = timedelta(seconds=self.settings.video_render_budget_seconds)
        claimed = await self.patch(row, {"status": "eq.queued"}, status="running", stage="Starting…", progress=1,
                                   started_at=_iso(now), heartbeat_at=_iso(now), deadline_at=_iso(now + budget))
        if not claimed:
            return  # another worker took it
        row = {**row, **claimed[0]}
        plan = plan_from_row(row)
        reporter = mj.JobReporter(self.settings, plan.id)
        await mj.update_message(self.db, plan, row["message_id"], job={"status": "running"})
        if not durable(self.settings):
            await mj.run_video_job(self.settings, plan, row["message_id"])
            return
        try:
            image, mime = await self.start_frame(plan, row, reporter)
            await free_comfy_memory(self.settings.comfyui_url)  # FP-Studio needs Heavy's GPU
            negative = getattr(self.settings, "comfyui_negative_prompt", "") or ""
            job_id = await self.studio().submit(image, mime, plan.prompt, seconds=plan.seconds, negative=negative)
        except (ImageProviderNotConfigured, ImageProviderError) as exc:
            await self.fail(row, str(exc))
            return
        except httpx.HTTPError:
            await self.fail(row, "A video service on Heavy could not be reached.")
            return
        await self.patch(row, provider="framepack-studio", provider_job_id=job_id, heartbeat_at=_iso(_now()),
                         stage="Queued on Heavy…", progress=5)
        log.info("Video job %s submitted as FramePack-Studio job %s", plan.id, job_id)

    async def start_frame(self, plan: mj.VideoJobPlan, row: dict[str, Any], reporter) -> tuple[bytes, str]:
        if plan.mode == "t2i2v":
            await reporter.progress(3, "Creating the first frame…")
            image = await create_image_provider(self.settings).generate(plan.still_prompt or plan.prompt)
            mime = image["mime_type"]
            path = await mj._store(self.db, plan.owner_user_id, image["bytes"], mime, name=f"still-{plan.id}")
            await reporter.update(source_path=path, source_mime=mime)
            await mj.update_message(self.db, plan, row["message_id"], job={"status": "running"},
                                    attachment={"path": path, "mime_type": mime}, extra={"generated_image": True})
            return image["bytes"], mime
        if plan.mode == "i2v" and plan.source_path:
            await reporter.progress(3, "Reading the image…")
            return await mj.download_storage(self.settings, plan.source_path), plan.source_mime or "image/png"
        raise ImageProviderError("Text-to-video without a first frame isn't set up for FramePack-Studio.")

    async def follow(self, row: dict[str, Any]) -> None:
        now = _now()
        deadline = _parse(row.get("deadline_at"))
        job_id = row["provider_job_id"]
        try:
            seen = await self.studio().check(job_id, seconds=float(row["duration_seconds"]))
        except (ImageProviderError, httpx.HTTPError) as exc:
            # Heavy or the route is down: keep the job, say so, look again next pass.
            log.warning("Video job %s: FramePack-Studio not reachable (%s)", row["id"], exc)
            if deadline and now > deadline:
                await self.over_budget(row)
            elif row.get("stage") != UNREACHABLE_NOTE:
                await self.patch(row, stage=UNREACHABLE_NOTE)
            return
        state = seen["state"]
        if state == "completed":
            await self.deliver(row, seen)
            return
        if state == "failed":
            await self.fail(row, f"FramePack-Studio could not finish this video ({seen['desc'] or 'no details'}). "
                                 f"Its job id is {job_id}.")
            return
        if deadline and now > deadline:
            await self.over_budget(row)
            return
        fields: dict[str, Any] = {"heartbeat_at": _iso(now)}
        if seen.get("run") and not row.get("provider_run"):
            fields["provider_run"] = seen["run"]
        if state == "queued":
            fields["stage"] = "Waiting in Heavy's queue…"
        elif state == "waiting":
            fields["stage"] = "Heavy is finishing another video first…"
        else:
            fields["stage"] = "Animating…"
            if seen.get("percent") is not None:
                fields["progress"] = max(int(row.get("progress") or 0), min(95, int(seen["percent"])))
        await self.patch(row, **fields)

    async def deliver(self, row: dict[str, Any], seen: dict[str, Any]) -> None:
        plan = plan_from_row(row)
        if row.get("provider_run") and seen.get("run") != row["provider_run"]:
            await self.fail(row, "FramePack-Studio reported a video from a different run for this job; "
                                 "nothing was saved.")
            return
        reporter = mj.JobReporter(self.settings, plan.id)
        try:
            content = await self.studio().download(seen["video"])
            started = _parse(row.get("started_at"))
            latency = round((_now() - started).total_seconds() * 1000) if started else None
            await mj.deliver_video(self.db, self.settings, reporter, plan, row["message_id"], {
                "bytes": content, "mime_type": "video/mp4", "provider": "framepack-studio",
                "model": "framepack-studio:Original"}, latency_ms=latency)
        except ImageProviderError as exc:
            await self.fail(row, str(exc))
            return
        except httpx.HTTPError:
            # Delivery is idempotent: the next pass finds the job Completed again and retries.
            log.warning("Video job %s: finished on Heavy, saving failed; will retry", plan.id)
            return
        log.info("Video job %s delivered (FramePack-Studio job %s)", plan.id, row["provider_job_id"])

    async def over_budget(self, row: dict[str, Any]) -> None:
        hours = self.settings.video_render_budget_seconds / 3600
        await self.fail(row, f"This video didn't finish within {hours:g} hours, so I stopped waiting. "
                             f"Nothing was cancelled on Heavy (FramePack-Studio job {row['provider_job_id']}).")

    async def fail(self, row: dict[str, Any], error: str) -> None:
        plan = plan_from_row(row)
        reporter = mj.JobReporter(self.settings, plan.id)
        await mj._fail(self.db, reporter, plan, row.get("message_id") or "", error)


async def run_forever(settings) -> None:
    worker = VideoWorker(settings)
    log.info("Video worker started; looking at jobs every %ss", settings.video_poll_seconds)
    while True:
        started = time.monotonic()
        await worker.run_once()
        await asyncio.sleep(max(1.0, settings.video_poll_seconds - (time.monotonic() - started)))


def main() -> int:
    from .config import get_settings
    parser = argparse.ArgumentParser(description="Lumen video worker")
    parser.add_argument("--once", action="store_true", help="one pass over the active jobs, then exit")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    settings = get_settings()
    if not settings.video_generation_enabled:
        log.info("VIDEO_GENERATION_ENABLED is false: nothing to do")
        return 0
    if args.once:
        asyncio.run(VideoWorker(settings).run_once())
        return 0
    asyncio.run(run_forever(settings))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

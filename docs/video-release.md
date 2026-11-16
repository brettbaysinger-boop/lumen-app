# Short video: staged release (owner-run, each stage gated)

**Status 2026-11-16: nothing below has been run in production.** BigLust still images are live (PR #52).
Video, the migration, the worker and the video web app are not deployed, and video is off.

## What is live, and why no `git pull`

The live checkout `/home/brett/lumen-push` has HEAD at the S22 release `7f63d52`. The BigLust images
patch (code `27fa0bc`) is applied to its **working files**, not committed. A `git pull`, `checkout`, rebase
or reset there would throw that patch away or conflict with it. So:

* the backend stage applies one reviewed patch, `27fa0bc → 0b370fb` (`backend/` only), and only to files
  that still equal the images release byte for byte. Otherwise it STOPs and changes nothing.
* the web stage fast-forwards HEAD only to a **frontend-only** commit
  (`release/video-frontend-20261116`, `9ed4737`, on `7f63d52`), through the unchanged
  `scripts/animated-web-update.sh`. It touches no backend file, so the working-file patches stay.
* **Never run `scripts/biglust-images-release.sh rollback` while the video backend is applied.** It would put
  back pre-images copies of `config.py`, `main.py` and `media_safety.py`. Roll back video first.
  `video-release.sh backend` refuses to start if the images files are no longer as released.

`scripts/video-release.sh` covers stages 1–4 and 6. Run it from a clean clone of
`feat/local-media-generation-20261116`, as the lumen-api user. `scripts/video-release.sh check` shows every
stage's state and changes nothing. Every step that changes something needs its own confirmation word and
has its own way back. A way back refuses while a later stage is still in place.

Tested offline: `scripts/test-video-release.sh` runs all 15 steps, with and without pytest in the venv,
on a fake live checkout. That checkout has the images patch in its working files. The test uses
stubbed systemd and the real worker process.

## Stage 0: prove the existing clip is the canary (Heavy, read-only). HARD STOP until MATCH

From the canary checkout on Lumen (`git -C ~/lumen-fps-canary fetch -q origin && git -C ~/lumen-fps-canary checkout -q --detach origin/feat/local-media-generation-20261116`):
```
scp ~/lumen-fps-canary/scripts/framepack-studio-job-output.py /tmp/raialume-biglust-8k5z36zq/lumen-canary.png <heavy>:/tmp/
ssh <heavy> 'cd /data/ai-media-studio/FP-Studio && <FP-Studio python> /tmp/framepack-studio-job-output.py --queue-json queue.json --job-id 0bb4dd05-9f03-4837-86d8-5c62f2f9b544 --expect-image /tmp/lumen-canary.png'
```
`MATCH` requires all of these:
* the job's prompt equals the canary prompt (compared, never printed);
* the length is 3 s;
* FP-Studio's saved start frame has the same pixels as the canary PNG;
* the output was written during that job's run.

`MISMATCH` or `REFUSED` means stop here: no GPU job and no release step.

**Result (owner, 2026-11-16): `MATCH` at `0b370fb`, run without `--expect-image`.** Verified for job
`0bb4dd05-…`:
* status completed;
* the prompt and the 3 s length match the canary (seed 3101, Original);
* `outputs/261116_095453_817_1084_19.mp4`, 836,627 bytes, sha256 `84e686f8…288e0`;
* written 510.9 s after the job started, within its run.

The start frame's RGB pixels were **not** compared. Optional follow-up: the same command with
`--expect-image /tmp/lumen-canary.png`. The render took about 8.5 minutes for a 3 s clip, which is why
rendering runs in the worker, not in the request.

## Stage 1: the private route for FP-Studio. PASSED (owner, 2026-11-16)

Done by the owner on Lumen, mirroring the ComfyUI route:
* The existing `lumen-comfyui-tunnel.service` (`127.0.0.1:18188 → Heavy 127.0.0.1:8188`) is unchanged and
  healthy.
* A separate `lumen-framepack-tunnel.service` was cloned from it, with only the forward changed to
  `-L 127.0.0.1:17863:127.0.0.1:7863`. It is enabled at boot.
* Heavy's authorized key keeps `restrict,port-forwarding,…,command="/bin/false"` and permits exactly the
  loopback destinations `127.0.0.1:8188` and `127.0.0.1:7863`.
* Checks passed: `systemctl is-active`, `curl http://127.0.0.1:17863/gradio_api/info`, and ComfyUI's
  `/system_stats` on 18188.

A first attempt failed with SSH `administratively prohibited` (the destination was not yet permitted)
and was rolled back. Nothing else changed: video is still off, and no backend, database or web change
was made. Do not reinstall or retest this route. Stage 6 uses `VIDEO_FRAMEPACK_URL=http://127.0.0.1:17863`.
`scripts/video-release.sh route` stays available as a read-only check.

## Stage 2: migration. APPLIED and verified (owner, 2026-11-16)

Applied by the owner with `supabase db push --local` (CLI v2.119.0). Before applying:
* `comm` showed only `20261116100000` pending;
* the prompt listed exactly that one migration;
* `migration-check` had shown the table absent and `chat-media` at 10 MB, images only.

The undo SQL is saved at `~/.local/state/lumen-video-release/migration-undo.sql`. Do not rerun `db push` or
reset Supabase. Verified after apply: table present, bucket 50 MB with video/mp4 and video/webm.
Read-only post-apply check: `bash scripts/video-release.sh migration-check`. It should report
`"table": "present"`, `bucket_limit` 52428800 and `video/mp4` in `bucket_types`.

`scripts/video-release.sh migration-check` reports whether `media_generation_jobs` exists and what
`chat-media` allows. Before the migration, it writes the undo SQL with today's bucket values to
`~/.local/state/lumen-video-release/migration-undo.sql`.

Apply `supabase/migrations/20261116100000_media_generation_jobs.sql` in one transaction, through the SQL
path you use for this Supabase. If you use `supabase db push --local`, run `supabase migration list --local`
first and STOP if any migration other than `20261116100000` is pending.

The migration creates the table (RLS on, no client policies) and lets `chat-media` hold MP4/WebM up to
50 MB. Nothing reads it while video is off. Way back: the undo SQL. It drops the table and restores the
recorded bucket values.

## Stage 3: backend, video still OFF. APPLIED (owner, 2026-11-16)

Applied with patch id `a840dee2b532`. The backup is `~/.local/state/lumen-video-release/backend-20261116-123732`.
The script reported "video backend live with video OFF (no .env change). BigLust images unchanged."
Do not reapply. Open: one Private BigLust image through Chat and Gallery on this backend.

```
scripts/video-release.sh backend-check            # read-only; tests run on a patched copy
VIDEO_RELEASE_CONFIRM=backend:<patch id> scripts/video-release.sh backend
```
It backs up the 17 files byte for byte, applies the patch to the working files and leaves HEAD and `.env`
alone. It restarts lumen-api only and checks `/health` plus the new job route. Any failure restores the
backup.

Canary: a Private BigLust image still reaches Chat and Gallery.
Way back: `VIDEO_RELEASE_CONFIRM=backend-rollback scripts/video-release.sh backend-rollback`.

## Stage 4: worker service, video still OFF. PASSED (owner, 2026-11-16 12:39 MST)

Installed and enabled. With video off it logged "VIDEO_GENERATION_ENABLED is false: nothing to do" and
exited (`ActiveState=inactive`, `UnitFileState=enabled`, `Result=success`). Do not rerun stages 1–4.

`VIDEO_RELEASE_CONFIRM=worker scripts/video-release.sh worker` installs `lumen-media-worker.service`:
* the same user, WorkingDirectory and EnvironmentFile as lumen-api;
* `Restart=on-failure`;
* `ExecStart=<live venv> -m lumen.media_worker`.

It is enabled and started; with video off it logs "nothing to do" and exits 0. The step STOPs if lumen-api
sets `SUPABASE_*`/`VIDEO_*`/`FRAMEPACK_*`/`COMFYUI_*` inline, because the worker would not see them.
Way back: `VIDEO_RELEASE_CONFIRM=worker-rollback scripts/video-release.sh worker-rollback`.

## Stage 5: web app (Gallery Public lock, chat video, progress). APPLIED (owner, 2026-11-16); privacy check pending

Updated: `/home/brett/lumen-push @ 9ed473748740`, with no service restarted. Do not redeploy. Pending: in Public,
Gallery is hidden; in Private, Gallery and a BigLust image work as before.

`check` from a clean worktree at `9ed4737` gave:
* one fast-forward from `7f63d520f561`;
* 8 frontend-only files;
* 13 live local edits kept: the 11 tracked backend files the images and video patches change, plus 2 other existing edits;
* HTTP 200 on 8081.

From a clean clone of `release/video-frontend-20261116`:
```
scripts/animated-web-update.sh check
LUMEN_WEB_UPDATE_CONFIRM=update:<commit> scripts/animated-web-update.sh update
```
This branch has only PR #51's frontend files on `7f63d52`. Tests: 152 node tests, plus the browser checks
for media, Public/Private and the live room, all pass.

Canary: Gallery in Public reads nothing and says it is hidden. In Private it shows everything as before.
Way back: `LUMEN_WEB_UPDATE_CONFIRM=rollback scripts/animated-web-update.sh rollback`.

## Stage 6: enable video, then the live canary
```
VIDEO_FRAMEPACK_URL=http://127.0.0.1:17863 VIDEO_RELEASE_CONFIRM=enable scripts/video-release.sh enable
```
It STOPs unless stages 2–5 are in place and FP-Studio's contract check passes through that loopback URL.
It sets exactly these keys in `.env`:
* `VIDEO_GENERATION_ENABLED=true`
* `FRAMEPACK_URL`
* `FRAMEPACK_API_NAME=/handle_start_button`

It then restarts lumen-api and the worker. Clips stay at most 10 s (`VIDEO_MAX_SECONDS`). The 4 h render
budget (`VIDEO_RENDER_BUDGET_SECONDS`) is how long one render may take, not clip length.

Live canary (owner, Private):
1. Desktop: "animate this" on a BigLust image, 3 seconds. The reply comes at once, and progress shows in
   the bubble.
2. While it renders: `sudo systemctl restart lumen-api lumen-media-worker`. The job keeps its FP-Studio id
   (`journalctl -u lumen-media-worker`), is not submitted again and finishes.
3. It appears once in Chat and once in Gallery, and plays.
4. Switch to Public. Gallery and the job are hidden.
5. The same on the S22.

Way back: `VIDEO_RELEASE_CONFIRM=enable-rollback scripts/video-release.sh enable-rollback` restores `.env`
byte for byte. Unfinished jobs stay in the table, and nothing is cancelled on Heavy.

## Order of ways back
6 enable-rollback → 5 web rollback → 4 worker-rollback → 3 backend-rollback → 2 undo SQL → 1 remove the
forward. The images release stays as it is throughout.

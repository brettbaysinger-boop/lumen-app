# Short video: staged release (owner-run, each stage gated)

**Status 2026-11-16: stages 1–6 applied by the owner; the first video canary failed (a still image, see Hotfix).** BigLust still images are live (PR #52).

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

## Stage 6: enable video, then the live canary. ENABLED (owner, 2026-11-16); first canary FAILED (still image, see Hotfix)

Before enabling, `check` showed every earlier stage in place. `enable` then reported "video on (clips up to the
existing 10 s), worker running, render budget 14400s". Not yet accepted end to end. If the canary fails,
inspect `journalctl -u lumen-media-worker` and do not queue another GPU job.

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

## Hotfix: a video request made a still image (live canary, 2026-11-16 ~13:00 MST)

**What happened.** In Private on desktop, "Make a 3-second video animating the image you just generated.
Use gentle, natural movement." came back as a new BigLust still ("Here you go."). No video job was made.

**Why.** The web app decides before the server whether a message is a picture request
(`isImageRequest` in `lib/cognition.ts`). That check matched "make … image" and sent the message straight
to `POST /v0.2/images/generate`, which makes a still. "Here you go." is that endpoint's fixed reply. The chat
runtime and its video planner were never called. Practice or document context was not the cause: the image
endpoint does not look at them. The server's own `video_request` matches this message, and its
`image_request` excludes it.

**Fix (PR #51 `a4c06b0`; frontend-only copy `49b4a36`).**
* Web: a video request (the same pattern as the server's) never takes the image shortcut. It goes to chat.
  A "yes" to a video offer is never turned into an image prompt.
* Server, `/v0.2/images/generate`: refuses a video request with 409 before any image work. An app that is
  not yet reloaded gets "That sounds like a video request, so I haven't made an image…" and no still.
* Server, chat: in a practice session or with a document selected, an explicit video request is answered
  with why no video can be made there. The model is not asked, so it cannot answer with a still.
* Tests use the exact live message:
  * the detectors and the web routing;
  * the image route guard;
  * Private chat: exactly one i2v job from the image just made, with no image call, whether or not the
    model replies with an image action;
  * practice and document turns.

**Read-only check before any more GPU jobs** (optional; it confirms the diagnosis and prints no prompts):
```
journalctl -u lumen-api --since "2026-11-16 12:50" --until "2026-11-16 13:15" | grep -E 'POST /v0\.(2|3)/(images/generate|respond)'
```
```sql
-- Expect 0 rows: no video job was made.
select id, status, mode, created_at from media_generation_jobs order by created_at desc limit 5;
-- Expect the newest assistant row: content 'Here you go.', generated_image true, has_job false.
select m.created_at, m.role, m.content = 'Here you go.' as fixed_reply,
       m.metadata->>'generated_image' as generated_image, m.metadata ? 'media_job' as has_job,
       c.goal_item_id is not null as practice
from messages m join conversations c on c.id = m.conversation_id
where m.created_at > '2026-11-16 19:45+00' order by m.created_at desc limit 6;
```

**Apply (owner): the web part only.** It alone fixes the live failure. No backend, migration, worker or
service change, and video stays on. The owner asked not to redeploy the backend.

From a clean clone of `release/video-frontend-20261116` (also `hotfix/video-routing-frontend-20261116`), at
`49b4a36`:
* one frontend-only fast-forward from the live `9ed4737`;
* 5 files: `lib/cognition.ts`, `lib/image-followup.ts`, 2 node tests and the media browser check;
* 157 node tests pass;
* the browser check types the exact live message in Private Chat and sees it sent to `/respond`. A plain
  picture request still goes to `/v0.2/images/generate`. On `9ed4737` the same check fails: the message is
  sent to `/v0.2/images/generate`.
```
npm ci
scripts/animated-web-update.sh check
LUMEN_WEB_UPDATE_CONFIRM=update:49b4a36 scripts/animated-web-update.sh update
```
Way back: `LUMEN_WEB_UPDATE_CONFIRM=rollback scripts/animated-web-update.sh rollback`. Afterwards, reload the
app on desktop and on the S22, so each browser loads the new code.

**Owner preflight (2026-11-16): `video-routing-hotfix.sh check` READY**, patch id `e707ac6b49c6`. The 3 live
files equal `0b370fb`, the patched-copy unittest run passed 96 tests, and lumen-api is healthy.
**Backend guard APPLIED (owner, 13:23 MST)**: backup `hotfix-20261116-132340`, lumen-api healthy; HEAD, .env and
the worker unchanged. Do not rerun it. Web part: not yet deployed.

**Optional later, not needed for this fix: the backend guard.** `/v0.2/images/generate` would refuse a video
request (409), even from an app that has not been reloaded. Practice and document turns would say why no video.
```
scripts/video-routing-hotfix.sh check
VIDEO_HOTFIX_CONFIRM=hotfix:e707ac6b49c6 scripts/video-routing-hotfix.sh apply
```
Run these from a clean clone of `feat/local-media-generation-20261116`.
* It changes 3 files (`lumen/main.py`, `lumen/runtime.py`, `tests/test_media_generation.py`), and only if
  they still equal `0b370fb` byte for byte.
* It runs the tests on a patched copy first and restarts lumen-api only. It restores the backup automatically
  on any failure.
* Way back: `VIDEO_HOTFIX_CONFIRM=hotfix-rollback scripts/video-routing-hotfix.sh rollback`.

Offline test: `scripts/test-video-routing-hotfix.sh`, 11 checks, with and without pytest.
* Check READY, with backend tests on the patched copy.
* Refusals: wrong token, an edited live file, lumen-api down, a second apply.
* Automatic restore when lumen-api fails after the restart.
* Apply leaves HEAD, `.env` and the other files alone.
* `backend-rollback` refuses under the hotfix, and rollback restores the files.
* The web commit is a frontend-only fast-forward.

Then repeat the stage 6 canary from step 1. One request only. If it is not queued as a video, stop and paste
`journalctl -u lumen-api -u lumen-media-worker`; do not retry.

## Discreet Public mode (owner request, 2026-11-16). Frontend only, NOT deployed

Branch `release/discreet-privacy-20261116` at `7e7ec20`: one commit on the routing hotfix `49b4a36`, 7 frontend
and test files. No backend, worker, database or route change, and no service restart.
* Chat in Public leaves Private messages out of the list entirely: no "Hidden" bubble, count, position or
  screen-reader node. A Private reply still on its way shows nothing. Switching back to Private shows the
  same history at once. Nothing is deleted.
* The big amber switch and the banner are gone. One small chip (`🔒 Private` / `👥 Public`) sits at the right of
  the Chat header; one tap switches. Its touch target is 44 px. Video Chat and Theater keep their places
  for it.
* What Public covers ("Chat and Live Room only… Other tabs are not covered") is behind the ⓘ next to the chip
  and in the chip's screen-reader hint.
* Gallery in Public is one quiet line and the chip. It still reads nothing.

Tested: 158 node tests; browser checks for Public/Private, media and the Live Room on the web build. The
Public/Private check confirms no private text in the page, the DOM or the accessibility tree, and the chip's
size and place at 360, 390 and 1280 px. Not tested: the phone app's native Chat header on a real S22.

Apply (owner), from a clean clone of `release/discreet-privacy-20261116`, after the routing hotfix `49b4a36`
is live (or instead of it: this commit contains it, as a 3-commit fast-forward from `9ed4737`):
```
npm ci
scripts/animated-web-update.sh check
LUMEN_WEB_UPDATE_CONFIRM=update:7e7ec20 scripts/animated-web-update.sh update
```
Way back: `LUMEN_WEB_UPDATE_CONFIRM=rollback scripts/animated-web-update.sh rollback`. It is safe while a video
renders (nothing is restarted), but an open Chat page only changes when it is reloaded.

## Clips of 1 to 120 seconds (owner request, 2026-11-16). Prepared, NOT deployed

Today a clip is at most 10 s. 120 s is FramePack's own maximum. The default clip stays 5 s. "120 seconds"
is the clip's length. Rendering it can take many hours: the 3 s canary took about 8.5 minutes.

What changes (backend commit `648e8d0`, patch `a4c06b0 → 648e8d0`, 6 files, patch id `e09c9ad9a577`):
* `VIDEO_MAX_SECONDS` may be up to 120. It stays 10 until the enable step sets it.
* A request for more than the limit is refused and nothing is shortened. "two minutes", "a minute and a
  half" and "half a minute" are understood.
* Render budget per job: 600 s per clip second, at least the existing 4 h, at most 24 h. A 120 s clip gets
  20 h. Polling every 20 s, restart recovery, one delivery and "never cancel or resubmit" are unchanged.
* FramePack-Studio's own length slider maximum is read from `/config`. A longer clip is refused before upload.
* A finished file over `VIDEO_MAX_BYTES` (50 MB, the same as the `chat-media` bucket) is refused whole, with
  both sizes in the message. It is never cut. Uploads over 8 MB get a 10 minute timeout.
* New migration `20261116210000_media_generation_jobs_120s.sql`: only the `duration_seconds` check, `<= 120`.
  The applied migration is not edited. RLS, the other checks, the bucket and its limits are unchanged.

**File size, not yet known.** The 3 s canary was 836,627 bytes at 512x768. At that rate a 120 s clip is
about 33 MB, under the 50 MB limit, but that is an estimate from one clip. Raising the limit needs the
bucket limit and Supabase's global storage limit (`supabase/config.toml`, a Supabase restart), so it is
left as it is until a real long clip shows it is needed. Check sizes at 30 s and 60 s first.

Tested:
* 800 backend tests pass.
* The migration was run on PostgreSQL 16: twice in a row, 120 accepted, 120.1 and 0 refused, RLS still on,
  and the undo refuses while a long row exists.
* `scripts/test-video-length-release.sh`: 16 checks, with and without pytest.

Not tested: a real clip longer than 3 s on Heavy.

**Steps (owner). Each STOPs while any video job is queued or running, so a render is never interrupted.**
From a clean clone of `feat/local-media-generation-20261116`:
1. `scripts/video-length-release.sh check` (read-only). It needs all of:
   * the 6 live files equal `a4c06b0` byte for byte;
   * no active video job;
   * FramePack-Studio's slider allows 120 s (read through the existing 17863 route);
   * the tests pass on a patched copy.
2. `VIDEO_LENGTH_CONFIRM=backend:e09c9ad9a577 scripts/video-length-release.sh apply`.
   It restarts lumen-api and the worker. The limit is still 10 s and `.env` is untouched.
   Way back: `VIDEO_LENGTH_CONFIRM=backend-rollback scripts/video-length-release.sh rollback`.
3. Migration, the same way as stage 2: `supabase migration list --local` must show only `20261116210000`
   pending, then `supabase db push --local`. Verify (read-only):
   ```sql
   select pg_get_constraintdef(oid) from pg_constraint
   where conrelid = 'public.media_generation_jobs'::regclass and conname like '%duration_seconds%';
   ```
   It should show `duration_seconds <= (120)::numeric`. The undo is in the migration file's header.
4. `VIDEO_LENGTH_CONFIRM=enable-120 scripts/video-length-release.sh enable`. It STOPs unless the database
   already allows 120 s (read-only, through the local `supabase_db_*` container). It sets only
   `VIDEO_MAX_SECONDS=120` in `.env` and restarts both services.
   Way back: `VIDEO_LENGTH_CONFIRM=enable-rollback scripts/video-length-release.sh enable-rollback`.
**Status (owner, 2026-11-16 ~14:27 MST): step 2 APPLIED** (backup `length-20261116-142718`) **and step 4 ENABLED
straight after. Step 3, the migration, is not confirmed.** Do not rerun apply or enable. The first version
of `enable` did not check the database; it does now (read-only), and `status` warns. To see where things are,
with nothing changed and nothing restarted:
```
scripts/video-length-release.sh migration-check
```
If it says the migration is NOT applied, apply only step 3. It needs no restart. Until then a request for
more than 10 s is answered with "couldn't start the video" and no GPU job is made. Clips up to 10 s work as
before.

5. Canary, one job at a time: 30 s, then 60 s, then 120 s. After each, note the file size and render time.
   If step 4 runs before step 3, a long request is answered with "couldn't start the video" and no GPU job.

No frontend change is needed: the web app and the phone show whatever length the job has.

## S22 phone app

The phone's Chat is native: a web update does not change it. It needs a new APK built from the frontend at
`7e7ec20` (S22 fixes `7f63d52`, video routing `49b4a36`, discreet Public `7e7ec20`). The pinned build branch
and the guarded `android-refresh.sh` steps are prepared in the S22 repair work (PR #50), not here. No build
or USB install happens without the owner.

## Order of ways back
120 s: enable-rollback → backend rollback → migration undo. Then:

Hotfix rollback (if applied) → 6 enable-rollback → 5 web rollback → 4 worker-rollback → 3 backend-rollback → 2 undo SQL → 1 remove the
forward. The images release stays as it is throughout.

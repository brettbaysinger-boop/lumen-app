# Local image and short video generation

**Status (2026-11-16):** implemented and tested with fakes only. Nothing has run against Heavy,
the live database or a phone. Not deployed.

## What exists and what is reused

| Capability | Service on Heavy | How Lumen reaches it | State |
|---|---|---|---|
| Still images (default) | ComfyUI + **BigLust SDXL v1.6** (`backend/workflows/biglust-sdxl-v16-api.json`, `COMFYUI_CHECKPOINT`) | `images.py`, `companion_images.py` | `bigLust_v16.safetensors` on Heavy; GPU canary PASSED 2026-11-16; images-only release in PR #52 |
| Still images (previous) | ComfyUI + FLUX.2 Klein (`flux2-klein-4b-fp8.json`) | same | Worked live 2026-10-09 |
| Image to video | FramePack-Studio (Gradio) on Heavy `127.0.0.1:7863` (owner discovery 2026-11-16) | `video_providers.FramePackStudioProvider` (`FRAMEPACK_API_NAME=/handle_start_button`) | Adapter written and fake-tested; no GPU run |
| Text to video | Wan2.2 ComfyUI workflow, if exported | `video_providers.run_comfy_video_workflow` | New; no Wan2.2 workflow found in any repo |
| Text to video without Wan2.2 | BigLust SDXL still, then FramePack | `media_jobs.run_video_job` (`t2i2v`) | New, not run on Heavy |

Local Media Studio is retired (owner, 2026-11-16) and is not a dependency or integration target.
Lumen talks only to ComfyUI and FramePack directly, from the backend.

FramePack-Studio's API labels, Generation Type choices and defaults are owner-verified (see
Readiness). The adapter checks that exact contract before every use; `scripts/check-framepack-endpoint.py
--api-name /handle_start_button` shows whether it fits the real install before anything is enabled.

## Flow

1. A Private chat turn asks for a video ("make a short video of…", "animate this"), or the companion
   emits `{"action":"generate_video",…}` inside `<lumen_image_action>`.
2. `media_jobs.plan_video_job` checks Private mode, configuration, safety, length (≤ 10 s; five-minute
   requests get a "separate feature" reply) and a per-user limit of 2 unfinished jobs. No GPU work.
3. The reply is saved with `metadata.media_job`; the job row goes to `media_generation_jobs`.
4. lumen-api only links the job to the saved reply and returns. Nothing renders in lumen-api.
5. The video worker (`python -m lumen.media_worker`, its own systemd service) takes the job: it makes
   or reads the start frame, asks ComfyUI to free VRAM (`POST /free`, both share the 16 GB GPU) and
   submits ONE job to FramePack-Studio's own queue. FP-Studio's job id is stored on the row at once.
6. Every `VIDEO_POLL_SECONDS` (default 20) it looks at that job through `monitor_job(<id>)` for a few
   seconds and closes the stream (Gradio stops the server-side generator on disconnect; checked on
   Gradio 5.25.2). A render may take hours: the budget is `VIDEO_RENDER_BUDGET_SECONDS` (default 4 h).
7. Finished: the clip goes to private `chat-media` at a fixed path (`<user id>/video-<job id>.mp4`),
   is attached to the reply and registered in Gallery (`media_type = video`). Delivery is idempotent,
   so a crash mid-delivery is simply delivered again on the next pass.
8. The app polls `GET /v0.3/media/jobs/{id}?privacy_mode=private`: every 4 s for 2 minutes, then
   15 s, then 30 s; paused in the background and checked at once when the app comes back.

Restarts: lumen-api restarts don't touch jobs. A worker restart looks at the same FP-Studio job again
and never re-submits. A job claimed but without an FP-Studio id after 10 minutes is failed (it may or
may not have reached Heavy, and sending it again could render it twice). Heavy unreachable: the job
stays, its stage says so, and the worker keeps looking. Past the budget the job is reported as not
finished; nothing is cancelled on Heavy (FP-Studio has no per-job cancel, `end_process` is global).
If FP-Studio itself restarts, it no longer knows a finished job ("No job ID provided"), so the job
fails with its FP-Studio id; `scripts/framepack-studio-job-output.py` recovers that file read-only.

Clear picture requests ("send me a selfie") are now honoured in Private even when the local model
answers in prose without its image action (the likely cause of the S22 "the image didn't come
through" reply, see below).

## Privacy

* Generation runs in Private only, enforced in the backend: Public turns get a discreet reply
  (`privacy_mode.private_request_kind` → `media`), the runtime refuses model-emitted actions before
  any provider call, and the job routes return 403 in Public.
* `media_generation_jobs` has RLS on and no client policies; only the backend reads it.
* Gallery now reads nothing and shows a lock while Public is on (it read all items before).
* Heavy's URLs live only in the backend `.env`; `/v0.3/media/capabilities` returns booleans.

## Content rules (`media_safety.py`), exactly as they stand

Owner directive 2026-11-16: BigLust and FramePack are private local tools. Adult nudity and erotic
material of consenting fictional adults is generated as asked. There is no NSFW filter, no cloud
moderation, no safe mode and no new dependency, and the user's prompt is not rewritten.

**Refusals** (backend, before any GPU work, every image and video path). Each needs a sexual/nude
word in the prompt *and* one of:
1. a minor signal: child/kid/minor/underage/teen words, an age under 18 ("16 years old", "15yo",
   "aged 12"), school-child framing (schoolgirl, school uniform, high school...), loli/shota,
   "little/young girl/boy", "barely legal", "young-looking", "childish body";
2. a real, identifiable person: celebrity/famous, "real person"/real-life/irl, lookalike, deepfake,
   face swap, "photo/picture of my ...", or "my" + a relationship (wife, girlfriend, coworker, friend,
   sister...);
3. stated non-consent: rape, non-consensual, "without (her) consent", "against her will",
   "forced to/into/sex", coercion, drugged, unconscious, incapacitated, blackmail, hidden camera,
   spy cam, upskirt, voyeur, revenge porn;
4. or, for video only, an uploaded photo as the source (it can show a real person).

Narrowed on 2026-11-16 (these no longer cause a refusal): occupations (actress, singer, royal,
athlete...), "baby", son/daughter/niece/nephew/step-family words, "flat-chested", "petite young",
plain "elementary", "N years" without "old" (anniversaries), "sleeping"/"asleep"/"passed out",
bare "forced" (e.g. forced perspective).

**Transformations that remain** (only on the negative side; the positive prompt is untouched):
* Stills and video: `COMFYUI_NEGATIVE_PROMPT` is the only negative prompt Lumen sends (ComfyUI
  `{{LUMEN_NEGATIVE}}`, FramePack's Negative Prompt). **The default still modifies it:** quality terms
  plus "child, minor, underage, teen, childlike body". An owner-set value takes precedence and is used
  verbatim with nothing appended; an empty value sends no negative prompt. (The separate automatic
  video negative `ADULT_NEGATIVE` was removed.)
* Companion images: the companion's own visual identity is added to the prompt when the request is
  about the companion (an existing feature, not a safety rule).

Known false-positive risk that is still in rule 2: "my girlfriend"/"my wife" also blocks a request
that means the Lumen companion itself. Owner decision.

Public vs Private is about who can see the screen, not content: generation and media are Private-only.
Keyword rules are a backstop and can misfire; each refusal names the rule so it can be rephrased.

## Readiness (owner-supplied Heavy discovery, 2026-11-16)

### BigLust still images: LIVE in production (PR #52), Private Chat → Gallery accepted 2026-11-16
* Verified (read-only, on Heavy): ComfyUI 0.39.0 at `127.0.0.1:8188`, RTX 5060 Ti;
  `CheckpointLoaderSimple` lists exactly one checkpoint, `bigLust_v16.safetensors`; all six nodes
  of `biglust-sdxl-v16-api.json` are installed.
* Settings: `COMFYUI_WORKFLOW=<checkout>/backend/workflows/biglust-sdxl-v16-api.json`,
  `COMFYUI_CHECKPOINT=bigLust_v16.safetensors`. No other checkpoint is needed.
* Route verified (owner, from the lumen-api host): lumen-api's existing private `COMFYUI_URL`
  answers `/system_stats` with ComfyUI 0.39.0. It is reused as is; no new ComfyUI route is needed.
  The live backend has `COMFYUI_URL` and `COMFYUI_WORKFLOW` set, `COMFYUI_CHECKPOINT` not yet set
  (the current workflow does not need it; the BigLust one does).
* PASSED (owner, 2026-11-16): isolated GPU canary `canary-comfyui-image.py --run-gpu` through the
  live `COMFYUI_URL`: model `bigLust_v16.safetensors`, 832x1216, about 23 s.
* Next, owner-gated: the images-only backend release in PR #52 (`release/biglust-images-20261116`,
  on the live S22 release). Steps, backup/rollback and the Private Chat → Gallery canary are in
  `docs/biglust-images-release.md` on that branch. No migration, no frontend, video off.
* Applied in production by the owner on 2026-11-16 and accepted: Private Chat → Gallery, model
  `bigLust_v16.safetensors`, 12.34 s. The live Gallery Public-mode lock is NOT deployed yet.
* UNTESTED, flagged: this PR's inline frontend video (`StoredVideo`, `MediaJobStatus`, Gallery video
  playback and Public lock) has run only in a desktop browser against fakes. It is not in the images
  release and must be tested independently before it ships.

### FramePack-Studio video: one real GPU render on Heavy (canary 3), adapter fixed after it
* Verified by the owner (read-only `/gradio_api/info` and `/config` on Heavy `127.0.0.1:7863`):
  `/handle_start_button` has 29 inputs in a fixed order; Generation Type choices are Original,
  Original with Endframe, F1, Video, Video with Endframe, Video F1 (default Original); Caching
  strategy MagCache/TeaCache/None (default MagCache); Latent Image default Noise. Outputs start
  with Finished Frames Video and Current Job ID. `/monitor_job` takes the job id.
* Job lifecycle, from FramePack-Studio's source (`modules/interface.py`, `studio.py`,
  `modules/video_queue.py`, upstream commit b07b77a; Heavy's exact version not yet confirmed):
  `/handle_start_button` only adds a job to FP-Studio's queue and returns its uuid at once.
  `/monitor_job` streams that job's video, progress text and bar until Completed, Error or
  cancelled, but it always switches to whichever job is running. Files are named
  `<FP-Studio run stamp>_<frames>.mp4` (for example `261116_095453_817_1084_19.mp4`; the worker
  names files after its own timestamp, not the queue uuid) in FP-Studio's output folder, served through
  Gradio's file route. Ownership comes from `monitor_job(<our job id>)`, which reports that job's own
  `job.result`; a switch to another job, or videos from two run stamps, fail the request.
  There is no per-job cancel in the API; `end_process`/`end_process_with_update` cancel the
  current job globally.
* The adapter (`FramePackStudioProvider`, selected only by `FRAMEPACK_API_NAME=/handle_start_button`):
  1. Checks the exact contract from `/info` first (29 labels in order, Original offered, monitor
     and current-job endpoints present). Any difference refuses before anything is uploaded.
  2. Refuses if FP-Studio is already running a job (`/check_for_current_job_and_monitor`).
  3. Uploads the start frame and queues one job: Original, start frame only (no video input, no
     end frame), prompt, negative, fixed seed, randomize off, the requested length, no LoRAs; every
     other input keeps FP-Studio's own default (640x640, 25 steps, MagCache...).
  4. Requires a uuid job id, then follows only that job. A video is accepted only if its file name
     starts with that job id; a switch to another job, an error or a cancel fails the request.
  5. Never calls `end_process`, `end_process_with_update`, `/partial` or any clear/cancel endpoint.
     A Lumen timeout leaves the job in FP-Studio's queue (the owner can cancel it in its UI) and
     names its job id in the failure. The old `/process` client's global stop on timeout is removed.
* Privacy and concurrency: unchanged Lumen rules. Video jobs are Private-only, backend-only and
  service-role scoped to the owner; one Lumen GPU job at a time (`GPU_LOCK`); a per-user limit on
  queued/running jobs. FP-Studio's URL never leaves the backend.
* Known limit: if someone queues another FP-Studio job by hand while Lumen's is running, the
  monitor can switch to it before Lumen sees "Completed"; Lumen then fails closed instead of
  returning the wrong video.
* Read-only check (no upload, no queue): `python3 scripts/check-framepack-endpoint.py --url
  http://127.0.0.1:7863 --api-name /handle_start_button` prints the 29 values Lumen would send.
* Gated GPU canary (owner approval, video still off in Lumen). Run on Lumen, as the lumen-api user,
  with the live backend venv and the adapter pinned at `60b2930`. FP-Studio stays on Heavy's loopback;
  a temporary SSH forward is opened for the canary only and closed after (`<heavy>` = the SSH host you
  already use from Lumen to Heavy):

  ```
  git clone https://github.com/brettbaysinger-boop/lumen-app.git ~/lumen-fps-canary && git -C ~/lumen-fps-canary checkout -q --detach 60b2930
  ssh -f -N -o ExitOnForwardFailure=yes -L 127.0.0.1:17863:127.0.0.1:7863 <heavy>
  cd ~/lumen-fps-canary && /home/brett/lumen-push/backend/.venv/bin/python scripts/canary-framepack-studio.py --run-gpu \
    --url http://127.0.0.1:17863 --comfy-url http://127.0.0.1:18188 \
    --image /tmp/raialume-biglust-8k5z36zq/lumen-canary.png --seconds 3 --out /tmp/lumen-fps-canary
  pkill -f 'L 127.0.0.1:17863:127.0.0.1:7863'
  ```

  It checks the 29-input contract (read-only), asks ComfyUI to unload BigLust (as Lumen's video jobs
  do), refuses if FP-Studio is busy, queues one 3-second Original job, follows only that job, writes
  `/tmp/lumen-fps-canary/lumen-fps-canary.mp4` and prints JSON (result, FP-Studio job id, latency, bytes,
  sha256). It never calls a stop/clear/cancel endpoint; if it times out, the job stays in FP-Studio's queue.
* Recover the clip from hardware canary 3 (758c2b3), no GPU: FP-Studio already wrote
  `outputs/261116_095453_817_1084_19.mp4`. This read-only check takes FP-Studio's own record
  (`queue.json[<job id>].result`) for the canary's job id, and copies the file only if the entry is a
  clean completion, the name is FP-Studio's output naming, the file is an MP4 in `outputs/`, and it was
  written during that job's run. It never lists the folder to guess. From the Lumen canary checkout:

  ```
  scp ~/lumen-fps-canary/scripts/framepack-studio-job-output.py /tmp/raialume-biglust-8k5z36zq/lumen-canary.png <heavy>:/tmp/
  ssh <heavy> 'cd /data/ai-media-studio/FP-Studio && <FP-Studio python> /tmp/framepack-studio-job-output.py --queue-json queue.json --job-id 0bb4dd05-9f03-4837-86d8-5c62f2f9b544 --expect-image /tmp/lumen-canary.png --copy-to /tmp/lumen-fps-canary'
  ```

  Identity is checked, not assumed: the job's prompt must equal the canary prompt (compared, never
  printed), its length 3 s, and with `--expect-image` the decoded pixels of FP-Studio's saved start
  frame (`queue_images/<job id>_input.png`) must equal the canary PNG (`<FP-Studio python>` = the
  Python FP-Studio runs with, which has Pillow). MATCH copies the clip; MISMATCH means a real render
  that is not this canary, and copies nothing; REFUSED prints why.
* Hardware canary 3 (758c2b3, 2026-11-16) rendered on the GPU: FP-Studio's queue.json has job
  `0bb4dd05-…` completed with `result` `outputs/261116_095453_817_1084_19.mp4` (836,627 bytes, H.264
  512×768, 2.43 s). The adapter rejected it because it expected `<uuid>_` names; fixed in 34f10dd.
* Still open: the unattended private route from the worker to FP-Studio; Chat/Gallery delivery and
  playback of video on the S22. `VIDEO_GENERATION_ENABLED` stays false until a real canary passes and the
  owner approves.

### Private route to FramePack-Studio (owner decision, host step)
The worker needs an unattended route to Heavy's loopback `7863`. The manual `ssh -L` used for the
canary asks for a key passphrase and closes, so it can't serve the worker. Recommended: the same
mechanism that already gives lumen-api `COMFYUI_URL` (`127.0.0.1:18188` on Lumen), with one more
forward, `127.0.0.1:17863 → Heavy 127.0.0.1:7863`. Then `FRAMEPACK_URL=http://127.0.0.1:17863`.
It must stay private (loopback on both ends, nothing on a public interface, no SSH or Tailscale
setting weakened), and the existing ComfyUI route must not be changed.

### Gated step A: isolated BigLust canary (no service, database or app change)
On the lumen-api host, from a throwaway checkout of this PR (never the live checkout):
```bash
git clone --branch feat/local-media-generation-20261116 https://github.com/brettbaysinger-boop/lumen-app /tmp/lumen-pr51
cd /tmp/lumen-pr51 && <live-checkout>/backend/.venv/bin/python scripts/canary-comfyui-image.py --run-gpu \
  --env-file <live-checkout>/backend/.env --workflow backend/workflows/biglust-sdxl-v16-api.json \
  --checkpoint bigLust_v16.safetensors --out /tmp/lumen-canary
```
It uses lumen-api's existing `COMFYUI_URL` (read from its `.env`, never printed or changed).
PASS means one 832×1216 PNG whose model is `bigLust_v16.safetensors`. It runs one GPU job on Heavy
(about 30 SDXL steps) and writes only `/tmp/lumen-canary/lumen-canary.png`. Rollback: none needed;
delete `/tmp/lumen-pr51` and `/tmp/lumen-canary`. Chat/Gallery delivery is tested later, after the
backend step, and needs its own go-ahead with backup and rollback commands.

## Still-image default: BigLust SDXL v1.6

All still images (direct Chat requests, companion-initiated images, and the first frame of
text-to-video) go through the one workflow named by `COMFYUI_WORKFLOW`. The SDXL graph is a
standard checkpoint graph: `CheckpointLoaderSimple` (UNet, CLIP and VAE from the checkpoint),
positive and negative `CLIPTextEncode`, `EmptyLatentImage` 832×1216, `KSampler` 30 steps,
CFG 6, `dpmpp_2m_sde`/`karras`, `VAEDecode`, `SaveImage`. The checkpoint filename is not
guessed: it is set in `COMFYUI_CHECKPOINT`, and a workflow with `{{LUMEN_CHECKPOINT}}` refuses
to run without it. Each message records the loaded checkpoint as its image model (provenance).
Sampler, steps and size can be tuned in the JSON after the canary.

Read-only check on Heavy (queues nothing, loads nothing):

```bash
python3 scripts/check-comfyui-image-workflow.py --url http://127.0.0.1:8188 \
  --workflow backend/workflows/biglust-sdxl-v16-api.json --checkpoint '<exact filename>'
```

It lists every checkpoint, flags BigLust candidates, and prints `RESULT: READY` only when the named
checkpoint and every node exist.

## Host setup (owner, after review)

Superseded by the staged guide `docs/video-release.md`; the steps below are kept for reference.

1. Apply `supabase/migrations/20261116100000_media_generation_jobs.sql` (new table; `chat-media`
   accepts MP4/WebM up to 50 MB).
2. On Heavy, read-only: `python3 scripts/check-framepack-endpoint.py --url http://127.0.0.1:7863
   --api-name /handle_start_button`. It must say the adapter contract is OK. Then the gated GPU
   canary in Readiness. Set `FRAMEPACK_API_NAME=/handle_start_button`.
3. Backend `.env`: `COMFYUI_WORKFLOW=<repo>/backend/workflows/biglust-sdxl-v16-api.json`,
   `COMFYUI_CHECKPOINT=<exact name from the check>`, `VIDEO_GENERATION_ENABLED=true` (only after the FramePack-Studio canary and owner approval),
   `FRAMEPACK_URL=http://127.0.0.1:17863` (the loopback forward from stage 1 of docs/video-release.md).
   Optional: `COMFYUI_T2V_WORKFLOW=/path/wan22_t2v_api.json` exported with "Save (API)" and these
   exact string values: `{{LUMEN_PROMPT}}`, optionally `{{LUMEN_NEGATIVE}}`, `{{LUMEN_SEED}}`,
   `{{LUMEN_FRAMES}}` (4n+1), `{{LUMEN_FPS}}`; output through VideoHelperSuite or SaveVideo as MP4/WebM.
4. Video worker service, with the same user, working directory and environment as lumen-api (copy
   those lines from `systemctl cat lumen-api`):
   ```
   # /etc/systemd/system/lumen-media-worker.service
   [Unit]
   Description=Lumen video worker (follows FramePack-Studio jobs)
   After=network-online.target lumen-api.service
   [Service]
   User=<as lumen-api>
   WorkingDirectory=<live checkout>/backend
   EnvironmentFile=<as lumen-api>
   ExecStart=<live checkout>/backend/.venv/bin/python -m lumen.media_worker
   Restart=always
   RestartSec=10
   [Install]
   WantedBy=multi-user.target
   ```
   With `VIDEO_GENERATION_ENABLED=false` it logs "nothing to do" and exits; enable it with video.
   Optional: `VIDEO_RENDER_BUDGET_SECONDS` (default 14400, max 86400), `VIDEO_POLL_SECONDS` (20).
5. Restart `lumen-api`, start `lumen-media-worker`. Canary in Private: "animate this" on a generated
   image, 3 seconds.
6. Real S22 acceptance (not covered by these tests): progress shows, the clip plays inline in Chat and
   in Gallery, Public hides both.

## Release gates (owner decides each)

Done: BigLust images (PR #52) applied in production and accepted on 2026-11-16 (Private Chat → Gallery).
Everything for video is in **`docs/video-release.md`** and `scripts/video-release.sh`. Each stage has a
hard STOP and a way back, built for what is live (S22 `7f63d52` HEAD with the images patch in the
working files):
0. provenance MATCH on Heavy;
1. the private FP-Studio route (same mechanism as 18188);
2. migration;
3. backend with video off;
4. worker unit;
5. web app with the Gallery Public lock (`release/video-frontend-20261116`);
6. enable, then the live and S22 canary.

PR #51 as a whole never goes through the frontend-only updater (live blob `97e032f`, unchanged). Only
the frontend-only branch does. PR #50 stays the isolated phone repair.
Not production-ready until the S22 canary in stage 6 passes.

## Not done

* Five-minute video (segmentation, continuity, stitching): separate capability.
* Cancelling a running job from the app.
* Time estimates: none are shown until real render times are measured.
* The worker frees ComfyUI's VRAM when it submits; if FP-Studio's queue is long, an image request in
  between can load BigLust again before FP-Studio starts. Not seen yet; watch for out-of-memory.
* The durable worker, polling and delivery are tested with fakes and the submit/check/download calls
  against a real Gradio 5.25.2 stand-in; not yet against Heavy.

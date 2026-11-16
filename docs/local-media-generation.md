# Local image and short video generation

**Status (2026-11-16):** implemented and tested with fakes only. Nothing has run against Heavy,
the live database or a phone. Not deployed.

## What exists and what is reused

| Capability | Service on Heavy | How Lumen reaches it | State |
|---|---|---|---|
| Still images (default) | ComfyUI + **BigLust SDXL v1.6** (`backend/workflows/biglust-sdxl-v16-api.json`, `COMFYUI_CHECKPOINT`) | `images.py`, `companion_images.py` | Owner requirement 2026-11-16; checkpoint not yet confirmed on Heavy |
| Still images (previous) | ComfyUI + FLUX.2 Klein (`flux2-klein-4b-fp8.json`) | same | Worked live 2026-10-09 |
| Image to video | FramePack-Studio (Gradio) on Heavy `127.0.0.1:7863` (owner discovery 2026-11-16) | none yet: needs a dedicated adapter | NOT READY |
| Text to video | Wan2.2 ComfyUI workflow, if exported | `video_providers.run_comfy_video_workflow` | New; no Wan2.2 workflow found in any repo |
| Text to video without Wan2.2 | BigLust SDXL still, then FramePack | `media_jobs.run_video_job` (`t2i2v`) | New, not run on Heavy |

Local Media Studio is retired (owner, 2026-11-16) and is not a dependency or integration target.
Lumen talks only to ComfyUI and FramePack directly, from the backend.

FramePack's port, Gradio API name and input labels are **not verified**. The client matches inputs
by label (image, prompt, negative prompt, seed, length) and keeps every other input at the
install's own default; `scripts/check-framepack-endpoint.py` shows whether that mapping fits the
real install before anything is enabled.

## Flow

1. A Private chat turn asks for a video ("make a short video of…", "animate this"), or the companion
   emits `{"action":"generate_video",…}` inside `<lumen_image_action>`.
2. `media_jobs.plan_video_job` checks Private mode, configuration, safety, length (≤ 10 s; five-minute
   requests get a "separate feature" reply) and a per-user limit of 2 unfinished jobs. No GPU work.
3. The reply is saved with `metadata.media_job`; the job row goes to `media_generation_jobs`.
4. The job runs in the API process, one at a time (`GPU_LOCK`). Before FramePack, ComfyUI is asked to
   free VRAM (`POST /free`) because both share the 16 GB GPU.
5. The clip goes to private `chat-media` storage (`<user id>/<uuid>.mp4`), is attached to the reply and
   registered in Gallery as `media_type = video`.
6. The app polls `GET /v0.3/media/jobs/{id}?privacy_mode=private` and shows progress in the bubble.

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

## Content limits (`media_safety.py`)

Adult content is allowed for fictional adults. Hard blocks, before any GPU work, for every image and
video path: sexual or nude content with any sign of a minor; sexual or nude content of real or
identifiable people; non-consent; intimate video made from an uploaded photo. Allowed adult prompts
get an explicit adult-age line and an anti-minor negative prompt where the workflow supports one.
Keyword checks are a backstop, not a classifier.

## Readiness (owner-supplied Heavy discovery, 2026-11-16)

### BigLust still images: GPU canary PASSED, Chat/Gallery delivery UNTESTED
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
* UNTESTED: Chat and Gallery delivery with BigLust; desktop and S22 display.
* UNTESTED, flagged: this PR's inline frontend video (`StoredVideo`, `MediaJobStatus`, Gallery video
  playback and Public lock) has run only in a desktop browser against fakes. It is not in the images
  release and must be tested independently before it ships.

### FramePack video: NOT READY
* Verified: a FramePack-Studio Gradio app on Heavy `127.0.0.1:7863`. It has no `/process`; its
  generation endpoints are `/handle_start_button` (generation type, optional start frame, video
  input, end frame, prompt, negative prompt, seed, length and many more) and `/partial`, plus
  queue, monitoring and cancel endpoints.
* Lumen's client only fits the simple FramePack demo (one image input, `/process`, video in the
  call result). It now refuses FramePack-Studio's shape (`FramePackNeedsAdapter`) instead of
  guessing. Video stays off (`VIDEO_GENERATION_ENABLED=false`).
* Next, read-only: `python3 scripts/check-framepack-endpoint.py --url http://127.0.0.1:7863
  --api-name /handle_start_button --dump /tmp/fp-studio-api.json` on Heavy, then share the JSON.
  The adapter (generation mode, required fields, job id, queue polling, output file, cancel) is
  written against that file, then tested with one short canary.
* UNTESTED: everything about video generation, delivery and playback.

### Private route to FramePack-Studio (decision needed later)
ComfyUI already has a working private route (above). FramePack-Studio listens on Heavy's loopback
`7863`; how lumen-api reaches it is open until the adapter exists. It must stay private, and the
existing ComfyUI route must not be changed.

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

1. Apply `supabase/migrations/20261116100000_media_generation_jobs.sql` (new table; `chat-media`
   accepts MP4/WebM up to 50 MB).
2. On Heavy, read-only: find the FramePack install that is actually running (its service or process
   and port), then run `python3 scripts/check-framepack-endpoint.py --url http://127.0.0.1:<port>`.
   It lists the named endpoints and inputs and says whether Lumen can fill them. Set
   `FRAMEPACK_API_NAME` if the endpoint is not `/process`.
3. Backend `.env`: `COMFYUI_WORKFLOW=<repo>/backend/workflows/biglust-sdxl-v16-api.json`,
   `COMFYUI_CHECKPOINT=<exact name from the check>`, `VIDEO_GENERATION_ENABLED=true`, `FRAMEPACK_URL=<verified FramePack URL>`.
   Optional: `COMFYUI_T2V_WORKFLOW=/path/wan22_t2v_api.json` exported with "Save (API)" and these
   exact string values: `{{LUMEN_PROMPT}}`, optionally `{{LUMEN_NEGATIVE}}`, `{{LUMEN_SEED}}`,
   `{{LUMEN_FRAMES}}` (4n+1), `{{LUMEN_FPS}}`; output through VideoHelperSuite or SaveVideo as MP4/WebM.
4. Restart `lumen-api` only. Canary in Private: "animate this" on a generated image, 3 seconds.
5. Real S22 acceptance (not covered by these tests): progress shows, the clip plays inline in Chat and
   in Gallery, Public hides both.

## Release gates (not authorized; owner decides each)

PR #51 changes the backend, the database and the frontend, so it can never go out through the
frontend-only updater (`scripts/animated-web-update.sh`, live blob `97e032f`, unchanged). That
updater refuses its backend, migration and operator-script files by design
(`tests/media-jobs.test.cjs`). PR #50 stays the isolated phone repair and ships on its own.

Proposed order, each a separate owner go-ahead, after #50 is accepted on the S22:
1. Read-only Heavy evidence: `check-comfyui-image-workflow.py` (BigLust checkpoint and nodes) and
   `check-framepack-endpoint.py` (operational FramePack install). Nothing changes.
2. Migration only (new table, video MIME types), needed only for video. Nothing reads it until video.
3. Images first, from PR #52 (prepared, not run): BigLust backend change only, no migration, video
   off, `COMFYUI_WORKFLOW`/`COMFYUI_CHECKPOINT` set to BigLust; restart `lumen-api` only. Canary: one
   Private image appears in Chat and Gallery with the checkpoint as its model. The rest of this PR's
   backend (video jobs, runtime changes) follows later with `VIDEO_GENERATION_ENABLED=false`.
4. Frontend web build (chat video player, progress, Gallery lock) through the existing guarded path.
5. Turn video on; canary: a 3-second image-to-video in Private, then on the S22.
Not production-ready until the S22 tests in step 5 pass.

## Not done

* Five-minute video (segmentation, continuity, stitching): separate capability.
* Cancelling a running job from the app.
* Jobs do not survive an API restart; unfinished ones are marked failed on next use.
* BigLust filename and a generated image are verified on Heavy. The FramePack-Studio adapter, its
  API labels and a video canary are not; FramePack-Studio stays a separate later step.

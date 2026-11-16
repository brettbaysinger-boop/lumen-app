# Local image and short video generation

**Status (2026-11-16):** implemented and tested with fakes only. Nothing has run against Heavy,
the live database or a phone. Not deployed.

## What exists and what is reused

| Capability | Service on Heavy | How Lumen reaches it | State |
|---|---|---|---|
| Still images (default) | ComfyUI + **BigLust SDXL v1.6** (`backend/workflows/biglust-sdxl-v16-api.json`, `COMFYUI_CHECKPOINT`) | `images.py`, `companion_images.py` | Owner requirement 2026-11-16; checkpoint not yet confirmed on Heavy |
| Still images (previous) | ComfyUI + FLUX.2 Klein (`flux2-klein-4b-fp8.json`) | same | Worked live 2026-10-09 |
| Image to video | FramePack Gradio app (`demo_gradio.py`, port 7862 per Local Media Studio's inventory) | `video_providers.FramePackProvider` (Gradio HTTP API) | New, not run on Heavy |
| Text to video | Wan2.2 ComfyUI workflow, if exported | `video_providers.run_comfy_video_workflow` | New; no Wan2.2 workflow found in any repo |
| Text to video without Wan2.2 | BigLust SDXL still, then FramePack | `media_jobs.run_video_job` (`t2i2v`) | New, not run on Heavy |

Local Media Studio is a browser page that calls ComfyUI directly (AnimateDiff templates); it has no
backend to reuse. Its `scripts/inventory_heavy_readonly.sh` is the read-only way to confirm the
FramePack port and API names.

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
2. On Heavy, run Local Media Studio's `scripts/inventory_heavy_readonly.sh`. Confirm FramePack's port,
   that `/gradio_api/info` lists `/process`, and its input labels (Image, Prompt, Negative Prompt,
   Seed, Total Video Length (Seconds), …).
3. Backend `.env`: `COMFYUI_WORKFLOW=<repo>/backend/workflows/biglust-sdxl-v16-api.json`,
   `COMFYUI_CHECKPOINT=<exact name from the check>`, `VIDEO_GENERATION_ENABLED=true`, `FRAMEPACK_URL=http://<heavy>:7862`.
   Optional: `COMFYUI_T2V_WORKFLOW=/path/wan22_t2v_api.json` exported with "Save (API)" and these
   exact string values: `{{LUMEN_PROMPT}}`, optionally `{{LUMEN_NEGATIVE}}`, `{{LUMEN_SEED}}`,
   `{{LUMEN_FRAMES}}` (4n+1), `{{LUMEN_FPS}}`; output through VideoHelperSuite or SaveVideo as MP4/WebM.
4. Restart `lumen-api` only. Canary in Private: "animate this" on a generated image, 3 seconds.
5. Real S22 acceptance (not covered by these tests): progress shows, the clip plays inline in Chat and
   in Gallery, Public hides both.

## Not done

* Five-minute video (segmentation, continuity, stitching): separate capability.
* Cancelling a running job from the app.
* Jobs do not survive an API restart; unfinished ones are marked failed on next use.

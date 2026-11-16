# BigLust SDXL still images: owner-gated backend release (images only)

Status 2026-11-16: **prepared, not run.** Nothing here has touched the live server. Every step below is
run by the owner. Video stays off; FramePack-Studio is a separate later step; Local Media Studio is
retired and plays no part.

Evidence so far: the owner's isolated GPU canary (`scripts/canary-comfyui-image.py --run-gpu`) PASSED on
Heavy through the live `COMFYUI_URL` route: `bigLust_v16.safetensors`, 832x1216, about 23 s.

## What this release is

Branch `release/biglust-images-20261116`, one commit `0bf2394` on top of the live S22 release `7f63d52`
(PR #50 / R4). Backend only:

| File | Change |
| --- | --- |
| `backend/workflows/biglust-sdxl-v16-api.json` | new SDXL API workflow (checkpoint, prompt, negative, seed sentinels) |
| `backend/lumen/images.py` | fills `{{LUMEN_CHECKPOINT}}` / `{{LUMEN_NEGATIVE}}`; refuses if the checkpoint is unset; provenance names the checkpoint |
| `backend/lumen/config.py` | two settings: `comfyui_checkpoint`, `comfyui_negative_prompt` (anti-minor terms always kept) |
| `backend/lumen/media_safety.py` | hard blocks: minors, real identifiable people, non-consent |
| `backend/lumen/companion_images.py`, `backend/lumen/main.py` | run that safety check before any provider call (422 with a plain refusal) |
| tests, `scripts/canary-comfyui-image.py`, `scripts/check-comfyui-image-workflow.py` | tests and the read-only/canary tools |

Not in it: `runtime.py`, `privacy_mode.py`, any video code, the `media_generation_jobs` migration, the
frontend, systemd units, RMC or its gateway, lumen-web, the Android build. **No migration is needed**:
still images already use `chat-media` and `gallery_items`.

`.env` change (lumen-api's own `.env`, nothing else in it changes):

```
COMFYUI_WORKFLOW=<live checkout>/backend/workflows/biglust-sdxl-v16-api.json
COMFYUI_CHECKPOINT=bigLust_v16.safetensors
```

`COMFYUI_URL` stays exactly as it is (the live route that works). `VIDEO_GENERATION_ENABLED` does not exist
in this release, so video is off by construction.

## Steps (owner, on the Lumen host)

1. Clean clone of the release branch, anywhere outside the live checkout:

   ```
   git clone -b release/biglust-images-20261116 <repo> ~/lumen-biglust-release
   cd ~/lumen-biglust-release
   ```

2. Read-only check. It confirms the live target files are the S22 release byte for byte, the `.env` has
   `COMFYUI_URL`, systemd does not set the ComfyUI keys, lumen-api is healthy and serves Public/Private,
   and runs the full backend test suite on a throwaway patched copy of the live backend:

   ```
   scripts/biglust-images-release.sh check
   ```

   It ends with `READY` and the exact apply command, including a 12-character patch id.
   If it says `NOT READY`, stop and send me the output.

3. Apply (backs up every touched file and the `.env` with sha256 first, restarts lumen-api only, checks
   health and Public/Private; any failure restores the backup automatically):

   ```
   BIGLUST_RELEASE_CONFIRM=images:<patch id from check> scripts/biglust-images-release.sh apply
   scripts/biglust-images-release.sh status
   ```

   `status` should show `state: applied` and `effective: bigLust_v16.safetensors biglust-sdxl-v16-api.json url-set video-off`.

4. Way back at any time, byte for byte:

   ```
   BIGLUST_RELEASE_CONFIRM=images-rollback scripts/biglust-images-release.sh rollback
   ```

Defaults: `LIVE_DIR=/home/brett/lumen-push`, `LUMEN_API_URL=http://127.0.0.1:8001`, Python from
`$LIVE_DIR/backend/.venv`. Override them with environment variables if the host differs. Run as the user
lumen-api runs as; `sudo` is used only for `systemctl restart lumen-api`. Backups live in
`~/.local/state/lumen-biglust-release/<timestamp>/` (mode 700).

## Private Chat → Gallery canary (after step 3)

Use a phrase the live client already routes straight to image creation (it starts with draw, sketch,
illustrate, render or paint). The live build's chat does not yet force generation for other phrasings
such as "send me a selfie"; that fix is in PR #51's `runtime.py` and is not part of this release.

1. Desktop web, **Private** mode: `Draw a lighthouse on a cliff at sunset`.
   Expect a "creating" state, then the image in Chat within about a minute. Tap the reply's Details:
   it should say `Model: bigLust_v16.safetensors`.
2. Open Gallery in Private: the same image is there.
3. Repeat step 1 on the S22 (build 7f63d520f561). Chat overflow and Live Video should behave as before.
4. Safety: `Draw a nude teenager` must be refused with a plain message and no ComfyUI job.
5. Public mode: `Draw a lighthouse` must say image creation is paused in Public.

If anything is wrong, roll back (step 4) and send me the output of `status` and the lumen-api log lines
from the canary window.

## Known gaps, not fixed by this release

- **Live Gallery ignores Public mode.** The live Gallery tab still opens in Public. PR #51's frontend
  locks it, but that frontend is not part of this release and has not been tested on a device. Until it
  ships, avoid opening Gallery in Public in front of others.
- **Inline frontend video (PR #51) is untested.** The `StoredVideo` player and job-status line in Chat
  and Gallery have run only in a desktop browser against fakes, never on the S22 or against a real
  video. Treat it as unverified until it is independently tested; it ships only with the later video step.
- PR #51's frontend must never go out through `scripts/animated-web-update.sh` (frontend-only updater),
  and never bundled with the S22 hotfix.

## How this was tested

- Backend suite on the release branch: 663 passed.
- `scripts/test-biglust-images-release.sh` (offline, stubs for sudo/systemctl/curl, a fake live checkout
  at `7f63d52`): 32/32 pass. It covers check passing, refusals without or with the wrong confirmation,
  a hand-edited live file (refused, untouched), systemd overriding the ComfyUI keys (refused), apply
  changing only the reviewed files and the two `.env` keys (mode 600 kept, `COMFYUI_URL` and RMC lines
  untouched, live HEAD unmoved), byte-for-byte rollback, and automatic restore when health fails after
  the restart.
- Not run: anything on the live host, the Private Chat → Gallery canary, the S22.

# BigLust SDXL still images: owner-gated backend release (images only)

Status 2026-11-16: **applied in production by the owner; live acceptance PASSED.** The owner's
screenshot of desktop web **Private** Chat shows a generated lighthouse image with provider details
`image · comfyui · bigLust_v16.safetensors · completed · 12.34s` and `Model: bigLust_v16.safetensors`, and
the owner confirms the same image is in Gallery. The script's own `check`/`apply`/`status` output has not
been shared here, so it is not quoted. Do not re-run the canary or re-apply. S22 phone check: casual, when
the owner next uses the phone. Video stays off; FramePack-Studio is the next, separate step.

Still open, not fixed by this release: **the live Gallery tab can still show private media in Public
mode.** The Public lock is in PR #51's frontend, which is not deployed.

Evidence so far: the owner's isolated GPU canary (`scripts/canary-comfyui-image.py --run-gpu`) PASSED on
Heavy through the live `COMFYUI_URL` route: `bigLust_v16.safetensors`, 832x1216, about 23 s.

## What this release is

Branch `release/biglust-images-20261116`: code commits `0bf2394`, `c6a6934` (the owner's content
directive) and two test-only commits on top of the live S22 release `7f63d52` (PR #50 / R4). Backend only:

| File | Change |
| --- | --- |
| `backend/workflows/biglust-sdxl-v16-api.json` | new SDXL API workflow (checkpoint, prompt, negative, seed sentinels) |
| `backend/lumen/images.py` | fills `{{LUMEN_CHECKPOINT}}` / `{{LUMEN_NEGATIVE}}`; refuses if the checkpoint is unset; provenance names the checkpoint |
| `backend/lumen/config.py` | two settings: `comfyui_checkpoint`, `comfyui_negative_prompt` (anti-minor terms always kept) |
| `backend/lumen/media_safety.py` | narrow refusals only (see "Content rules" below); the prompt is never rewritten |
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

## Content handling: exact before/after (owner directive 2026-11-16)

This is **not** zero filtering. It is: no NSFW filter, no cloud moderation, no safe mode, no new
dependency, and the user's prompt is passed to BigLust unchanged, with three targeted refusals and one
negative-prompt default. Everything is in `backend/lumen/media_safety.py` and `config.py`.

| | Live now (`7f63d52`) | After this release |
| --- | --- | --- |
| Positive prompt | user text + companion identity when the request is about the companion | **same, nothing added** (the "consenting adults over 25" line from an earlier draft is gone) |
| Negative prompt | none from Lumen (live `images.py` has no `{{LUMEN_NEGATIVE}}` support) | **Yes, a default still modifies it:** `COMFYUI_NEGATIVE_PROMPT` defaults to `lowres, bad anatomy, bad hands, extra fingers, deformed, blurry, watermark, text, child, minor, underage, teen, childlike body`. An owner-set value takes precedence and is used verbatim, with nothing appended; `COMFYUI_NEGATIVE_PROMPT=` (empty) sends no negative at all. This release does not set it, so the default applies until you do. |
| Refusals | none | only when the prompt has a sexual/nude word **and** (a) a minor signal, (b) a real identifiable person, or (c) stated non-consent (word lists below) |
| Public mode | image creation refused (403) | unchanged |

(a) minor: child, kid, minor, underage, teen(ager), tween, adolescent, juvenile, toddler, infant, newborn,
an age under 18 ("16 years old", "15yo", "aged 12"), schoolgirl/schoolboy, school uniform,
middle/high/elementary school, kindergarten, loli/shota/jailbait, little/young girl/boy, "barely legal",
"young-looking", "childish body", and the same words spelled out letter by letter.
(b) real person: celebrity, famous, real person/real-life/irl, lookalike, deepfake, face swap,
"photo/picture of my ...", "my" + wife, girlfriend, boyfriend, partner, ex, boss, coworker, friend,
classmate, teacher, student, crush, family member, roommate, landlord, employee.
(c) non-consent: rape, non-consensual, without (her) consent, against her will, forced to/into/sex,
coercion, drugged, unconscious, incapacitated, blackmail, hidden camera, spy cam, upskirt, voyeur,
revenge porn.

Tested: the positive prompt reaches the workflow byte-identical, and an owner negative prompt (including an
empty one) is used verbatim (`backend/tests/test_sdxl_image_workflow.py`). Tested as **not refused**
(`backend/tests/test_media_safety.py`): "topless woman on a beach at sunset",
"erotic boudoir photo of a redhead woman", "sexy nurse costume", "sexy teacher roleplay, lingerie",
"nude couple in bed, explicit", "a curvy naked woman in a bathtub", "draw yourself nude", "sexy actress
character", "a sleeping nude woman, oil painting", "hey baby ... lingerie", "nude photo with forced
perspective", "an explicit erotic scene between two consenting adults", among others.

Known remaining false positives: "sexy schoolgirl costume" (adult cosplay) and "my girlfriend"/"my wife"
meant as the Lumen companion are refused. Removing either is a one-line change if you want it.

## Operator commands (owner, on the Lumen host, as the lumen-api user)

Read-only check, then apply. `check` prints the exact apply line with its patch id; copy it.

```
git clone -b release/biglust-images-20261116 https://github.com/brettbaysinger-boop/lumen-app.git ~/lumen-biglust-release
cd ~/lumen-biglust-release && scripts/biglust-images-release.sh check
BIGLUST_RELEASE_CONFIRM=images:<patch id printed by check> scripts/biglust-images-release.sh apply
```

Rollback, byte for byte, at any time:

```
cd ~/lumen-biglust-release && BIGLUST_RELEASE_CONFIRM=images-rollback scripts/biglust-images-release.sh rollback
```

What they do: `check` changes nothing; it confirms the live target files equal `7f63d52` byte for byte,
`COMFYUI_URL` is set (value never shown), systemd does not override the ComfyUI keys, lumen-api is
healthy and serves Public/Private, and runs tests on a throwaway patched copy (full suite if the live venv
has pytest, otherwise the new tests with stdlib unittest plus an import of the whole app; nothing is
installed). `apply` backs up the touched files and the `.env` with sha256, applies the reviewed patch to
the working files only, sets `COMFYUI_WORKFLOW` and `COMFYUI_CHECKPOINT=bigLust_v16.safetensors` (no other
`.env` line changes), restarts lumen-api only, checks health and Public/Private, and restores
automatically on any failure. `status` should then show
`effective: bigLust_v16.safetensors biglust-sdxl-v16-api.json url-set video-off`.

Defaults: `LIVE_DIR=/home/brett/lumen-push`, `LUMEN_API_URL=http://127.0.0.1:8001`, Python from
`$LIVE_DIR/backend/.venv`. Backups: `~/.local/state/lumen-biglust-release/<timestamp>/` (mode 700).

## Private Chat → Gallery canary (after apply)

Use a phrase the live client already routes straight to image creation (it starts with draw, sketch,
illustrate, render or paint). The live build's chat does not yet force generation for other phrasings
such as "send me a selfie"; that fix is in PR #51's `runtime.py` and is not part of this release.

1. Desktop web, **Private** mode: `Draw a lighthouse on a cliff at sunset`.
   Expect a "creating" state, then the image in Chat within about a minute. Tap the reply's Details:
   it should say `Model: bigLust_v16.safetensors`.
2. Open Gallery in Private: the same image is there.
3. Repeat step 1 on the S22 (build 7f63d520f561). Chat overflow and Live Video should behave as before.
4. Content rules: `Draw a nude teenager` must be refused with a plain message and no ComfyUI job;
   an adult request such as `Draw a nude elf woman bathing in a forest spring` must be generated as asked.
5. Public mode: `Draw a lighthouse` must say image creation is paused in Public.

If anything is wrong, roll back and send me the output of `status` and the lumen-api log lines
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

- Backend suite on the release branch: 668 passed.
- `scripts/test-biglust-images-release.sh` (offline, stubs for sudo/systemctl/curl, a fake live checkout
  at `7f63d52`): 33/33 pass. It covers check passing (also with a live venv that has no pytest), refusals without or with the wrong confirmation,
  a hand-edited live file (refused, untouched), systemd overriding the ComfyUI keys (refused), apply
  changing only the reviewed files and the two `.env` keys (mode 600 kept, `COMFYUI_URL` and RMC lines
  untouched, live HEAD unmoved), byte-for-byte rollback, and automatic restore when health fails after
  the restart.
- Not run: anything on the live host, the Private Chat → Gallery canary, the S22.

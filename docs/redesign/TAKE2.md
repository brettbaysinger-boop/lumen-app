# Lumen redesign: take 2

Black and warm gold are the default, with silver and existing alternative themes.
The supplied Lumen portrait is included unchanged as a new built-in asset. The
star logo is removed. Conversation uses small, softly translucent portraits that
scroll beside assistant replies instead of a fixed portrait panel.

## What works in the app

- Settings: preset colors, custom background/text/accent hex colors, contrast
  warnings, rounded/circle/oval/frameless portraits, gold/silver/accent frames,
  portrait opacity, animation on/off, and reset. Preferences persist on the
  current device. System reduced-motion preferences are respected.
- Companion: existing name/personality/portrait editing, female/male/nonbinary/
  unspecified identity, and a persistent appearance description used by existing
  image generation. Existing Inner State, goals, beliefs, and self-model remain.
- Voice: discover voices for the configured TTS model on Helios, preview them in
  the browser, and save a companion-specific choice. The backend default remains
  available. Playback uses the saved choice, and portrait speech animation starts
  when audio playback begins.
- Camera: capture a still photo into the existing pending attachment draft.
  Nothing is sent until Send is pressed. Browser cameras require localhost or
  HTTPS; native camera capture has an Expo permission configuration.
- Conversation: streaming replies have a thinking portrait; spoken replies have
  a gentle glow. Names and portrait edits refresh when returning to chat.

## Preview

Open `take2.html` to explore the visual direction with sample content. It has
interactive navigation, colors, and frames and does not contact your services.
The PNGs show the actual Expo app with mocked account/API data, not a live local
session. Facial/lip deformation and speech lip-sync are not implemented; the
current portrait animation uses glow and breathing only. Uploaded portraits are
not automatically analyzed into appearance descriptions.

The camera attaches images through the existing attachment workflow. The current
conversation runtime does not interpret the pixels of those images; vision model
integration remains separate work.

## Install without replacing your local work

Download `lumen-forge-take2.bundle`. With a clean working tree, create a new branch
from your current local integration checkout and import the bundle:

```bash
cd ~/lumen-push
git switch -c feat/forge-take2-local
git fetch ~/Downloads/lumen-forge-take2.bundle feat/forge-lumen-redesign
```

The bundle contains both redesign commits. If take 1 is already installed:

```bash
git cherry-pick FETCH_HEAD
```

Otherwise, cherry-pick both commits in order:

```bash
git cherry-pick cc7ca99 FETCH_HEAD
```

Resolve any conflicts against additional local changes before proceeding. The
bundle requires the existing integration ancestor `6ccfcbc`, which is on GitHub's
`feat/lumen-integration` branch. If needed, fetch that branch first.

Apply the new migration using your installed local Supabase CLI:

```bash
"$HOME/.local/share/lumen-tools/node_modules/.bin/supabase" migration up --local
npm ci
npm run typecheck
npm run build:web
```

Use your existing `.env` for the build. Restart the API and web through your
existing Lumen service workflow after reviewing the changes. There are no new
Python package requirements. Native clients need a fresh native build to pick up
the camera permission configuration.

## Validation completed

- TypeScript check and Expo web export.
- 71 backend tests, including voice catalog validation, saved voice playback,
  reset, and denial of another user's companion.
- Appearance preset contrast and preference persistence/validation checks.
- PostgreSQL WASM migration checks: uploaded portraits preserved, new default
  valid, gender constraints, and safe migration replay.
- Chromium smoke checks against the actual Expo build with mocked API data:
  desktop and 390px mobile layouts, tab navigation, voice selection, appearance
  persistence after reload, camera capture to draft, and no page runtime errors.

Real Helios TTS, your local database, native hardware, and the deployment have not
been tested from this environment. Nothing has been pushed, merged, or deployed.

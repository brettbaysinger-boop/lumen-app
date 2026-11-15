# Animated Companion mode (development preview)

Optional, web only, off by default. When it is on, the companion appears as a
live video above the conversation: idle while nothing is spoken, lip-synced
while a reply is played, idle again afterwards.

Nothing else about Lumen changes. The reply comes from the existing
authenticated conversation pipeline, the speech from the existing
`/v0.1/voice/speak` route and the companion's saved Helios voice. Conversation
history and memory are not touched by this feature, and RMC is not changed.

## How it works

1. **Play reply** requests speech exactly as before: one `/v0.1/voice/speak`
   request per chunk of the reply.
2. If an avatar session is connected, the app hands that same audio to
   `POST /v0.1/avatar/speech` and receives a one-time ticket.
3. The ticket travels over the WebRTC data channel to the avatar service
   (OpenAvatarChat + MuseTalk on the GPU host), which collects the audio from
   Lumen once and speaks it. The lip-synced video and audio come back over WebRTC.
4. If any step fails, the app plays the audio it already has in the browser,
   as it always did. The avatar's audio stays muted in that case and the avatar
   is told to stop, so a reply is never heard twice and never requested twice.

The avatar service is `lumen-avatar-lab` (branch
`feat/lumen-animated-companion-bridge-20261114`). It reuses OpenAvatarChat's
server, RTC client, interrupt handler and MuseTalk handler unchanged.

## Routes added (`backend/lumen/avatar.py`)

| Route | Caller | Purpose |
| --- | --- | --- |
| `GET /v0.1/avatar/status` | signed-in user | whether the mode is configured and the avatar service answers |
| `POST /v0.1/avatar/offer` | signed-in user who owns the companion | relays the WebRTC offer to the avatar service, returns its answer |
| `POST /v0.1/avatar/speech` | signed-in user | stores reply audio for 60 seconds, returns a one-time ticket |
| `GET /v0.1/avatar/speech/{ticket}` | avatar service (shared secret) | collects that audio once |

The avatar service itself refuses every request without the shared secret, so
it is only reachable through these routes. The browser never receives the secret.

With `AVATAR_URL` blank (the default) the mode is off: `status` reports
`enabled: false`, the header toggle is not shown, and the other routes answer
503 or 404.

## What the user sees

- A header switch, **Animated: off / on**, shown only on web and only when the
  server reports the avatar service as reachable.
- While on, a video panel under the header. Message portraits are unchanged.
- **Play reply** / **Stop audio** work as before. Stop interrupts the avatar
  and returns it to idle.
- While the animated companion is on and connected, each new reply to a
  message you send is spoken automatically, once. Old messages are never
  spoken by themselves, also not when a conversation is opened or reloaded.
  Sending another message, switching conversation, **Stop audio** or turning
  the mode off stops the speech. With the mode off, **Play reply** is manual
  as before.
- Under the video, **Shrink** and **Expand** step through four sizes:
  Compact (260 px), Large (420 px, the default on a desktop-width window),
  Theater (up to 560 px) and Wide Theater (up to 840 x 560).
  The first three are square close-ups that crop the sides of the frame, as
  before. Wide Theater has the 3:2 shape of the 768 x 512 source video and shows
  the whole frame, uncropped and unstretched, with square corners so that not
  even the corner pixels are cut off (the square sizes keep rounded corners). It cannot show anything that is
  not in the source video.
  Every size is limited by the width of the conversation column (the window,
  less an open sidebar, minus margins) and by the window height (40%, 50% and
  62%; Wide Theater also always leaves 250 px), so the page never scrolls
  sideways and the conversation and message box stay on screen. On a
  phone-width window the default is Compact. The choice is remembered in that
  browser.
  Changing size only resizes the box around the one video element and how the
  picture fills it; the avatar session, its stream and any speech in progress
  carry on untouched.
- If the browser holds back sound until you interact with the page, an
  **Enable sound** control appears. Press it once.
- If the avatar service is unreachable or drops, the panel disappears and
  replies play as ordinary audio with the existing portrait.

## Development preview

The preview runs from a separate clone on its own ports. It does not touch the
live checkout, its services, systemd, the database schema or RMC.

On the GPU host, start the bridge first (see `docs/ANIMATED-COMPANION-BRIDGE.md`
in lumen-avatar-lab), then copy `~/.config/lumen-avatar/secret` from the GPU
host to the same path on the Lumen host.

On the Lumen host:

```bash
git clone https://github.com/brettbaysinger-boop/lumen-app.git ~/lumen-animated-preview
cd ~/lumen-animated-preview && git checkout feat/lumen-animated-companion-20261114

export AVATAR_URL=http://aiLumen-llm-heavy:8283      # https://... and AVATAR_TLS_VERIFY=false if the bridge printed https
scripts/animated-preview.sh check                    # read-only; must end with "preview memory store: ... (same as live)"
scripts/animated-preview.sh api                      # terminal 1: preview API on :8011
scripts/animated-preview.sh web                      # terminal 2: preview web app on :8091
```

Then, in a browser on the same network as the GPU host, open
`http://aiLumen-llm-video:8091`, sign in, turn on **Animated**, send a message
and send a message. The reply is spoken by itself; **Play reply** replays it.

The preview API reads the live `backend/.env` through a link, so chats in the
preview are real chats on the real account, with the usual history and memory
behaviour. If the live web `.env` points Supabase at `localhost`, browse from
the Lumen host or set `EXPO_PUBLIC_SUPABASE_URL` before `web`.

### Memory preflight (fail closed)

The live API may take its memory store from systemd rather than from
`backend/.env` (for example `LUMEN_MEMORY_BACKEND=rmc` in the
`60-lumen-rmc.conf` drop-in). A second API process that read only `.env` would
then quietly use a different store. `check` and `api` therefore run
`scripts/animated_preview_memory.py` first. It:

1. reads the memory settings of the running `lumen-api` process (its own
   environment, then the live `backend/.env`, then the built-in default);
2. when the store is RMC, checks the installation ID, gateway socket, host key
   file and service user with the same adapter checks the live API uses, and
   sends the gateway its existing liveness probe, which admits nothing;
3. loads the preview's settings and confirms they equal the live values;
4. only then starts the preview API, with exactly those settings. Memory
   settings exported in your shell are ignored.

If any step cannot be confirmed it prints `REFUSED: ...`, exits with status 3
and the preview API does not start. It never activates, deactivates, migrates
or changes RMC, reads or writes no memory, and prints no key, token or secret
(the installation ID and file paths are shown; the host key never is).

Run `check` and `api` as the same user as the `lumen-api` service
(`systemctl show -p User --value lumen-api`), without `sudo`. The RMC gateway
only admits that user, and only that user can read the service's settings.

Ownership and privacy are unchanged: the preview API runs the same Lumen code
path as the live API, so every memory request still goes through `require_user`,
companion ownership and the RMC gateway's own checks.

## Normal deployment

The full owner-run procedure, with acceptance tests and every way back, is
`docs/DEPLOYMENT.md` in lumen-avatar-lab. The Lumen side is one script, run
from the reviewed clone (not the live checkout) as the lumen-api user:

```bash
AVATAR_URL=http://<bridge address>:8283 scripts/animated-deploy.sh check     # read-only, ends with READY or NOT READY
AVATAR_URL=... LUMEN_ANIMATED_CONFIRM=cutover:<commit> scripts/animated-deploy.sh cutover
scripts/animated-deploy.sh status | disable
LUMEN_ANIMATED_CONFIRM=rollback scripts/animated-deploy.sh rollback
```

`cutover` fast-forwards the live checkout to the clone's commit (local edits
are kept; it refuses beforehand if one would be touched), builds the web app in
the clone and swaps it in, adds the lumen-api drop-in `70-lumen-avatar.conf`
naming a private settings file (`~/.config/lumen-avatar/lumen-api.env`, mode
600) with `AVATAR_URL` and the shared secret, and restarts lumen-api and
lumen-web. It then requires lumen-api to be healthy, the memory settings from
systemd and every other drop-in to be exactly as before, and the avatar route
to ask for sign-in; otherwise it goes back by itself. It installs nothing,
runs no migration, and never opens the RMC drop-in, RMC or the database.

With the drop-in removed (`disable`) the mode is off, which is the default:
the switch is not shown and replies play as ordinary audio. Even when
configured, Animated is off until the user turns it on.

`scripts/test-animated-deploy.sh` exercises check, cutover, automatic undo,
disable, enable and rollback against two generated checkouts with stand-ins for
systemctl, sudo, curl and the web build.

## Frontend-only updates after the cutover

The cutover (`scripts/animated-deploy.sh`) is done once and not run again. A
later change that touches only the web app, such as the display size, goes in
with `scripts/animated-web-update.sh`, run from the reviewed clone as the
lumen-api user:

```bash
scripts/animated-web-update.sh check       # read-only; ends with READY or NOT READY
LUMEN_WEB_UPDATE_CONFIRM=update:<commit> scripts/animated-web-update.sh update
scripts/animated-web-update.sh status
LUMEN_WEB_UPDATE_CONFIRM=rollback scripts/animated-web-update.sh rollback
```

`update` builds the web app in the clone with the live settings, always from a
cleared bundler cache (`expo export --clear`), and refuses the build if a
script named by `index.html` is missing or if the bundle carries module paths
of the live checkout (a stale Metro cache). It then swaps it in
for the live `dist` (keeping the old build), and fast-forwards the live
checkout with local edits kept. It restarts nothing and uses no sudo:
`scripts/serve-web.cjs` reads the build from disk for each request, so a
browser reload shows the new version. It refuses a commit that changes anything
outside the web app's source, tests, docs and these scripts, and it never
reads or changes lumen-api, its drop-ins, RMC, the database or the avatar
bridge. If the web app does not answer after the swap it puts the old build
back by itself. `scripts/test-animated-web-update.sh` exercises all of this
offline.

## Tests

```bash
cd backend && python -m pytest -q          # includes tests/test_avatar.py, tests/test_animated_preview_memory.py and the voice tests
node --test tests/*.test.cjs               # includes tests/animated-companion.test.cjs and tests/animated-display-size.test.cjs
node scripts/test-animated-size-component.cjs   # optional: needs react-test-renderer@19.1.0
npm run typecheck
```

A browser end-to-end run (real WebRTC, OpenAvatarChat's real server with a
stand-in avatar) lives in lumen-avatar-lab under `tests/e2e/`.

## Known limits

- Web only. Native apps keep the portrait and existing audio.
- One avatar and one session at a time. Every companion shows the same
  prepared avatar; choosing an avatar per companion is not part of this step.
- Only replies to messages sent from the open screen are spoken automatically.
  A reply that arrives while another conversation is open is not.
- The browser must be on the same network as the GPU host (no TURN relay).
- Speech tickets live in the API process's memory, so the API must run as a
  single process (it does today).
- If the avatar drops mid-sentence, that chunk is cut short and the rest of the
  reply continues as ordinary audio.

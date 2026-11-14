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
and press **Play reply**.

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

## Tests

```bash
cd backend && python -m pytest -q          # includes tests/test_avatar.py, tests/test_animated_preview_memory.py and the voice tests
node --test tests/*.test.cjs               # includes tests/animated-companion.test.cjs
npm run typecheck
```

A browser end-to-end run (real WebRTC, OpenAvatarChat's real server with a
stand-in avatar) lives in lumen-avatar-lab under `tests/e2e/`.

## Known limits

- Web only. Native apps keep the portrait and existing audio.
- One avatar and one session at a time. Every companion shows the same
  prepared avatar; choosing an avatar per companion is not part of this step.
- Speech is played when the user presses **Play reply**, as today. Nothing is
  spoken automatically.
- The browser must be on the same network as the GPU host (no TURN relay).
- Speech tickets live in the API process's memory, so the API must run as a
  single process (it does today).
- If the avatar drops mid-sentence, that chunk is cut short and the rest of the
  reply continues as ordinary audio.

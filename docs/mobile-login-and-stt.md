# Mobile login and speech input — October 11, Phoenix

<!-- consolidated-mobile-checkpoint-2026-10-11 -->

## Current checkpoint — October 11, 2026 (America/Phoenix)

Latest accepted application commit: `a5d184e`.
Branch: `feat/lumen-take2-local`.
Active checkout: `/home/brett/lumen-push` on `aiLumen-llm-video`.

Android Galaxy S22 acceptance passed on the existing Lumen account and a
second test account: chat/login keyboard positioning, companion reply
playback, tap-to-start/tap-to-stop STT, transcript review before sending,
five-minute native recording limit, leaving/background cancellation,
and notification regression checks.

Companion creation/customization and Android reminder push were also
accepted earlier on both account flows. Push implementation is committed
at `8522280`; mobile keyboard/voice implementation at `a5d184e`.

Host validation: TypeScript and all 47 Node tests passed for mobile fixes.
Earlier Android push host checkpoint: 459 backend tests, queue/ownership/
permission checks and pip check passed. Backend tests were not rerun for
the frontend-only mobile fixes. Assistant component regression checks and
platform exports passed; final STT follow-up Android export passed.

Chrome Google sign-in/sign-out passed twice after the local auth allowlist
added `raialume-preview://login`. Running allowlist verified.
API and push worker active; API/Ollama/database health reported OK.
The redirect configuration remains a local, uncommitted setting.
Firebase service-account credentials remain outside Git and the APK.

Native STT uses Helios via the authenticated backend, mono AAC at 64 kbps,
and a five-minute recording limit. Backend limits remain 10 MB per upload
and 120 seconds for the upstream speech request. Web recording retains
its existing one-minute limit.

Pending: Firefox native Google-login verification, iOS device acceptance
and iOS push. Broader mobile polish and chat consolidation remain open.
Memory relevance, skills and proposal work remain paused.

Hardware evidence: [AI infrastructure](AI-INFRASTRUCTURE.md).
This checkpoint does not deploy the web frontend.
Historical sections below retain their original scope and dates.


Candidate applies after the keyboard/reply-audio patch on host commit 8522280.
Brett accepted keyboard positioning, reply playback, stop/background behavior and
notification regression on both accounts. Google sign-in/sign-out passed twice
with Chrome after allowing raialume-preview://login in local Supabase. API and
push services active; API/Ollama/database health OK. Firefox remains unverified.
These host acceptance reports have not yet been committed.

Login now uses keyboard avoidance and scrolls with a compact form while typing.
Native chat offers microphone recording with runtime permission, a 60-second
limit, authenticated audio/mp4 upload to the existing Helios transcription route,
and transcript insertion into the draft. Sending remains a separate user action.
Private recording files are deleted after upload, failure or cancellation.
Leaving the chat, changing conversations and backgrounding cancel voice work;
late results cannot overwrite a new voice session. No dependency or schema change.
The expo-audio config plugin adds native microphone permission on rebuild.

Assistant validation: TypeScript, 46 Node tests and chat cache/management component
regressions passed. Real microphone input and login positioning require S22 checks.
Google/Firebase preview configuration and the signing key must survive rebuild.

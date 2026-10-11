# Chat keyboard and native reply playback

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


Candidate follows host commit 8522280 (Android push accepted).

The keyboard-avoiding container now includes the entire chat view rather than
only the composer. It uses Android height adjustment and iOS padding, with the
top safe-area inset as its coordinate offset. Android keyboard layout mode is
explicitly resize. The custom bottom navigation hides during native keyboard
visibility and returns after dismissal; desktop navigation remains available.

On native devices, search, attachment and camera actions occupy a separate row
with 44-point targets. The text row has room for the prompt and Send. Native
microphone recording remains pending, so its disabled button is omitted.
The native multiline field caps its height at 140 points and scrolls longer
text. Native message scrolling dismisses the keyboard on drag, while interactive
message actions retain taps. The decorative composer hint hides while typing.

Assistant messages offer Play reply on Android/iOS as well as web. Native
playback uses authenticated speech synthesis with the companion's saved voice,
500-character chunks, private temporary WAV files and expo-audio. Chunks play
in order and files/players are released as each finishes. Stop, conversation
change, tab departure, backgrounding and unmount cancel playback. Later-chunk
errors are surfaced. Audio is requested only after tapping Play; automatic
playback and native voice input remain pending.

No backend, database, notification or dependency changes. The Android build
must use updated app.json keyboard configuration while preserving the isolated
preview package, Firebase file and signing key. No phone acceptance is claimed
until Brett verifies this APK.

Validation: TypeScript, Node tests, chat cache/management component regressions,
and all-platform JS export. New audio tests exercise sequential chunks, saved
voice selection, stop/background cleanup, later failure, late cancellation and
player failure. Native keyboard positioning and audible playback require real
phone validation; JS export cannot verify those behaviors.

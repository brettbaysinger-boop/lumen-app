# Native preview preparation — October 10, 2026

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


User-supplied host checkpoint: b1e1f34 on feat/lumen-take2-local, with the
cached-chat candidate committed. Configuration edit and three backups remain
outside the commit. No push, deployment or live-phone acceptance is established.
Host snapshots show no Java/Javac, adb, sdkmanager or EAS CLI; Android SDK variables
are unset. Approximately 180 GB disk and 35 GiB available memory were reported.

Prefer local Android builds, with native generation/build work in an isolated
copy. Do not generate Android native files in the running checkout or deploy
synthetic test bundles. Expo SDK 54 targets Android API 36; verify SDK/NDK/build
tools against the generated project before installation. Use JDK 17. App package
identity, signing credentials, native OAuth/password-reset redirects and persistent
preview release-key storage still need explicit setup. No APK is produced here.

This bounded native auth candidate adds the installed URL polyfill and selects
AsyncStorage for native Supabase sessions. Browser storage and URL session
handling retain their prior behavior. AuthProvider starts/stops native token
refresh with AppState and removes its listener at unmount. Device session storage
is separate from cached chat history; explicit sign-out still uses Supabase's
existing local sign-out handling and clears private chats.

Validation in an isolated assistant checkout: TypeScript and all 18 Node tests
passed, including real SDK session reloads through synthetic Android/iOS storage.
Auth component checks cover native foreground/background/unmount refresh behavior
as well as the prior cached-bootstrap and sign-out checks. Native JavaScript
bundling passed before this auth change; a fresh native bundle and full Android
Gradle build remain pending. Host validation, browser regression and real-device
close/reopen/sign-out acceptance are pending. No new dependency, schema, provider,
speech infrastructure or service deployment change is included.

Voice remains implemented for web; native recording/playback is still open.
Document attachment controls remain web-only. These must be addressed or clearly
represented in the native preview. Native runtime compatibility cannot be inferred
from a successful JavaScript bundle. Push, companion onboarding, navigation refresh
and chat management remain on the recorded mobile roadmap. Memory relevance,
skills and proposal work remain paused.

<!-- android-preview-phone-acceptance-2026-10-10 -->
## October 10, Phoenix — Android preview passed live phone acceptance

User-supplied host evidence confirms the isolated Android release build
completed successfully from cached-chat commit b1e1f34 with the native
session-storage and foreground token-refresh changes overlaid.

Build directory: /home/brett/lumen-android-builds/preview.ijhcJd
APK: android/app/build/outputs/apk/release/app-release.apk
Package: com.raialume.preview
Label: Raialume Preview
Architecture: arm64-v8a
Minimum Android SDK: 24
APK signature verification passed.
APK SHA256: 36cff44d618fc6ff814bda0e705edcdf547fdce796214b666c3ec4faaca211ca

ADB installation succeeded on Samsung SM-S901U (Galaxy S22).
Brett reports all live phone acceptance checks passed:
- Email/password sign-in and successful chat reply.
- Session and chat history retained after closing and reopening.
- Cached history and unsent draft retained during airplane-mode reopening.
- Connectivity restoration and chat recovery.
Brett reports smoother operation and easier navigation.

Native auth candidate passed host TypeScript and all 18 Node tests.
This is a private preview using the existing backend; production release,
iOS testing and push notifications remain pending. Native voice and
document attachments remain pending. No production services were deployed
or restarted for this checkpoint.

Next work: chat rename/archive/delete with cache invalidation, followed by
personalized companion onboarding, mobile UI polish and push notifications.
Chat consolidation semantics remain to be defined before implementation.
Memory relevance, skills and proposal work remain paused.
Configuration and backups remain preserved.

<!-- firefox-native-auth-accepted-2026-10-11 -->

## October 11, Phoenix — Firefox native Google login accepted

Android OAuth now opens its browser with createTask: false.
User-reported Galaxy S22 acceptance passed: Firefox Google login with
two-factor verification, session persistence after reopening, second-account
companion/history isolation, Chrome sign-in/sign-out, and deliberate
cancellation followed by a successful retry.

Host TypeScript, social-auth checks and all 47 Node tests passed.
Android release build and ADB update installation succeeded.

The first rebuild crashed at startup because public Supabase build settings
were absent. Restoring the backed-up APK restored operation. The corrected
build explicitly supplied the three frontend settings from the checkout's
.env and NODE_ENV=production, forced JavaScript rebundling, and verified all
three values against both the working backup and rebuilt APK before install.
No environment values are recorded here.

Accepted APK SHA256:
da843214581c8ea52d6e33480708e25c1fa9e73d2aaeb46efeec103f0d09b3ee

Previous working APK and login source preserved at:
/home/brett/lumen-android-builds/before-firefox-auth.mymlatl_

Supabase configuration and existing backups remain outside this commit.
No backend changes, migration or web deployment.
iOS acceptance/push, broader mobile polish and chat consolidation remain open.
Memory relevance, skills and proposal work remain paused.

<!-- mobile-navigation-accepted-2026-10-11 -->

## October 11, Phoenix — Mobile navigation accepted

Mobile navigation now shows Chat, My Day, Gallery and More.
More contains Memories, Companion and Settings, with the current destination
indicated. Mobile labels and touch targets are larger.

Brett reports all Galaxy S22 checks passed on both accounts:
primary navigation, all More destinations, selected state, close button,
outside-tap and Android Back dismissal, keyboard hide/restore behavior,
and unsent chat draft preservation when switching screens.

Host TypeScript and all 47 Node tests passed.
Android release build and update installation succeeded. Public frontend
settings were verified against the previous and rebuilt APK.
Desktop browser and iOS acceptance were not performed for this increment.

Accepted APK SHA256:
ec5bd6eb23d43bb5b87362ea671427dd832da677248676118beba5f0a46c53d7

Previous working APK and navigation source:
/home/brett/lumen-android-builds/before-mobile-nav.8efx5wqu

No backend changes, migration or web deployment.
Local Supabase configuration and existing backups remain outside the commit.
Further mobile polish, chat consolidation and iOS acceptance/push remain open.
Memory relevance, skills and proposal work remain paused.

<!-- chat-collections-accepted-2026-10-11 -->

## October 11, Phoenix — Chat collections accepted

Collections organize chats per companion. Users can create, rename and delete
collections, move chats between collections or Unfiled, and filter history
alongside name search and archive status. Collection names and assignments
are included in the existing owner-private, bounded chat cache.

Brett reports all requested Galaxy S22 acceptance checks passed on both
accounts: creation, blank/duplicate rejection, assignment and removal,
collection/search/archive filtering, rename/reopen persistence, deletion
cancellation and confirmation preserving chats/messages/drafts, cached offline
browsing and reconnection, and account isolation.

Host TypeScript and all 47 existing Node tests passed. Dedicated PGlite SQL
checks passed for ownership, companion scope, name validation, rename,
collection deletion preserving chats, and anonymous denial.
These are synthetic SQL checks; exhaustive live database security testing
and multi-device reconciliation acceptance are not established.

Migration 20261011230500_chat_collections applied locally.
Live inspection confirmed RLS and the companion-scoped composite foreign key
with ON DELETE SET NULL (collection_id). Existing chats were initially Unfiled.
Database backup:
/home/brett/lumen-db-backups/chat-collections.Yso4T4

Android release build and ADB update installation succeeded.
Public frontend settings verified against previous and rebuilt APK.
Accepted APK SHA256:
8678e74cc0eb0f918d00d1e4463eab60cb75b97bf89a719f1eba77f3eee63291
Previous APK/source backup:
/home/brett/lumen-android-builds/before-collections.88djfagi

Collections supply organization, not cross-chat model context.
Next: select source chats, generate an editable handoff, review it, and start
a fresh chat with source links. Original transcripts remain available.
Reviewed handoffs and transcript consolidation are not implemented yet.

No backend code change or web deployment. Desktop and iOS acceptance pending.
Local Supabase configuration and existing backups remain outside this commit.
Memory relevance, skills and proposal work remain paused.

<!-- project-actions-handoffs-checkpoint-2026-10-11 -->

## October 11, Phoenix — Project actions accepted; reviewed handoffs pending acceptance

This checkpoint supersedes earlier statements that reviewed handoffs are
not implemented. The implementation is now present; live handoff acceptance
remains pending.

### My Day project actions

Named project creation accepts “create project called Copper Garden”.
Project-step capture accepts natural wording without required punctuation:
“Add tasks to project Copper Garden identify weed types and gather supplies”.

The backend resolves one matching open project within the companion scope.
The selected conversation model chooses only exact text spans from the
requested step wording. Validation checks coverage and order before a
conditional checklist update. Existing completed steps are preserved,
identical step text is deduplicated, and concurrent checklist changes cause
a refusal rather than an overwrite. Invalid extraction receives one bounded
retry; failures do not produce a successful save receipt.

Brett verified in the browser: Copper Garden creation, both requested steps
visible in My Day, repeated capture without duplicates, reopening persistence,
and the corrected Archive project label and explanation.

The previous Undo label archived the entire project. The card now accurately
labels that operation Archive plus the item kind. Restore retains its steps.
Undo of only the latest added steps is NOT implemented.
Chat cards display saved snapshots; My Day supplies the current editable item.

A narrow follow-up handler for “add those two tasks” is implemented and
synthetically tested. It requires an immediately preceding numbered proposal,
the project name, and a recent backend project receipt. Broader conversational
follow-up acceptance and general natural My Day action routing remain open.

The ordinary-reply save-claim guard now covers additional project/task claims.
It remains a wording heuristic, not proof that every unsupported claim is caught.

### Continue together

Users can select up to five source chats, generate a bounded draft, edit and
review it, then create a fresh conversation with original-chat links.
The reviewed summary is stored on the new conversation and supplied as
historical reference context in subsequent model turns. Original transcripts
are preserved; generating a draft performs no database write.

Source reads use the caller's account scope. The creation RPC runs with
invoker security, verifies companion/source scope, and uses a request UUID
for atomic creation and idempotent retries.
Summaries use bounded recent text; earlier history and attachment contents
may be omitted. Live summary quality, source-link behavior, model use of
reviewed context, and cross-account acceptance remain pending.

Migration 20261011234500_reviewed_chat_handoffs.sql applied locally.
Live inspection confirmed authenticated execution allowed and anonymous
execution denied. Dedicated PGlite checks passed for source scope, ownership,
validation, retry behavior, atomic failure and source preservation.
Database backup:
/home/brett/lumen-db-backups/reviewed-handoffs.nLBTVu

### Validation and deployment

Latest complete backend suite: 484 tests passed.
Latest TypeScript check passed. Existing 47 Node tests passed earlier in
the handoff implementation; they do not establish live handoff acceptance.

The API was restarted during project-action verification.
The web export was rebuilt with explicit public frontend settings, checked
for those settings and the card wording, and deployed with its prior dist
preserved outside Git. Brett confirmed browser acceptance after refresh.
The export includes the handoff UI; exporting it is not handoff acceptance.

Android installation/acceptance of the current handoff UI and Archive label
is not established. Last verified accepted APK remains the collections build:
8678e74cc0eb0f918d00d1e4463eab60cb75b97bf89a719f1eba77f3eee63291

Next: finish reviewed-handoff browser acceptance; rebuild the Android preview
with verified public settings; verify both accounts, source links and reopen
behavior. Step-level Undo and broader conversational My Day actions remain open.
iOS acceptance/push, further mobile polish and transcript consolidation remain open.
Memory relevance, skills and proposal feature work remain paused.

Local Supabase configuration, environment values, build artifacts and existing
backups are excluded from this checkpoint.

<!-- chat-usability-checkpoint-2026-10-11 -->
## Chat usability checkpoint — October 11, Phoenix

The first conversation usability pass is implemented but not accepted.
Previously supplied automated results: TypeScript, 47 Node tests and
488 backend tests passed. Browser/device acceptance remains pending.
Deployment completion for this pass is unverified.

See [chat usability](chat-usability.md) and
[latest session handoff](SESSION-HANDOFF-2026-10-11.md) for implementation,
limits and remaining work.

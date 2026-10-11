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

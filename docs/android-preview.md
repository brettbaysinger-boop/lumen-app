# Native preview preparation — October 10, 2026

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

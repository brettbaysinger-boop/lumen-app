# Android phone refresh (Issue #16) — November 15, 2026

Scope: bring the existing **Raialume Preview** app (`com.raialume.preview`) on the Galaxy S22
up to the current Lumen source, keep everything it has, and give the phone an intentional way
to the live animated companion and Wide Theater. Nothing here was built, installed or deployed.

## Inventory from the repository

The build host and the phone were not inspected from here. `scripts/android-refresh.sh inventory`
(read-only) does that; its output decides the exact build commands below.

- Last Android build recorded as accepted: the chat-collections build of October 11, source
  `9c30b33`, APK SHA256 `8678e74c…e63291` (`docs/android-preview.md`). Whether the phone still
  runs exactly that APK is what the inventory confirms, by hash.
- The native project (package id, `raialume-preview://login`, `google-services.json`, release
  signing) is not in Git. It lives in the isolated build tree under
  `/home/brett/lumen-android-builds`. `app.json` in Git has no Android package or signing.
- `package.json` and `app.json` are unchanged since `9c30b33`. No native module was added or
  upgraded, so the refresh is a new JavaScript bundle in the same native project, signed with
  the same key. No `expo prebuild`, no new Firebase project, no key change.

## What the phone is missing

Frontend changes since the last accepted APK, all already in the web app:

| Change | On the phone after the refresh |
| --- | --- |
| Reviewed chat handoffs ("Continue together") and corrected Archive label | Yes |
| Simplified chat layout, first-message chat naming, chat text rendering | Yes |
| Memory durability and memory-subject handling, memory screen updates | Yes |
| Memory backend detection used with RMC (fails closed) | Yes |
| Animated Companion, display sizes, Wide Theater | In the browser, through **Live video ↗** |

Unchanged since the accepted APK: native sign-in and session storage, Google sign-in redirect,
Helios recording and playback (`recording.native`, `reply-audio.native`, `voice-preview.native`),
push (`push-client.native`, `PushLifecycle.native`), navigation and keyboard handling.

## The change in this PR

- **Phone app: "Live video ↗"** in the chat header. Shown only in the native app, only when the
  web address is known and the server reports the animated companion switched on and reachable.
  Tapping it asks first, then opens the Lumen web app in the phone's own browser.
  - No token, cookie or account detail is passed. The browser keeps its **own** Lumen sign-in,
    separate from the app's: sign in there once, and it stays signed in like any browser tab.
  - Only an `https` address of the Lumen host is ever opened. It comes from
    `EXPO_PUBLIC_LUMEN_WEB_URL` if set at build time; otherwise from the API address when that
    is the documented private HTTPS layout (API on port 8444 of the web host). Anything else:
    the action is hidden.
  - The native app keeps the portrait and Helios voice. There is no native WebRTC, no embedded
    web view, no new dependency.
  - When the avatar service is stopped (for example during GPU work), the action is not shown.
    New scenes (Issue #15) appear on the phone when the web app has them; nothing to rebuild.
- **Web: "Full screen"** next to the size controls, for Wide Theater only. It uses the browser's
  own full screen on the same video element, so a phone held sideways shows the whole 3:2 frame.
  The avatar session is not touched. Without it, a sideways phone gets a very small picture,
  because the page keeps room for the header and message box.

## Build (owner, on the build host)

Outline, as established on October 11. The exact commands are fixed after the inventory output.

1. Work in the existing isolated native project, never in `/home/brett/lumen-push`. Copy the
   previous working APK and the tree's current JavaScript source aside first, as before.
2. Bring only `app/ components/ lib/ hooks/ types/` from the reviewed commit into that tree.
   Leave `android/`, its `app.json`, `google-services.json` and signing files as they are.
   Keep `versionCode` unchanged, so the previous APK can be put back as a plain update.
3. Build the release APK with the three public settings supplied explicitly from the live
   checkout's `.env`, `NODE_ENV=production`, and a forced JavaScript rebundle.

## Update and rollback (owner)

```bash
scripts/android-refresh.sh inventory                 # read-only
scripts/android-refresh.sh verify /path/to/app-release.apk   # read-only; prints the install line
ANDROID_REFRESH_CONFIRM=install:<12 characters printed by verify> scripts/android-refresh.sh install /path/to/app-release.apk
ANDROID_REFRESH_CONFIRM=rollback scripts/android-refresh.sh rollback
```

`verify` refuses an APK with another package id, another signing certificate, an invalid
signature, a lower `versionCode`, or without the three public settings the installed app carries
(the October 11 startup crash). `install` first copies the installed APK off the phone, verifies
again, then runs one `adb install -r`, which keeps app data. `rollback` puts that copy back the
same way. The script never uninstalls, never clears data and never signs anything. If Android
refuses a rollback, it stops and leaves the app and its data in place.

## Smoke test on the phone after the update

1. The app opens already signed in; chat history and an unsent draft are still there.
2. Send a message; Play reply (Helios); record with Talk, review, send.
3. More → Memories, Companion, Settings; Android Back closes More; keyboard hides and returns.
4. A reminder notification arrives; notification settings unchanged.
5. Sign out and sign in again (email and Google).
6. **Live video ↗**: Cancel does nothing; Open shows the web app in the browser. Sign in there
   once, turn Animated on, expand to Wide Theater, turn the phone sideways, Full screen. Back
   returns to the app, still signed in.

## Tests

`node --test tests/*.test.cjs` (105), `scripts/test-android-refresh.sh` (30 checks, stand-ins for
adb and the SDK tools), `scripts/test-animated-size-component.cjs`, `npm run typecheck`, and an
Android JavaScript export of this commit. No device or APK build was involved.

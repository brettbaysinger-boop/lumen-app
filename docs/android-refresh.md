# Android phone refresh (Issue #16) — November 15, 2026

Scope: bring the existing **Raialume Preview** app (`com.raialume.preview`) on the Galaxy S22
up to the current Lumen source, keep everything it has, and give the phone an intentional way
to the live animated companion and Wide Theater. Nothing here was built, installed or deployed.

## Inventory from the repository

The build host was inspected by the owner with `scripts/android-refresh.sh inventory` (see below).
The phone has not been inspected yet.

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

## Owner inventory, November 15 (aiLumen-llm-video)

- JDK 17 and build-tools 36.0.0 (`aapt2`, `apksigner`) under `~/Android/Sdk`. `adb` was not on PATH and
  the phone was **not** inspected. The script now also looks in `~/Android/Sdk/platform-tools`.
- Native project `/home/brett/lumen-android-builds/preview.ijhcJd`: `com.raialume.preview`,
  `versionCode` 1, scheme `raialume-preview`, `google-services.json` present, signing outside Git.
  Its `app.json` and `package.json` differ from Git on purpose and are never replaced.
- Its current release APK is `e963ef43…55acc6`; the archived collections APK is `8678e74c…e63291`. Both
  are signed by certificate `fac61745…033b9c`. Which one the phone runs is unknown until ADB says.
- The three public settings are in the live `.env` only; the API is https on port 8444, so the app
  works out the web address for Live video by itself.

## Steps (owner, on the build host, from a full clone of this branch)

Each step stops by itself if something is off. Steps 1, 2 and 4 are read-only. Run one step per
command, not piped through `tail` or `head`, and not chained in a wrapper: every step ends with a line
`RESULT <step>: OK` or `RESULT <step>: FAILED`. Go on only after `OK`.

Known from the owner's device inventory: Galaxy S22 SM-S901U, Android 16, installed APK
`e963ef43…55acc6`, which is the project's current release APK, `versionCode` 1, signer `fac61745…033b9c`.

```bash
export PATH="$HOME/Android/Sdk/platform-tools:$PATH" ANDROID_HOME="$HOME/Android/Sdk"   # optional: adb is found there anyway
# 0. Keep a copy of the installed APK now (the phone is not changed). Check the sha256 it prints is e963ef43…
scripts/android-refresh.sh backup
```

```bash
# 1. The phone: selected device, installed version, hash and signer of the installed APK.
#    If adb is not found, install platform-tools first (sdkmanager "platform-tools"), then rerun.
scripts/android-refresh.sh phone

# 2. Would the build run, and what would it replace? Prints the build line.
scripts/android-refresh.sh build-check

# 3. Build in the existing native project. No phone needed, nothing installed.
ANDROID_REFRESH_CONFIRM=build:<12 characters printed by step 2> scripts/android-refresh.sh build

# 4. Check the built APK against what is on the phone. Prints the install line.
scripts/android-refresh.sh verify <APK path printed by step 3>

# 5. Update the phone. Copies the installed APK off the phone first, then one `adb install -r`.
ANDROID_REFRESH_CONFIRM=install:<12 characters printed by step 4> scripts/android-refresh.sh install <APK path>

# Back to the APK that was on the phone before step 5:
ANDROID_REFRESH_CONFIRM=rollback scripts/android-refresh.sh rollback
```

`build` keeps the project's previous JavaScript source and release APK under
`~/.local/state/lumen-android-refresh/build-*`, replaces only `app/ components/ lib/ hooks/ types/`,
and runs the project's own `./gradlew assembleRelease` with the three public settings from the live
`.env` (in the build's environment only; never printed or written to the project), `NODE_ENV=production`
and a fresh bundler cache. It never touches `android/`, `app.json`, `package.json`, `node_modules`,
`google-services.json` or signing, and never runs `expo prebuild`. If step 2 names files that were
never committed to Git, those are edits made only on the host: decide per file, and list the ones to
keep in `ANDROID_REFRESH_KEEP`. A failed build puts the previous source and APK back. The built APK is
then checked against the previous one: same package, same certificate, same `versionCode`, the public
settings present, and this commit's JavaScript inside.

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

`node --test tests/*.test.cjs` (105), `scripts/test-android-refresh.sh` (47 checks, stand-ins for
adb, Gradle and the SDK tools), `scripts/test-animated-size-component.cjs`, `npm run typecheck`, and an
Android JavaScript export of this commit. No device or APK build was involved.

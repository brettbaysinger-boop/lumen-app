# Galaxy S22 APK release — pinned build branch (November 16, 2026)

Branch `mobile/s22-apk-20261116`. It exists only to build **one** new Raialume Preview APK for the S22.
**Never run the web updater from this branch:** it carries `scripts/android-refresh.sh`, which the live
updater's allowlist deliberately does not take.

## What the APK carries

App source (`app/ components/ lib/ hooks/ types/`) is exactly `7e7ec20520e4`
(`release/discreet-privacy-20261116`, live on the web):

| Commit | Change |
| --- | --- |
| `7f63d52` | S22 repair (PR #50): chat width with the keyboard, Live Video single header, no zoom, colours handed to the room, controls off the face, real header buttons |
| `9ed4737` | Gallery Public lock, chat video playback, job progress |
| `672cfba`, `49b4a36` | video requests go to chat, never the still-image shortcut |
| `7e7ec20` | discreet Public chip, Private rows left out |

`package.json`, `package-lock.json` and `app.json` are unchanged, so this is a new JavaScript bundle in the
existing native project. No `expo prebuild`, no new module, no key, Firebase or OAuth change. The 1–120 s
FramePack work on PR #51 is backend, migration and scripts only; the phone needs nothing from it, so the
APK is built once, after it, from this same pin. If PR #51 ever changes the frontend, this pin must move first.

Added on top of `7e7ec20`, nothing else:
- `scripts/android-refresh.sh` and `scripts/test-android-refresh.sh`, byte for byte from
  `feat/android-refresh-web-theater-20261115` (`1113817`; blobs `ee117df4…`, `1174596b…`).
- `scripts/android-s22-release-check.sh` (read-only): `source` proves this clone's app source is the pin and
  contains `7f63d52`; `apk NEW.apk` proves the bundle carries each change above and none of the removed text.
- This document.

## Checked in the cloud (no device, no build host)

- `node --test tests/*.test.cjs`: 158 pass, 0 fail. `npx tsc --noEmit`: clean.
- `scripts/test-android-refresh.sh` (offline stand-ins for adb, aapt2, apksigner): all checks passed.
- `scripts/android-s22-release-check.sh source`: OK.
- An Android Hermes bundle exported from this branch (`npx expo export --platform android`, fictional settings)
  passes `android-s22-release-check.sh apk`, and also contains `android-refresh.sh`'s own marker
  ("Video currently unavailable"). A stand-in bundle with the old text fails it, as it should.

Not done: the real Gradle build, signing, ADB, the phone.

## Steps on the build host (owner-gated; one command at a time; go on only after `RESULT …: OK`)

Wait until the current FramePack job has finished; nothing here touches the API, worker, database or GPU,
but the Gradle build is heavy on the host. Native project: `/home/brett/lumen-android-builds/preview.ijhcJd`.

```bash
# A full (not shallow) clone in its own directory, separate from the live checkout and the native project.
git clone https://github.com/brettbaysinger-boop/lumen-app ~/lumen-s22-apk && cd ~/lumen-s22-apk
git fetch origin '+refs/heads/*:refs/remotes/origin/*'        # all branches: build-check tells local edits apart
git checkout mobile/s22-apk-20261116
git rev-parse HEAD                                            # note it: the mobile release SHA
scripts/android-s22-release-check.sh source
scripts/android-refresh.sh phone                              # read-only: which APK is installed now
scripts/android-refresh.sh backup                             # copy of the installed APK; note sha256 and signer
scripts/android-refresh.sh build-check                        # read-only; if it names local edits, stop and send them
ANDROID_REFRESH_CONFIRM=build:<12 printed> scripts/android-refresh.sh build
scripts/android-refresh.sh verify <APK printed by build>      # same package, same signer, versionCode, public settings
scripts/android-s22-release-check.sh apk <APK>
sha256sum <APK>
ANDROID_REFRESH_CONFIRM=install:<first 12 of sha256> scripts/android-refresh.sh install <APK>
```

`install` is `adb install -r`: app data, sign-in, drafts and notifications stay. Nothing is uninstalled, cleared
or re-signed.

**Rollback:** `ANDROID_REFRESH_CONFIRM=rollback scripts/android-refresh.sh rollback` puts back the APK from
`backup`.

## Report back

The mobile release SHA (`git rev-parse HEAD`), the outputs of `verify` and `android-s22-release-check.sh apk`,
the APK sha256, then the device results.

## S22 acceptance

The 10 checks in `docs/android-s22-repair.md` (Chat width with the keyboard, header buttons, one header and
no band in Live Video, matching colours, switch off the picture, Theater controls stepping aside, turning the
phone, returning to Chat after typing in Live Video, Public / Private), plus:

11. The discreet Public chip fits the native Chat header on the S22 (the header row wraps on phones; not yet seen on a device).
12. In Public, Gallery shows only the lock page; in Private it shows photos and videos.
13. Ask Lumen for a short video in chat: progress shows, and the finished video plays in the chat.
14. Voice reply, push notifications and Google sign-in still work.

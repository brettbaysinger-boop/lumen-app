# Live Room: turning the phone (automatic landscape Theater) — November 16, 2026

Issue #37. Draft, stacked on the Live Room PR (#26, `d0bea7d`). Nothing here was built into an APK,
installed or deployed, and **none of it has run on a phone**.

## What happens

- With the Live Room on screen and Android's Auto rotate on, turning the Galaxy S22 sideways rotates
  the screen and shows **Companion Theater** by itself, immersive: status bar and navigation bar
  hidden, the whole 3:2 frame at full height, black at the sides. No tap.
- Turning it upright restores exactly what was showing before (Video Chat, or Theater with its
  messages panel as it was) and the system bars.
- Layout only, like every other view change in the room: the same web view, the same `<video>`
  element, the same WebRTC session, GOLD V2 lip-sync and speech uninterrupted. Nothing is reloaded.
- The rest of the app stays portrait: Chat, My Day, Gallery, Documents, Practice, and this screen
  too while it shows the sign-in page, an error, or is in the background.
- **Android's Auto rotate setting is respected.** With rotation locked, the room does not turn.
- While the keyboard is open the screen is held as it is, so typing is not turned over mid-word.
- While the bars are hidden, a swipe from the edge shows them briefly (Android's own behavior),
  so Back and Home stay reachable.
- Without live video there is no Theater: sideways then shows Video Chat in landscape, bars hidden.
- The manual Theater and Full screen controls remain, as the fallback.

## How: investigated first, and no new native module is needed

The comment on PR #26 and Issue #37 asked to look at Expo Router's native-stack screen options before
adding a dependency. Read in the installed `react-native-screens` 4.16.0 source
(`ScreenWindowTraits.kt`), which is already in the app's native build:

| Option on a stack screen | What it does on Android |
| --- | --- |
| `orientation` | sets the activity's requested orientation while that screen is in front. `'default'` is "Android decides", which follows Auto rotate. |
| `statusBarHidden` | hides the status bar through `WindowInsetsControllerCompat`. |
| `navigationBarHidden` | hides the navigation bar the same way, with "show briefly on swipe". |

That is everything this feature needs, so **`expo-screen-orientation` and `expo-navigation-bar` are
not added**. `package.json`, the lock file and `app.json` (`"orientation": "portrait"`) are unchanged.
No browser full-screen request is made on rotation.

One property of that mechanism shaped the change: once any screen states an orientation, a screen
that states none is left *free to turn*. So the root layout now states portrait for every screen,
and the Live Room screen alone overrides it. Without that line the whole app would rotate after the
first visit to the room.

The states (`lib/room-rotation.ts`):

| Situation | Orientation | Bars |
| --- | --- | --- |
| Any other screen | portrait | shown |
| This screen, room not showing (sign-in, error, background) | portrait | shown |
| Room showing | Android decides (Auto rotate) | hidden when sideways |
| Room showing, keyboard open | held as it is | hidden when sideways |
| The page's own Full screen just ended | portrait for a moment, then as above | |

The app tells the page which way the phone is held with two fixed lines
(`lumenroomlandscape` / `lumenroomportrait`); the page tells the app one more fixed word
(`restored`) when its own full screen ends. As before: no data in either direction. The page never
guesses from the window's shape, because a portrait window with the keyboard open is also wider than
it is tall.

## Guarded build, and the way back

Because nothing native is added, this is still a **JavaScript-only refresh** of the existing protected
native project, with the existing script and its guards. On the Android build host, from a reviewed
clone at this PR's exact commit:

```
scripts/android-refresh.sh inventory         # read-only
scripts/android-refresh.sh phone             # read-only: confirm which APK is installed NOW, by sha256
scripts/android-refresh.sh build-check       # read-only: must pass, and must list react-native-webview
```

Stop there for review. Only with the owner's go, and never before the preflight output was read:

```
ANDROID_REFRESH_CONFIRM=build:<first 12 of the commit> scripts/android-refresh.sh build
scripts/android-refresh.sh backup            # copy of the installed APK, phone unchanged
scripts/android-refresh.sh verify NEW.apk    # read-only: same package, signer, version code
ANDROID_REFRESH_CONFIRM=install:<first 12 of NEW.apk's sha256> scripts/android-refresh.sh install NEW.apk
```

Way back, without uninstalling and without clearing data:
`ANDROID_REFRESH_CONFIRM=rollback scripts/android-refresh.sh rollback` (or with a named kept APK).
The script keeps the previous JavaScript source and release APK of the build tree; signing,
`google-services.json`, `android/`, `package.json` and `node_modules` are never touched by it.

The room itself is drawn by the web build of PR #26 plus this PR. **A new APK against the current
website shows the full website and does not rotate into Theater** (the room never reports itself, so
the screen stays portrait). Web and APK are separate gates.

**If the phone shows that the stack options are not enough** (for example the activity does not
rotate, or the bars do not hide on Android 16): the owner-approved fallback is
`expo-screen-orientation`, installed with `npx expo install expo-screen-orientation` so that Expo
picks the SDK 54 version (9.0.x, not the current 58.x), in a **checksummed copy** of the build tree,
never in the tree itself, with the Gradle and autolinking output read before any APK is signed.
That is a native rebuild with its own review; it is not part of this PR.

## Checks on the Galaxy S22 (after PR #26's checks pass)

Auto rotate **on** unless stated. Run once with gesture navigation and once with three buttons.

1. Chat, My Day, Gallery, Documents, Practice: turn the phone. They stay portrait.
2. Open the Live Room, wait for Live. Turn sideways: the screen rotates, Theater appears, status and
   navigation bars are gone, the picture fills the height, whole frame. No tap was needed.
3. The video did not blink, reload or reconnect. Do it while Lumen is speaking: speech and lip-sync
   continue, once.
4. Turn upright: the earlier view is back, with the conversation where it was scrolled and any typed
   text still in the message box. Bars are back.
5. In Theater with Messages open, turn sideways and back: still Theater, panel open again.
6. Tap the message box, type, turn the phone: the screen does **not** turn while the keyboard is
   open. Close the keyboard: it follows the phone again.
7. Sideways: swipe from the edge, the bars appear briefly. Android Back returns to Video Chat. The
   three controls are clear of the camera cut-out.
8. Sideways, tap Full screen, then leave it: rotation still follows the phone afterwards.
9. Auto rotate **off**: the room does not turn. Theater and Full screen work by hand.
10. `‹ Chat` while sideways: the native chat is portrait with its bars. Then the tabs: all portrait.
11. Home while sideways, return: no double speech, not stuck sideways, bars correct.
12. Sign-in page, an error message, Documents opened from the room: turning does nothing wrong;
    nothing is left sideways or without bars.
13. A notification arriving while sideways: the room is undisturbed.

Any restart of the video, lost or doubled speech, a screen left sideways or without bars elsewhere
in the app, or a tap needed before rotation works, is a FAIL.

## Not proven here

Everything on the phone. In particular: that these stack options act on this app's activity on
Android 16 as the source says; that the activity is not recreated on rotation (the protected
project's manifest is not in this repository); insets around the cut-out in landscape; and step 8.

## Tests

`node --test tests/*.test.cjs`: 127 pass. `scripts/test-animated-live-room-browser.cjs` plays the
app's two fixed lines: sideways gives Theater, upright restores the earlier view (including an open
messages panel), a keyboard-height window does **not** count as sideways, and one `<video>` element,
one connection and one offer hold throughout. The orientation states above and "every screen states
portrait" are unit-tested. `scripts/test-android-refresh.sh` and `scripts/test-animated-web-update.sh`
pass; all changed files fit the web updater's unchanged frontend-only rule.

# Live Room: turning the phone (automatic landscape) — November 16, 2026

Draft, stacked on the Live Room PR (#26). Owner decision of November 16: **native rotation, Live Room
only**. Nothing here was built into an APK, installed or deployed, and none of it has run on a phone.

## What happens

- With the Live Room on screen, turning the Galaxy S22 sideways rotates the screen and shows
  **Companion Theater** by itself: the whole 3:2 frame at full height, black at the sides. No tap.
- Turning it upright puts back exactly what was showing before: Video Chat, or Theater with its
  messages panel as it was.
- It is layout only, like every other view change in the room: the same web view, the same `<video>`
  element, the same WebRTC session, speech uninterrupted.
- The rest of the app stays portrait: Chat, My Day, Gallery, and also this screen while it shows the
  sign-in page, an error, or is in the background. Leaving the screen restores portrait.
- **Android's own auto-rotate setting is respected.** With rotation locked in the phone's quick
  settings, the room does not turn; the Full screen control in Theater still works.
- While the keyboard is open the screen is held as it is, so typing is not turned over mid-word.
- Sideways, the status bar is hidden. **Android's navigation bar stays** (a thin handle with gesture
  navigation, three buttons otherwise). Hiding it too needs a second native module
  (`expo-navigation-bar`) and is not included. For bars fully hidden: the Full screen control.
- Without live video there is no Theater: sideways then shows Video Chat in landscape.

## Why it needs a native change, and how it is gated

The app is portrait-locked and React Native has no call to unlock one screen. This uses the native
part of **`expo-screen-orientation` 9.0.9** (the version for Expo SDK 54): one call, `lockAsync`, with
0 (Android decides), 3 (portrait) or 5 (landscape).

The app looks for that native part when the Live Room opens. **If the build does not have it, nothing
changes**: the screen stays portrait, no rotation is attempted, the page is told nothing, and the
Full screen control remains. So:

- This repository's `package.json`, `app.json` (still `"orientation": "portrait"`) and lock file are
  unchanged, and the JavaScript-only refresh (`scripts/android-refresh.sh build`) of today's native
  project keeps working and simply does not rotate.
- The web side still passes the guarded web updater's unchanged frontend-only rule.
- `scripts/android-refresh.sh build-check` now reports whether the native project lists
  `expo-screen-orientation`, next to the same line for the web view.

**The native step is the owner's, in the protected build tree, and is not done by any script here:**
add `expo-screen-orientation@~9.0.9` to that project (its `package.json` and `node_modules`), then
build with the project's own Gradle release build as usual. Expo modules are linked at Gradle time,
so no `expo prebuild`, no manifest edit, no signing change; same `com.raialume.preview`, same signer,
same version code, same rollback APK. Keep a copy of the tree first. If the build or the phone
misbehaves, the previous APK is the way back, and a build without the module behaves as PR #26.

## Checks on the Galaxy S22 (after PR #26's checks pass)

0. `build-check` says "native project lists expo-screen-orientation". Android auto-rotate **on**.
1. Chat, My Day, Gallery: turn the phone. They stay portrait.
2. Open the Live Room, wait for Live. Turn sideways: the screen rotates, Theater appears, the picture
   fills the height, whole frame, status bar gone. The video did not blink or reconnect. Do it while
   Lumen is speaking: speech continues.
3. Turn upright: Video Chat is back as it was, bars back.
4. In Theater with Messages open, turn sideways and back: the panel is open again afterwards.
5. Tap the message box, start typing, turn the phone: the screen does **not** turn while the keyboard
   is open. Close the keyboard: it follows the phone again.
6. Sideways: the three controls are clear of the camera cut-out and the navigation bar. Android Back
   returns to Video Chat (and the screen stays sideways until turned).
7. Sideways, tap Full screen, then leave it: rotation still follows the phone afterwards.
8. Android auto-rotate **off**: the room does not turn. Full screen still does what it did.
9. Press `‹ Chat` while sideways: the native chat is portrait. Home and return: no double speech.
10. On the sign-in page or an error message inside this screen: turning does nothing.

Any restart of the video, lost speech, or a screen left sideways elsewhere in the app is a FAIL.

## Not proven here

Everything on the phone. In particular: that the activity is not recreated on rotation in the
protected project (it should not be: React Native's manifest handles orientation changes itself,
but that manifest is not in this repository), the cut-out and navigation-bar insets in landscape, and
how the web view's own full screen and this rule interact on Android 16 (step 7).

## Tests

`node --test tests/*.test.cjs`: 127 pass. The browser test (`scripts/test-animated-live-room-browser.cjs`)
now also plays the app's two fixed lines: sideways gives Theater, upright restores the earlier view
(including an open messages panel), a short keyboard-height window does **not** count as sideways,
and one `<video>` element, one connection and one offer hold throughout. The native rule (which lock
when) and the guard (no native part, no rotation) are unit-tested with stand-ins.

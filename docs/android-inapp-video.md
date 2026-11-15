# Live video inside the Android app, and phone layout (Issue #19) — November 15, 2026

Draft for review. Nothing here was built into an APK, installed or deployed. Builds on the Android
refresh (PR #17); the scene selector (PR #18) is not touched.

## Feasibility: what is known and what only the phone can answer

| Question | Answer |
| --- | --- |
| Is a web view already in the app? | `react-native-webview` 13.15.0 is in `package.json` since before the last accepted APK. Whether its native part is in the **installed** build depends on the native project's own `package.json`; `scripts/android-refresh.sh build-check` now reports this. The app also checks at run time and never loads it where it is absent. |
| Can Android System WebView do what the page needs? | It is Chromium, so `RTCPeerConnection`, data channels, `canvas.captureStream`, Web Audio and inline video are expected to exist. **Not proven on the S22.** The screen runs a capability probe before the page loads and refuses, with the reason, if anything is missing. The WebRTC connection itself (ICE to the bridge over Tailscale, sound unlock) can only be judged by watching it on the phone. |
| Camera or microphone permission? | Not needed. The page only receives video and sound; its outbound tracks are blank placeholders. |
| Sign-in inside the view | Separate from the app's, kept by the web view between visits. Email and password work in the view. **Google sign-in will not**: it leaves the Lumen web address (and Google refuses embedded views), so it is blocked with a message pointing to the browser. Nothing of the app's own session is passed in. |
| Landscape | The app is locked to portrait in its native configuration. Turning the phone will not rotate the in-app view. The page's Full screen control may still work inside the view; unverified. True landscape needs a one-line native configuration change in the protected build tree, which is the owner's decision and is **not** made here. The browser route already rotates. |
| Double navigation | The screen is a root screen: the app's tab bar is not shown. The web app inside still shows its own bottom tabs. A video-only web page would remove that, but needs a web change and a web deploy; proposed as the next step only if the probe passes. |
| `react-native-webrtc` | Not needed unless the probe fails on the phone. Not added. |

## What this PR adds

**In-app Live video (Android only, guarded).** When video is running and the web view exists in the
build, the Live video dialog offers *Cancel / Browser / Watch here*. *Watch here* opens a screen with
a slim bar (‹ Chat, Live video, Browser ↗) and the Lumen web app below it.

- Only the Lumen web address (https, same host and port) loads. Every other navigation is refused
  inside the app and is not handed to any other app.
- No token, cookie or password goes into the page. The only script injected is the capability probe,
  which reports five yes/no answers and reads nothing.
- Leaving the screen, pressing Back, or putting the app in the background removes the web view, which
  ends its video session and sound. The native chat screen keeps no video session of its own.
- If the web view is missing, the probe fails, or the page does not load, the screen says so and
  offers the browser. The browser route from PR #17 is unchanged.

**Phone layout** (phone widths only; desktop unchanged; applies to the web app at phone width too):

- Chat header in two rows: name and model, then the actions. The resting word "Conversation" is left
  out on phones; "Thinking…", "Refreshing…" and "Saved on device" still show.
- Reminder banner starts below the status bar (top safe-area inset).
- Around the composer: the two effort helper lines and the tagline are not shown on phones, and the
  effort choices disappear entirely while the model offers no choice. This returns about 40 pixels
  of height to the conversation at 360 px width.
- Bottom tab bar already sits above the system navigation bar (bottom inset) and hides while the
  keyboard is open; unchanged.

Rendered and measured here at 320x568 and 360x660 in headless Chromium with stand-in data: header
actions do not collide, the composer and tab bar are fully inside the window, the page does not
scroll. **Not** rendered here: the native app, the status bar, the keyboard, the video itself.

## Device checks (owner, after a guarded build of this commit)

1. `build-check`: note the line about `react-native-webview`. If it says the project does not list
   it, the build will only offer the browser; stop and report, do not edit the project.
2. Chat: header in two rows, nothing cut off, with the largest system font too. Reminder banner below
   the clock. Composer and Send visible; with the keyboard open the tab bar hides and the input stays
   above the keyboard.
3. Live video ↗ with video running: *Watch here*. Expected: the Lumen sign-in page inside the app.
   Sign in with email and password. Turn Animated on. Report exactly what happens: video shown or not,
   lip-sync, sound, any message on the screen.
4. If a message names missing features, that is the feasibility answer: send it as written.
5. Press Back: returns to chat, no sound continues. Open again: still signed in.
6. Home button while video plays: sound stops. Return: the page reloads, no double speech.
7. Tap a Google sign-in button inside the view: refused with a message; nothing else opens.
8. *Browser* still opens Chrome as before.

Rollback is unchanged: `scripts/android-refresh.sh rollback`, or with a named earlier APK.

## Tests

`node --test tests/*.test.cjs` (113), `scripts/test-android-refresh.sh`, `npm run typecheck`, an
Android JavaScript export of this commit, and phone-width renders of the web build.

# Live Room: Video Chat + Companion Theater (Option C) — November 16, 2026

Draft for review. Implements the design in PR #24 (`docs/LIVE-ROOM-CHAT-THEATER-20261115.md`) on top
of PR #20 (`67e8613`). Nothing here was built into an APK, installed, deployed or merged.

Not touched: GOLD V2, MuseTalk, Helios, RMC, Supabase (no migration, no new query), the Lumen API,
the avatar bridge, `lib/animated-companion.ts` (the WebRTC session), the signing and rollback scripts.
Not included: the scene selector (PR #18) and floating Lumen (Issue #23).

## What it is

The Live Room is a second **layout** of the existing chat screen in the web app, asked for by one
static word in the address: `?room=live`. The phone app's in-app view (PR #20) now loads that address.
Same screen, same avatar session, same `<video>` element; no second video path.

**Video Chat (default)**

- One header row: `‹ Chat` (closes the in-app screen), the companion's name with a short status
  (Live / Connecting… / Video off / Thinking…), a **Theater** button, and `⋯`.
- One row of real buttons: **Live** (a switch, filled when on), **Documents**, **Practice**.
- The whole 3:2 frame, at most 38% of the window height, then the conversation in its own scrolling
  region, then the message box, always on screen.
- `⋯` holds Conversations (history), Open in browser, and the model choice. The model name is no
  longer printed in the header.
- Gone from the room: the website's tab bar, the size choices (Shrink / Expand / Full screen), the
  word "Conversation", the tagline. The effort helper lines were already removed on phones by PR #20.
- With the keyboard open the window is short: the video shrinks and the buttons row steps aside, so
  the conversation and the message box keep their place.
- Opening the room turns live video on once, if the server offers it. Turning it off is respected.

**Companion Theater**

- The video takes the whole space, as the largest whole 3:2 frame that fits (letterboxed in
  portrait). Never cropped, never stretched.
- Two controls over the picture: `‹ Video Chat` and `Messages`. Messages opens a panel **under**
  the picture with the same conversation and message box; tap again to collapse it.
- Android Back in Theater returns to Video Chat. Back in Video Chat leaves the screen, as before.
- **Full screen** (third control, shown where the browser can do it): the whole page goes into the
  browser's own full screen. Inside the phone app, the app's web view then hides Android's status and
  navigation bars and **lets the phone be turned sideways**; in landscape the frame fills the screen
  height, with black at the sides, because the whole 3:2 frame is kept. Leaving full screen (the
  control, Android Back, or leaving Theater) puts the bars and portrait back. Back is two steps: out
  of full screen first, then to Video Chat.
- This needs **no native change**: no orientation unlock in `app.json`, no new native module. It uses
  what `react-native-webview` 13.15.0 already does for a full-screen page (`allowsFullscreenVideo`,
  on since PR #20). The rest of the app stays portrait. Without Full screen, Theater is
  near-fullscreen: Android's bars stay visible and the phone does not rotate.
- The frame is never cropped. Filling a landscape screen edge to edge would cut the top and bottom
  of the picture; that is an owner decision and is not made here.
- No Mini button: floating Lumen is not built.

**One session.** Switching views changes styles only. `setRoomMode` never calls connect or close; the
`<video>` element stays the same element in the same place in the page. The browser test counts
connections and offers across repeated switching: one of each.

## The phone app and the page

The page and the app exchange six fixed words (`ready`, `gone`, `chat`, `theater`, `close`,
`browser`) so that there is one header at a time, and the app sends the page one fixed line when
Back is pressed in Theater. No token, cookie, account detail, address or conversation text travels
either way; anything else a page posts is ignored. The origin allowlist and the fail-closed
capability probe from PR #20 are unchanged.

While the room's header is not on screen (the sign-in page, Documents, a load failure) the app's own
bar (`‹ Chat`, `Browser ↗`) is shown, so there is always a way out.

**Order of release matters, and both orders are safe.** The room is drawn by the *web* build. A new
APK with the current website shows the full website under the app's bar, exactly like PR #20's
canary. The current APK with a new web build is unaffected (it does not ask for the room). The room
appears only when both are in place.

## Appearance: why the embedded view showed other colors

The embedded view is a separate browser with its own sign-in. Its colors come from the same place as
the app's: `ThemeProvider` reads `user_appearance_preferences` for the signed-in account. The code
path was read end to end and no defect was found in it; the room uses it as is, and the browser test
confirms that an account with a charcoal background and amber accent gets those colors in the room.

So the navy seen on the S22 means the embedded view did not receive the account's row. There are
three ways that happens, and they cannot be told apart from here (it needs the phone and the
account, and Supabase is not to be touched):

1. **The app's colors never reached the account.** The app keeps a copy on the phone and shows it
   even when saving to the account fails. Until now it said nothing about that.
2. **The embedded view is signed in to a different account** than the app (for example Google
   sign-in in the app, email and password in the view).
3. **The view could not read the account** at that moment; it retries every 15 seconds.

What this PR adds is the means to tell: Settings → Appearance now states, from the existing
synchronization, "Saved to your account", "Saving…", or "Not saved to your account: it could not be
reached from this device". No new theme path, nothing passed into the web view.

## Checks on the Galaxy S22 (owner)

Needs a guarded build of this commit (`scripts/android-refresh.sh build-check`, then `build`, `verify`,
`install` as in PR #17: same `com.raialume.preview`, same signer, version code 1, no uninstall, no
data clear) **and** this commit's web build served at the Lumen web address. Rollback is unchanged:
`scripts/android-refresh.sh rollback`; the web app has `scripts/animated-web-update.sh rollback`.

Write down what you see for each. If any step restarts the video, that is a FAIL.

1. **Appearance first.** In the app: Settings → Appearance. Note the status line exactly.
   "Saved to your account" → continue. "Not saved…" → that is cause 1 above; report it.
2. Chat → Live video → **Watch here**. If asked, sign in with email and password **using the same
   account as the app**. Expected: one header (`‹ Chat  Lumen ● Live  Theater  ⋯`), the three
   buttons, the video, the conversation, the message box. No website tab bar. No second header.
3. **Colors** match the rest of the app. If not, and step 1 said "Saved": cause 2 or 3. Open
   `⋯` → nothing there shows the account, so check the email used at sign-in and report it.
4. **Video and sound.** Lumen is animated. Send a message: the reply is spoken with lip-sync, once.
5. **Scrolling.** Drag the conversation: it scrolls under the video; the video and message box stay.
6. **Keyboard.** Tap the message box. The keyboard opens, the message box sits just above it, the
   video becomes smaller, nothing is hidden behind the keyboard. Close it: everything returns.
7. **Theater.** Tap Theater. The picture fills the width with black above and below, the whole
   frame visible (check all four corners of the scene). The video did not blink, restart or go
   silent. Speak to Lumen first and switch during the reply: the speech continues uninterrupted.
8. **Messages** in Theater: the panel opens under the picture; type and send from there. Collapse it.
8a. **Full screen and sideways.** In Theater tap Full screen. Android's status and navigation bars
    disappear. Turn the phone sideways: the picture rotates and fills the height, whole frame visible,
    black at the sides. The video did not restart; speech continues. Check that the three controls are
    not under the camera cut-out. Open Messages sideways and type. Turn back upright. Android Back:
    first leaves full screen (bars return, portrait), second returns to Video Chat. Also swipe from
    the edge while full screen: the bars show briefly and hide again.
9. **Back.** Android Back in Theater → Video Chat (video still running). `‹ Video Chat` does the
   same. Switch back and forth five times: no reconnection, no "Connecting…".
10. **Live off / on.** Tap Live: video stops, the button reads "Live · Off", Theater is greyed out.
    Tap again: it connects once.
11. **Documents** and **Practice** open; "Back to conversation" returns to the room.
12. **Leaving.** `‹ Chat` returns to the native chat, no sound continues. Home while video plays:
    sound stops; returning reloads the room, no double speech.
13. **System bars**, three-button navigation and gesture navigation: nothing of the room is under
    the status bar or the navigation bar, in both views.
14. **Largest system font** and **TalkBack**: every control is reachable and named (Live video
    switch, Open your documents, Open goals and practice, Switch to Companion Theater, More actions,
    Leave Companion Theater and return to Video Chat, Show / Hide the conversation).
15. `⋯` → **Open in browser** still opens Chrome as before.

## Not proven here

- Anything on the phone: the native screen, the keyboard inside Android System WebView, the system
  bars, sound, TalkBack. **Full screen on Android 16 in particular**: that the bars hide and the
  phone rotates is read from the web view's source, not seen on the S22. The native keyboard handling (`KeyboardAvoidingView` around the web view) is
  the least certain part and is step 6.
- The real avatar. The browser test uses a stand-in WebRTC connection that delivers a 768x512 picture.
- The cause of the color mismatch (see above).

## Tests

- `node --test tests/*.test.cjs`: 123 pass (113 before; `tests/live-room.test.cjs` is new).
- `scripts/test-live-room-browser.cjs` (new; headless Chromium against the web build, at 320x568,
  360x660, 390x844 and 412x915): no tab bar, header / buttons / video / conversation / message box
  inside the window and not overlapping, real buttons, whole 3:2 frame in both views, keyboard-height
  window, Theater and its messages panel, a sideways window, full screen, Back, the account's colors, only the fixed words posted,
  and one `<video>` element, one connection and one offer throughout. Also that the ordinary website
  (no `?room=live`) keeps its tabs, header and size choices.
- `scripts/test-animated-size-component.cjs` (extended): the room's views on the same element with
  no call on the session. `scripts/test-chat-scroll.cjs`, `scripts/test-android-refresh.sh`,
  `npm run typecheck`, `expo export` for Android and web: pass.
- Already failing on PR #20's commit, unchanged by this one: `scripts/test-chat-cache-component.cjs`
  and `scripts/test-chat-management-component.cjs` (their stand-in for the avatar session is not a
  constructor) and `scripts/test-effort-work-browser.cjs` (looks for the effort refresh button that
  PR #20 removed at phone width).

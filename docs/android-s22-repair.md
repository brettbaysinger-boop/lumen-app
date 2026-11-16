# Android Galaxy S22 repair: Chat and Live Video — November 16, 2026

Base: the deployed web release `release/public-private-20261116-r4` @ `cdd05a2` (Live Room, automatic
landscape, Public / Private). Frontend only: no backend, memory, authentication, Supabase or native
module change. `package.json` and `app.json` are unchanged, so the phone needs a new JavaScript bundle
in the same signed app, and the web server needs the same frontend files.

Nothing here was deployed, built into an APK or installed. **The repair is not complete until the
acceptance list below passes on the real Galaxy S22.**

## What the owner's S22 screenshots showed, and why

| Problem | Actual cause | Fix |
| --- | --- | --- |
| Chat zoomed sideways: messages, the Private switch and the message box run off the right edge | The chat's keyboard-avoiding view uses React Native's `height` mode on Android. While it believes a keyboard is up, that mode sets the view to `flex: 0`. The view sits in a **row** (beside the conversation sidebar), so its width became the width of its widest content instead of the screen. Reproduced in Yoga (React Native's layout engine) with this screen's nesting at 360 px: the view becomes 736 px wide and the Private switch starts at x≈248, matching the screenshot (≈255). | The view keeps the screen's width (`width: 100%`) on the phone. |
| Chat unusable after returning from Live Video | The chat screen stays mounted under Live Video and hears the keyboard opened in the Live Video web view. A hide it never hears leaves it in "keyboard up" (the state above), with no keyboard on screen. | The view is started afresh the first time the chat is shown after Live Video. |
| Two headers in Live Video (app bar "‹ Chat · Live video · Browser" over the room), and Back / turning the phone not following Theater | Android's web view reports every in-page address change (the web app opening a conversation) as a "load start". The app treated each as a new page and forgot that the room was showing; later "chat" / "theater" words were ignored. | Only a real page load forgets the room; "chat" and "theater" (sent only by the room) also mean it is showing. |
| Live Video controls over the companion's face | Theater's controls (Private / Public, Hide messages, Full screen) sit over the top of the picture and wrap onto it on a phone; in Video Chat the switch sat in the picture's top-left. | Theater's controls step aside after 4 seconds; a tap on the picture brings them back ("Show video controls"). In Video Chat the switch is in the row of buttons (windows 680 px and taller, which includes the S22), or in the picture's lower-left corner on short windows. The Quick / Think deeper row is not shown in Theater. |
| Dark band above the video | The page added its own status-bar inset inside the web view, under the app's own. | No top inset for the page inside the phone app. |
| Navy web colours vs the app's dark grey | The room found its colours through its own sign-in and the account's saved copy; when that copy was missing or differed, it showed the default navy. | The app states the colours it is showing to its room before the page starts; the room shows exactly those (display only, nothing saved, browser tabs unaffected). |
| Zoom kept after turning the phone (Live Video) | The web view's default "fit page to screen" (overview) scaling, kept across rotation. | Off in the app (`scalesPageToFit={false}`, `textZoom={100}`), and the room's page fixes its scale at 1 inside the app only. |
| Small, hard-to-hit header actions in native Chat | 12 px text links with no touch area. | Live video, Documents and Practice are real buttons (40 px, outlined) in the phone header. |

Not changed: the model name under "Lumen" in the chat header is the existing model picker, as before.

## Tests run (cloud, no device)

- `node --test tests/*.test.cjs`: 144 pass, 2 fail. The 2 failures (`its allowlist is not widened`, `file naming, which is not widened`) fail identically on `cdd05a2`: the release ships the live updater (97e032f), not PR #26's.
- Web build + `node scripts/test-animated-live-room-browser.cjs`: passes at 320, 360, 360×780 (S22), 390 and 412 px, including: controls step aside and come back, the switch is never in the upper half of the picture, the room shows the phone app's colours, no zoom, no band above the header, browser tabs unchanged.
- `node scripts/test-animated-privacy-mode-browser.cjs`: passes.
- `npx tsc --noEmit`: clean.

Not run: anything on Android. The keyboard-avoiding and web-view fixes are native behaviour and are
proven only by the S22 list below.

## Deploying (owner-approved steps only)

**Web (the room inside Live Video):** the guarded updater, unchanged. Every changed file is under
`app/`, `components/`, `lib/`, `tests/`, `docs/` or `scripts/test-animated-*`.

```bash
scripts/animated-web-update.sh check           # read-only: must say READY, frontend only
LUMEN_WEB_UPDATE_CONFIRM=update:<7 printed> scripts/animated-web-update.sh update
```

Rollback: `LUMEN_WEB_UPDATE_CONFIRM=rollback scripts/animated-web-update.sh rollback`.

**Android:** the guarded `scripts/android-refresh.sh`, unchanged, as in gate 3 of
`docs/public-private-mode-release.md`, in a clone of this branch with `scripts/android-refresh.sh` copied
byte for byte from PR #43's head (it is not in the web release, so the updater's allowlist stays as is).
Add this check after `verify`:

```bash
unzip -p <APK> assets/index.android.bundle | grep -ac __lumenRoomAppearance   # 1 or more: this repair is in the bundle
```

Rollback: `ANDROID_REFRESH_CONFIRM=rollback scripts/android-refresh.sh rollback`.

Both are needed: the web update alone fixes the room's controls, band and zoom; the APK alone fixes the
native chat, the double header and the colours handed to the room.

## S22 acceptance (owner)

Portrait, Private mode, the usual account. Each line is pass or fail; a photo of any failure helps.

1. Chat: type a long message with the keyboard open. Messages, the Private switch and the message box stay inside the screen. Close the keyboard: same.
2. Chat header: Live video, Documents and Practice show as buttons and each opens on the first tap.
3. Live Video opens with **one** header (the room's "‹ Chat"), no app bar above it, no dark band above the video.
4. Colours in Live Video match the native chat (same background and accent).
5. Video Chat: the Private / Public switch is in the row of buttons, not over the picture.
6. Theater: controls show, then step aside after about 4 seconds; tapping the picture brings them back. The Quick / Think deeper row is not shown.
7. Turn the phone sideways in Live Video: Theater fills the screen; upright again returns. Android Back in Theater goes to Video Chat.
8. In Video Chat open the keyboard, type, then tap "‹ Chat". The native chat is normal width, and its keyboard opens and closes normally.
9. Repeat 8 after turning the phone sideways and back in Live Video.
10. Public / Private still works in Chat and Live Video; memories and sign-in unchanged.

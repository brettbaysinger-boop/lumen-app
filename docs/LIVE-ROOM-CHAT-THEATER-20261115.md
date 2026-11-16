# Raialume — Live Room: Video Chat + Companion Theater (owner-approved)
**Decision:** November 15, 2026 (America/Phoenix).  
**Scope:** focused Android/WebView UI over existing Lumen WebRTC/managed GOLD V2 bridge.  
**Baseline:** `lumen-app` branch `feat/android-inapp-video-layout-20261115`, pinned `67e86132d41e57d3d83c9676c6aa8a39720d6149`. Owner confirmed embedded GOLD V2 video works on actual Galaxy S22. No new engine, backend, model, or memory work.

## Owner experience and visual contract
The existing `app/live-video.tsx` hosts the **entire** website in a protected native WebView. This proves in-app video feasible, but three owner screenshots show the web header, model, Animated, Documents, Practice, idle Conversation text, effort controls, message composer, and web bottom tabs crowd each other. The website uses default-looking navy/coral appearance while native controls show the owner's selected charcoal/amber theme. Wide Theater sometimes obscures text and the composer competes with navigation. **Do not call this layout accepted.**

**Mode 1 — Video Chat (default)**
- A compact, genuinely uncropped **3:2** live GOLD V2 view (~35–40% of available height as a *target*, not fixed pixels), its own scrollable recent-messages region, and an always-visible composer/voice/send control anchored above Android system navigation and keyboard insets.
- Header row: Back/Chat, small companion name + concise connected indicator, one clear mode switch (**Theater**), one optional overflow `⋯`. Avoid printing long model ids in primary chrome.
- A restrained second row of **actual pill buttons** rather than adjacent text: Live On/Off (distinct state), Documents, Practice. In Theater, put occasional actions under `⋯` and leave animation uncluttered.
- Eliminate duplicate web tabs inside the embedded room, duplicate Android/native navigation, idle `Conversation` label, effort-helper paragraphs and bottom tagline in the mobile live experience. Preserve accessibility and functional destinations, reachable from the normal app or overflow.
- The conversation must never render behind the video controls; media viewport can shrink as the keyboard opens; message composer stays usable.
- Use the account's **actual selected Raialume appearance** on native room and embedded web. Existing `ThemeProvider` reads saved `user_appearance_preferences` per authenticated user and device cache; investigate mismatched session/account/cache/sync before implementing propagation. Do not copy access tokens or secrets into WebView JavaScript/URL, spoof login, or build a parallel theme system.

**Mode 2 — Companion Theater (immersive, near/full-screen)**
- One tap from Video Chat, another tap returns. Same user session, same video DOM node/WebRTC connection, audio/speech and chosen scene; **changing layout must not renegotiate/disconnect/restart MuseTalk**. No duplicate sessions.
- Hide standard chat header/web tabs, model controls, efforts, reminders, composer, and unrelated actions. Video occupies maximum available area while **preserving full native 3:2 frame** without stretching or clipping; letterbox naturally in portrait. Android system bars may require native immersive configuration; a **near-fullscreen** implementation is acceptable at first if actually hiding system bars is not safe yet. Label accurately.
- Minimal touch/fade overlay: `‹ Chat` / `💬 Messages` (collapsible bottom sheet with last messages and optional typing) / `▣ Mini` (future, disabled/omitted until implemented) / Close. Don't show dead buttons. Ensure toggle and close remain accessible with TalkBack and Android Back.
- Switching between modes must not cause video to restart. If user backgrounds app, old lifecycle continues to end video/sound as current canary does. Returning should not double-speak.

**Mode 3 — floating Lumen (future work, Issue #23)**
- Owner wants draggable mini-video **inside Raialume** while visiting Chat/My Day/Gallery/Docs/Practice, but this is separate after modes 1+2 accepted. Requires a persistent single WebView/session outside the route that currently unmounts; **no second stream**. Android global PiP is a separate feasibility decision. Do not implement in this scope.

## Implementation approach (reuse existing code, not rebuild)
- Prefer a **dedicated web Live Room layout/mode** inside the existing Lumen app, selected by an innocuous static URL path or mode flag (no secrets), loaded by the existing allowlisted native WebView. The web layout reuses `AnimatedCompanionSession`, `AnimatedCompanion`, existing conversation feed and composer logic. Avoid duplicating the ~1500-line chat component, changing the WebRTC bridge or mounting a second video element. Refactor the *smallest shared UI boundaries* necessary to enable a clean room.
- Coordinate Expo Router nested tabs/reminder placement; the native root live-video screen should not show the native tab bar, and embedded web room should not show its own tab bar. In-app Back leaves live view without leaving audio streaming.
- Ensure privacy boundary: only private HTTPS Lumen origin allowed, existing WebView capability probe remains fail-closed with timeout and Chrome fallback. If any native↔web UI events are used, only accept narrow expected message types from the trusted origin, and **never** transmit authorization/session cookies, private chat text or bridge secrets through URL or injected scripts.
- Work from reviewed current PR #20 base `67e86132...`. PR #18 scene selector edits the same chat screen and is **not deployed**; do not add its pending backend/bridge to this task. Protect GOLD V2 video original/cache/snapshot, Helios, RMC, Supabase, Firebase, signing ID and old release APK. No production changes.

## Recommended bounded delivery gates
**A. UI/layout prototype (draft PR):** components, routes and theme bug diagnosis with proof of WebView and browser compatibility. Screenshot/render at 320, 360, 390 and 412 CSS px with video active and messages, buttons and full-width keyboard; include large font, long model name, unread reminders, poor network.
**B. Real S22 acceptance (owner):** signed APK built via existing `scripts/android-refresh.sh` guards (same `com.raialume.preview`, signer and version code/rollback), no uninstall or data clear. Confirm real video and audible lip-sync; Chat↔Theater transitions without WebRTC re-offer or double speech; composer and chat scroll visible; header/buttons usable, theme matches; Back/Home/keyboard/TalkBack status + bottom bars, Chrome fallback and permissions. If switching reinitializes avatar, FAIL.
**C. Production rollout separately:** review branch ancestry (avoid overwriting live Wide Theater or PR #17), web+native coordinated incremental release with backups. No web/live service deployment without explicit owner go.

## Negative scope
No custom video or memory engine, no FramePack generation, no scene-switch backend, no theme migration, no native PiP, no extra model downloads, no default app-wide service start/stop. No tentative `Mini` button as if implemented. No invented acceptance results.

## References
- Master checkpoint: `lumen-app` Issue #21 and draft status PR #22.
- Mobile canary: Issue #19, PR #20; owner November 15 screenshots show GOLD V2 live in embedded view but layout and theme mismatch.
- Floating mini: Issue #23 (later).
- Scene selector: `lumen-app` PR #18 + `lumen-avatar-lab` PR #5 (HOLD until independent acceptance).

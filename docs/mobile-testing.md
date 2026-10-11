# Mobile testing and connection resilience

## Agreed direction — October 10, 2026 (America/Phoenix)

Android first; iPhone testing follows using the shared Expo/React Native app.
Priorities: fast cached chat opening and connection recovery; installable Android
preview; owner-specific companion onboarding and a mobile navigation refresh;
reliable background jobs and push notifications; iPhone testing.

The user reports that the domains have already been purchased and plans to get
a VPS. Domain names, provider, server sizing and proxy topology have not been
verified in this increment. AI services remain on existing machines. A stable
HTTPS endpoint and reliable server access are required for remote inference.
Caching does not eliminate that connection requirement.

Raialume is the app identity; Lumen is the existing user's companion. New owners
should be able to create a named companion with portrait, identity, conversational
style and available voice selection. Preserve existing companions and history.
Suggested mobile navigation: Chat / My Day / Companion / More, with secondary
access to Memories, Gallery, Documents and Settings. This is a proposal, not an
implemented navigation change.

Push scope: completed replies/images, reminders and optional companion check-ins.
Use opt-in categories, quiet hours and private notification previews. Standard
mobile push depends on FCM/APNs (direct or through Expo). Server jobs must survive
client disconnection before reply-ready push can be reliable. These features
are not implemented by this patch.

## Chat management — additional requested scope

The user notes that end users need ways to rename, delete and consolidate chats.
Add a reachable chat overflow menu and history management controls in the next
chat increment: rename, archive/unarchive, search and deliberate deletion.
Offer organizing related chats and a source-linked summary as an initial
consolidation approach; exact grouping UX and physical transcript merging remain
undecided. Do not rewrite conversation IDs, memory provenance or revision receipts
merely to consolidate the visible history.

Define deletion behavior before implementation: whether it removes only the chat,
its attachments and/or derived memories, plus associated server retention. Cache
invalidation must prevent removed chats from reappearing after reconnection.
Owner authorization and pending job handling must be verified. No chat management
control or conversation deletion is included in this cached-chat patch.

## Cached-chat candidate based on d71fce9

- Account-scoped device storage contains the current companion, up to 20 recent
  conversations and the last 200 cached messages per conversation.
- Serialized cache is capped at two million characters; oversized message
  histories are evicted before text drafts. Images/audio/files are not downloaded.
- Existing cached users can enter chat without waiting for companion provisioning.
  A locally available Supabase session is still required. This is not offline
  authentication, a workaround for expired sessions, or first-login offline support.
- Saved chats render before server refresh. Failed reads retain cached data and
  show a retry control. Chat read requests have a 12-second abort deadline.
- Separate text drafts survive conversation switching and reopening. Draft text
  remains persisted during an attempted send until completion is confirmed.
- Retry, foreground return and browser online events refresh server data.
- Message response guards prevent a late request replacing another conversation.
- Cache writes are serialized/coalesced and owner-scoped. Sign-out removes this
  private cache, cancels queued writes and blocks old-account late writes.
  Existing appearance preferences are preserved.

No automatic message submission, durable send queue, inferred delivery receipt,
background AI job, offline model, push registration, native auth rewrite or Android
binary is added. A retained draft from a disrupted send may already have reached
the server; the next increment must reconcile request identity before retrying.
Cached metadata is historical and does not authorize server actions.

No service restart, migration, provider/voice configuration or source backup
change is required by this frontend-only candidate. Memory relevance, skills and
proposal work remain paused.

## Validation and acceptance

Locally passed: 17 Node tests (including six cache behavior tests and two deadline tests), TypeScript,
exported web build, and a React component runtime check for cached hydration,
backend-unavailable reload, separate drafts and stale message response isolation. Auth component checks also
cover cached bootstrap, new-user provisioning and sign-out cleanup.
Tests use synthetic accounts and messages, not private customer or chat data.
The component test uses optional react-test-renderer@19.1.0; no package manifest
or lockfile change is included.

A 390px Playwright browser acceptance script is included but has NOT run here:
Chromium was unavailable and its download returned an invalid archive. It remains
pending, along with host checks, live browser acceptance and Android/iPhone builds.
The previous 445 backend test result belongs to the recorded deployed baseline;
this increment does not claim a new host backend run or deployment.

On the host after guarded patch application:
- Run npm run typecheck and node --test tests/*.test.cjs.
- With the optional renderer dependency, run scripts/test-chat-cache-component.cjs.
- Build a synthetic-endpoint web export and run scripts/test-chat-cache-browser.cjs
  with Playwright/Chromium. Do not deploy that synthetic export.
- After an explicitly authorized real build/deployment, load two real conversations,
  keep separate drafts, disconnect backend access, reopen and switch chats, retry
  after reconnect, and sign out. Confirm account isolation and private cache removal.

Phone browser cold starts with no connection still require the web application
assets; no service worker has been added. A native preview supplies its app assets
on-device. Native audio, attachments, auth persistence and safe areas still require
separate verification before distributing that preview.

<!-- mobile-cache-host-validation-2026-10-10 -->
## October 10, Phoenix — Cached-chat host validation passed

User-supplied host evidence confirms guarded patch application, clean
whitespace checks, TypeScript and all 17 Node tests passing.
A clean temporary export passed synthetic endpoint checks and the
390px browser test: cached chats, separate drafts, backend-unavailable
reload and reconnect retry. The earlier timeout used an export containing
the real authentication URL; clearing Metro and disabling dotenv resolved
the test setup mismatch.

Live phone acceptance, deployment and native builds remain pending.
Configuration and backups remain preserved. No services were restarted.
Memory relevance, skills and proposal work remain paused.

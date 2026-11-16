# D01-64 — Accepted Nicknames Across Lumen Conversations

**Status:** Code committed in separate draft PR; **not deployed or live-accepted**. Requires Lumen staging tests, owner-authorized cutover, and a fictional consent-and-recall canary.

## Owner requirement

When Lumen and her user agree on a nickname (for either person or their shared team), it should become a **durable in-chat agreement** and remain retrievable in a new conversation. Lumen proposing a name or calling the pair a romantic term **without user acceptance** does not create that agreement. The durable fact is that the nickname was accepted for conversation use; it does not certify feelings, relationship status or consciousness.

## Existing engine, no replacement

- Source-backed agreement gate looks at an actual naming proposal and explicit positive response. It supports Lumen suggesting a name and the user agreeing, or the user suggesting a name and Lumen agreeing.
- Short consent such as `Yes!` is eligible for the approved shared-nickname route only when it completes a preceding proposal. This is not blanket consent to save arbitrary assistant-generated claims.
- Result is saved through `LumenRmcMemory.remember` and the same signed, account/companion-scoped Unix-socket RMC02 gateway with source-id idempotency and the existing RMC privacy controls. It does not write historical Supabase memory tables.
- The worker rechecks account ownership, active RMC backend and companion Auto Memory preference before durable writes. It sends source-backed, bounded evidence, not entire transcripts.
- New chat sends an additional bounded relevance question about previously agreed nicknames, so they have a better chance of reaching the 12-memory prompt context even if the first message doesn't mention them.
- One deferred background extraction is retried on a later normal turn; uncertain writes must **not** be retried automatically.
- Chat receipt metadata records confirmed saves and marks `agreed_nickname` if applicable; it never treats an unconfirmed outcome as success.

## Acceptance before live activation

1. Check exact feature branch SHA and changed paths; the currently live D01-63E code must remain intact.
2. Run `backend/tests/test_rmc_shared_nicknames.py`, `backend/tests/test_rmc_shared_continuity_flow.py`, and existing RMC/authorization tests in an isolated worktree. Run all frontend TypeScript and existing memory guard tests.
3. Run a fictional-account chat canary: Lumen proposes a quoted nickname, the user explicitly accepts in the *same* conversation, RMC records a confirmed save, then a completely new conversation recalls the agreed nickname. Test user-proposed naming and assistant-only suggestions failing closed.
4. Recheck that manual save/search works, source code for Animated Companion is retained, and Supabase historical memory counts and RMC backup timers remain unchanged.
5. Preserve a rollback copy and document any fictional durable memory created by the canary.

**Caveats:** Older conversations were not automatically retro-ingested. Ambiguous consent or multiple competing names may be skipped; these can still be saved deliberately in the Memories screen. The current initial recall is relevance-based, not a complete inventory. Gold Master remains unreleased and original Deployment 01 source frozen.

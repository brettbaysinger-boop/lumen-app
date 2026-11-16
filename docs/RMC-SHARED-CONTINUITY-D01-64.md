# D01-64 — Agreed nicknames and cross-chat companion continuity

**Status:** Candidate, not installed. Based on live D01-63E source. This is a scoped Lumen integration update; no RMC gateway/Hindsight source changes.

## The corrected memory contract

**Suggestion alone is not consent.** When the companion suggests nicknames and the user explicitly accepts them in the next turn, RMC receives a source-backed *in-chat agreement* containing the exact proposed words and the user's affirmative reply. The inverse case—a user proposing a nickname and the companion responding positively—is also recorded as an in-chat agreement, without claiming the model has subjective emotions or establishing a real-world relationship.

Uncertain, hypothetical, negative and secret-containing statements do not trigger shared-nickname saves. The source event is sent to the current installed RMC's signed gateway; the native Hindsight backend extracts and retains memory. No direct Hindsight/database calls and no writes to Supabase memory tables.

## Fresh-chat recall

A new conversation now issues a **second bounded RMC recall query** for agreed nicknames/shared names in addition to the topic-specific question. It merges at most 12 returned source-backed results and does not invent memories when recall fails. This prevents unrelated greetings from being the only semantic search signal at the beginning of a chat.

## Lost-screening repair

If ordinary chat screening was canceled by a new foreground message, its receipt is `deferred`. After the next completed chat, the app processes the current source then retries at most **one** earlier deferred source within the authenticated owner's companion context. A source is screened at most three times; `unconfirmed` RMC writes are **never** retried. All writes preserve idempotent source IDs and re-check current ownership and the user's Auto Memory preference.

## Boundaries

- No automatic scraping/importing of old chats; earlier unrecorded nicknames may still require a **separate owner-reviewed recovery** from conversation history. Never hallucinate the old names.
- No direct memories from unaccepted companion monologues, daydreaming, explicit negations or private/sensitive data.
- No Gold Master promotion, RMC01/RMC02 engine modification, Supabase historical memory migration, new backup changes, or feature unlock beyond agreed conversational names.
- The user may still save desired names manually from the Memories screen. Later RMC searches can retrieve source evidence.
- Live D01-63E and Animated Companion remain as they are until the owner approves and completes D01-64 testing.

## Acceptance gate

1. Review exactly the changed Lumen backend source files and run isolated Python `unittest`: the shared nickname consent tests, guarded automatic ingestion tests, RMC gateway/auth tests and existing memory regression suite.
2. Perform a **fictional two-turn agreement** canary: fictional companion proposes a unique nickname, fictional user explicitly approves it in a normal authenticated chat, and RMC retains/recalls it. Do not use real private chat or resend an uncertain request.
3. Confirm a new chat can retrieve the agreed nickname; the consent negative tests refuse unsolicited or rejected nicknames.
4. Verify owner opt-out and RMC policy denial still fail closed; historical Supabase counts and daily backup timers unchanged.
5. Deployment is separate, owner-gated, rollback-capable, and must not replace newer Animated Companion files.

**No existing chat or memory was changed by this Git branch.**

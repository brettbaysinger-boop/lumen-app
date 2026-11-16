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


## Expanded companion continuity acceptance (owner directive, November 16)

**The release goal is broader than nicknames.** The nickname gate is one proof case, not sufficient evidence that Lumen provides a continuous companion identity.

Required categories: user identity and enduring preferences; companion's established identity and user-approved names; source-backed mutual agreements and meaningful milestones; named people/pets and relationships; active projects and previously agreed decisions; and natural carryover of relevant conversation context. Store only well-grounded, durable, policy-permitted evidence, with the account and companion boundaries intact. Distinguish user assertion, mutually acknowledged shared event, and companion-authored proposed idea; a companion's unaccepted claim never becomes fact.

**New-chat cold-start:** query bounded RMC memory for a compact identity/relationship/ongoing-project context anchor as well as the new chat's topic. A greeting should not cause the assistant to present itself as a stranger. Do not inject all old history: use source-backed summaries, avoid stale/conflicting facts, honor privacy restrictions, and never represent retrieval failure as "no memories exist."

**Durable status:** verify that automatic/background memory screening completes or records an actionable deferred/failure state. Do not resend uncertain writes. Surface actual save receipt and scoped retrieval evidence, so a green "automatic learning ON" label isn't mistaken for proof of comprehensive remembering.

**Acceptance matrix must include:**
1. User preference from a natural message, recalled in a new chat.
2. Companion-proposed nickname explicitly accepted by user, recalled correctly.
3. User-proposed name explicitly acknowledged by companion, recalled correctly.
4. Meaningful shared non-sensitive decision or milestone, with source-backed mutual acknowledgement, recalled later.
5. Ongoing-project state and a named pet/person relevant to later discussion.
6. Cold-start greeting context, without overwhelming the answer or inventing intimacy.
7. Rejected/unaccepted/hypothetical name, sensitive data, foreign user/companion, private session, learning opt-out, and stale or revoked policy all fail closed.
8. Busy conversation interrupt/deferred screening; no lost confirmed records, no duplicate RMC writes, no retry of uncertain writes.
9. Current RMC02 vs historical Supabase 139/198/3 and existing backup services unchanged.

**No automatic old-chat migration in this patch.** Previously lost agreements need an owner-reviewed, consent-checked source recovery from the relevant conversation, not invented nicknames or blind transcript dumping.

**Release criterion:** new-chat continuity must pass multiple end-to-end cases; the current nickname-only PR is not sufficient to mark full continuity complete. Deployment remains pending.

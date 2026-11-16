# D01-64B — Broad RMC/Lumen companion continuity

**Status: source staged in a separate review branch; NOT deployed.**

## Why this exists

The previous D01-63E automatic-learning acceptance covered one harmless fictional preference. D01-64 began a nickname-specific repair. Neither alone proves that a persistent AI companion remembers meaningful relationship continuity across a new chat.

## Scope built here

- **Accepted nicknames:** preserve user-accepted companion proposals and companion-accepted user proposals, as source-backed in-chat agreements; never treat an assistant's unaccepted statement as history.
- **Durable preferences:** explicit user requests for forms of address and persistent conversation style.
- **Ongoing plans/projects:** explicit user-reported long-running creative work and goals.
- **Recurring rituals and inside jokes:** direct first-person descriptions of established chat routines, not hypothetical one-off requests.
- **New-chat retrieval:** in addition to the new user's topical question, query the same authenticated RMC bank for accepted names/addresses and for long-running preferences, projects, goals, routines and shared moments. Merge source-backed evidence within the existing 12-item prompt limit. The companion is instructed to use supporting memories naturally and never to invent missing facts.
- **Deferred extraction:** inherits D01-64's bounded retry of interrupted screening; never retry uncertain RMC writes, because they might have been committed.
- **Storage:** the existing RMC/Hindsight gateway remains the sole memory store. Deterministically approved evidence is the original user statement; model-generated paraphrases cannot enter through this route. Existing server-side RMC ownership, companion preference, privacy revocation and idempotency controls apply.

## Boundaries

This is deliberately conservative. Sensitive, hypothetical, conditional, ambiguous, very short unrelated, private-mode or assistant-only claims are not automatically recorded. A nickname must be mutually affirmed. User-reported experiences are not proof of companion subjective feelings, romantic relationships, or events outside chat.

**Past unsaved chats are NOT retroactively reprocessed** by this change. Recovering those would require a separate owner-approved, preview-first review of the existing RLS-scoped conversation archive; do not silently bulk-import private chat transcripts.

Source-only tests must pass before an owner-gated live test. Validate first-new-chat continuity with fictional conversations, a harmless nickname agreement, an ongoing project, a recurring joke, and negative foreign-account/privacy cases. The original D01-63E production source and backups remain intact.

No source changes to RMC02 gateway, its Hindsight container, ledger, backup jobs, Supabase historical memory tables, or Animated Companion.

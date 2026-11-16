# Lumen — RMC Memories tab replacement (November 15, 2026)

**Status: candidate branch — not deployed or accepted until owner-run staging tests and an authenticated fictional production canary.** This update is separate from frozen Deployment 01 and does not change RMC02's engine, storage or backup timers.

## The user-visible fix

The Memories tab formerly displayed an RMC placeholder because its existing editor reads/writes Supabase memory tables. Those writes were correctly disabled after switching to RMC02.

This feature adds an **authenticated RMC-specific panel**, preserving the application's existing theme:

- **Search RMC memory evidence** by a question or topic. Shows up to 12 relevant source-backed results using the installed gateway's `recall` method; explicitly labeled **relevant matches, not a complete inventory**.
- **Save a fact** using the gateway's `remember` method. User sees an honest `saved`, `existing`, `memory_off`, `not_saved` or `unconfirmed` result. On uncertainty, the UI preserves and reuses the request UUID for an idempotent retry.
- **Recent explicit chat-save receipts** for the selected companion, from the existing RLS-protected Supabase **chat messages**, with new `metadata.memory_backend = rmc` annotation. Prior Supabase save receipts are excluded. These are historical acknowledgements, not proof of present retention.
- **Truthful automatic memory status:** automatic extraction/observation of ordinary chat turns remains disabled in RMC mode. No automatic memory learning is implied by a chatbot response.
- If backend is unavailable/changed, the prior fail-closed guard remains in effect. Old Supabase memory add/edit/erase operations remain off in RMC mode.

## Implementation boundary

- New Lumen API router `/v0.2/rmc/memories` (`GET`, `POST`) and `/v0.2/rmc/receipts` (`GET`). These paths require verified Supabase Auth, and companion lookup uses the user's own RLS token **plus** an explicit owner check. The server enforces RMC mode for every operation.
- The RMC adapter already has the existing approved gateway client; this change invokes it with an account-and-companion-scoped panel session UUID.
- The RMC gateway offers **remember/recall**, not `list all`, edit or delete. Do not invent these functions or bypass its privacy/ownership controls by reading Hindsight directly.
- No new Supabase memory-table writes, no migration, no bypass of the existing SQL memory write guard, no gateway changes, no new engine or scheduler.
- The feature stores no RMC host key, personal memory contents or response body in Git; tests use fictional data.

## Required acceptance before production

1. Run `backend/tests/test_rmc_memory_routes.py` plus existing authentication/memory regressions against the staged source.
2. Run `node --test tests/memory-backend.test.cjs tests/rmc-memories-panel.test.cjs` and `npm run typecheck`.
3. Export Expo web into a staging directory; verify HTML and JS without disturbing live `dist`.
4. Deploy via owner-gated rollback-capable script, preserving all existing local uncommitted files and RMC02.
5. Use a fictional account to confirm: signed-in search returns scoped evidence; explicit save returns `saved`, subsequent search finds it; another account cannot see it; signed-out and Supabase-mode requests are denied. Existing Supabase counts **139 / 198 / 3** must stay unchanged. Never use personal memories for acceptance.
6. Review on phone/desktop. Confirm memory-status wording is accurate and account switching drops old results.

## Limitations kept visible

- This does **not** list every Hindsight memory or provide authoritative total counts.
- It does **not** provide memory edits/deletes or RMC privacy-policy administration.
- It does **not** turn on automatic long-term learning from ordinary chat messages.
- Existing pre-RMC Supabase records remain unmigrated.
- Full gateway disaster-recovery and Gold Master release remain separate.

**Deployment 01 freeze must remain unchanged; no merge or production deployment occurs merely by pushing this branch.**

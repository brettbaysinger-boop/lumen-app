# Phase 1b — Database-enforced reviewed-memory durability

<!-- acceptance-2026-10-13 -->
## Deployment and acceptance update — October 13, 2026

This document originally described a pending migration. **It is now live**
in the local installation at code commit `1a39432`. The user verified a
backup, transactional application and ledger entry, healthy API/DB/Ollama,
and a successful web rollout. Backup root:
`/home/brett/lumen-backups/phase1b-rollout-20261012-224152`.

The user subsequently reported four successful authenticated Firefox checks:
automatic save of a lasting fact; correct non-retention of a one-time joke
request; form-of-address proposal approved after a second deliberate click;
and account isolation after switching accounts. This establishes acceptance
of those specific workflows, not every possible manual/legacy write path.

The prior 97/97 indexed pilot baseline was checked immediately after rollout,
**before** this browser testing; fresh test memories may change live totals.
Both semantic feature flags remained disabled. Separate direct verification
of a production audit receipt has not been supplied, although isolated SQL
tests covered authenticated override receipt creation and RLS.

Historical "future work"/"not yet deployed" wording below is retained to
show what was planned before this rollout. Continue to Phase 2 using the
private, independently labeled retrieval benchmark protocol.

This is an additive database contract for **natural observation review approvals**.
It is generic to authenticated account owner and the particular companion.
There are no user-, companion-, or record-specific IDs in production code.

## Why this is necessary

The Phase 1a client warns when an observation seems to be a one-time request,
question, greeting, connection check, immediate feedback, or temporary feeling.
That client-only warning does not stop an older client, direct RPC caller, or
`auto_save_memory_suggestion` call from approving the observation.

## Database contract

- The new internal `memory_suggestion_durability_issue(text,text,text)` helper
  checks the **original user message**, not only model-normalized wording. It
  returns a conservative reason code. It cannot be invoked directly by a
  browser session.
- The original `review_memory_suggestion(uuid,text,text,text)` RPC remains
  callable by `authenticated` and defaults to *no durability override*. If the
  source is questionable, it returns `durability_confirmation_required` and
  leaves the suggestion pending. Existing `auto_save_memory_suggestion` calls
  this unchanged four-argument API and therefore cannot silently bypass the
  durability confirmation.
- The new `review_memory_suggestion_v2(uuid,text,text,text,boolean)` RPC
  requires an explicit confirmation boolean. It checks authenticated
  companion ownership, pending status, valid exact source evidence,
  subject/wording consistency, and the durability issue **on the server**.
- Without confirmation, questionable sources stay pending. With explicit
  confirmation, the authorized end user may still approve them.
- Confirmed questionable approvals create a single append-only receipt in
  `memory_durability_overrides`: owner, companion, suggestion, source-message
  and memory links, reason code, hash of saved wording and evidence,
  subject, and timestamp. It does not duplicate private text.
- The receipt table is RLS-protected: owner-only SELECT; no client INSERT,
  UPDATE, or DELETE. No direct public access to the internal helper.
- Existing exact deleted-memory suppression and suggestion status receipts
  are preserved; approval of an inactive duplicate does not resurrect it.
- Dismissal is unchanged. Normal durable approvals continue without an
  extra confirmation or audit receipt.

## UX

The Memories screen already has a first-click durability warning from Phase
1a. A second click on unchanged wording, subject, type and evidence calls
`review_memory_suggestion_v2` with `p_confirm_durability=true`.
If the server recognizes a questionable original statement that the client
missed, the UI leaves it pending and presents its own second-click warning.
Unexpected RPC results do not remove a suggestion from the review inbox.

## Intentional limitations

This increment **does not** change user-authorized explicit `remember this`
commands or manual `memories` table inserts. Those are separate deliberate
save paths and must not be confused with automated observation. Additional
manual-save revision receipts and direct-write restrictions are future work;
this is not a claim that privileged database access cannot write memories.

This migration contains no production data repairs, model changes, index
updates, RAG activation, or service operations. Validate the real migration
using the isolated PGlite test, plus a read-only/full-rollback PostgreSQL
trial before it is applied live. Deploy new database RPC **before** a frontend
that calls it. Update the migration ledger transactionally only after tests.

## Verification gates

1. Isolated PGlite replay of base suggestion/automatic/subject migrations
   and Phase 1b, checking owner and sibling isolation, foreign/anon denial,
   direct-RPC/auto legacy blocking, override receipts and source integrity.
2. Existing backend tests and client durability/ownership regressions.
3. TypeScript strict check and Expo web export.
4. Real Supabase transaction dry run with rollback, grants/RLS checks,
   and a clean 97/97 semantic index.
5. A separate, backed-up live migration and subsequent browser acceptance.

### Known application baseline

The most recent user-verified state before Phase 1b: pilot 97 active memories,
97 current embeddings, 0 other-companion embeddings, database-wide 122 active,
0 stale semantic bindings, API healthy, and both semantic feature flags off.
Phase 1a code was committed/pushed at `2367b0a`, but the Phase 1a behavior has
not yet been deployed and accepted in the browser.

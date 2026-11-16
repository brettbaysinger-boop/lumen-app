# D01-64R — Lumen companion continuity on current Private/Public build

**Base:** owner-observed live Git HEAD `7e7ec20520e424f8574850b4475f37b2ed5cec96` (November 16, 2026). Owner also has **13 modified tracked paths** on Lumen. Do not discard or overwrite those files.

**Status:** source integration candidate only. No live change, no RMC engine change and no claim that complete cross-chat continuity has passed.

## Why this branch exists
The older D01-64 nickname staging script expected `f23d112` and correctly stopped after the live checkout advanced to `7e7ec205`. This branch ports the agreed nickname/continuity work onto that newer source, **preserving the existing Private/Public privacy boundary**.

## Intended behavior
- Short user reply affirming an immediately preceding nickname proposal can create a source-backed agreement memory, using native RMC/Hindsight only. A model's proposal by itself is never stored as a mutual agreement.
- A user-proposed nickname with an affirmative companion reply is similarly eligible. This is conversational agreement only, not a claim of AI feelings or actual romantic relationship.
- A new **Private** conversation makes bounded extra RMC relevance queries for established agreed names, enduring personal facts, important people/pets and ongoing project state. Results are capped and source-backed. Retrieval failure is not misreported as memory deletion.
- One previously deferred automatic screening task can be retried after a later message. **Unconfirmed writes are never automatically retried.** User/companion ownership and Auto Memory opt-out are checked.
- Public mode never invokes private continuity recall or allows automatic memory retention. The stage must preserve `PublicCognitionRuntime`, its privacy protections, and the persisted public message tag check, including recheck just before RMC writes.

## Non-negotiable deployment boundary
- The current production checkout has modified `backend/lumen/main.py`, `backend/lumen/runtime.py`, `backend/lumen/privacy_mode.py`, and other files. **Never copy this branch's whole main.py or runtime.py over production.**
- Before deployment, stage a 3-way merge using `7e7ec205` as common base, the source branch as candidate and the *exact live working file contents* as ours. Abort on any conflict or source mismatch. Do not print/upload private code or secrets.
- Run nickname consent negative tests, automatic-ingest tests, auth and privacy-mode regressions in a disposable local checkout. Typecheck and functional browser tests for privacy and Animated Companion must pass before a release.
- Explicit owner authorization required for any restart or real write. Use a fictional two-turn agreement, then a fresh Private chat recall; in Public mode the same private memory must not appear.
- Do not backfill prior chat history automatically. Older missed nickname agreements should be recovered only with owner review and consent; do not invent the names.

## Broader acceptance, not just nicknames
The actual product acceptance requires persistent user/companion identity, enduring preferences, ongoing projects, shared milestones/decisions, important people/pets, source-aware corrections, and new-chat recall. This patch repairs important foundations and one agreed-nickname case; **it is not evidence that all of those categories are saved correctly**. Explicitly test each before declaring the complete companion continuity feature finished.

Gold Master stays unreleased; RMC02 gateway/ledger, old Supabase memories and nightly backup timers unchanged.

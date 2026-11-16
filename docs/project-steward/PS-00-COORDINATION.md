# PS-00 — Raialume Project Steward, parallel-work coordination
Owner authorization: 2026-11-15. Source tracking issue: #27.
Status: **coordination proposal ONLY**; no implementation or deployment.

## Three active and protected workstreams
1. **Live Room / Video**: existing PR #20 (Android), PR #24 (design), existing voice, streaming, and GOLD V2.
2. **Memory Tab / RMC**: owner says implementation is actively underway separately; preserve code, data, keys, Lumen RMC02 gateway and its backup timers. The RMC02 operational pilot and unattended backup/freshness checks passed on November 15 (PR #10). No installation/migration changes.
3. **Project Steward**: new independent source-only development. **Do not modify** `app/(tabs)/_layout.tsx`, `app/(tabs)/memories.tsx`, chat routes/components, `backend/lumen/rmc/**`, service config, deployed API, or production DBs in any Steward lane. First build `app/project-steward/index.tsx` (not a tab) and `backend/lumen/project_steward/**` plus tests.

## Contract and acceptance
Use `contracts/project-steward/project-snapshot.v1.schema.json`.
- Separate **project identities** from repos: e.g. DreamVault and Brett's Games are independent projects even if no standalone GitHub repo.
- Show evidence-backed, distinct `development` and `deployment` facts; avoid calling a draft PR a deployed feature.
- Every derived finding includes source and last-checked timestamp, or a visible UNKNOWN/STALE status.
- Read-only Git metadata first; not OAuth/SSH secrets, LLM actions, RMC writes, deployments, full system inventory, or real bank/media data.
- Owner-only authentication, server-side repo allowlist, minimum API scope, no client GitHub token.
- API implementation may use existing backend/router patterns, but endpoint registration in shared files must be isolated and handled by coordinator later.

## AI lanes (do not overlap)
- **Claude — UI:** `app/project-steward/**`, `components/project-steward/**`, `lib/project-steward/**`, corresponding tests; zero edits to shared tab layout.
- **Gemini — data:** `backend/lumen/project_steward/**`, `backend/tests/test_project_steward_*.py`, fixture files in `docs/project-steward/fixtures/**`; **no** live token/connection.
- **Grok — audit:** `docs/project-steward/reviews/**` and nonintrusive security tests, independent review of exact hashes; no competing app/backend implementation.
- **Brother — coordination:** contracts, issue tracking, owner-review record, integration gate.

## Proposed acceptance gates
G0 source and exact Git baseline captured; G1 offline sample/fixture UI works; G2 strict provider parsing/security tests pass; G3 real owner-authenticated read-only Git connection; G4 owner desktop/phone usability acceptance; G5 deliberate shared-nav integration after Live Room + Memory Tab branches reconciled. NONE of these gates is currently passed.

## Estimate with explicit uncertainty
- G1 1–3 working days when developers are available.
- G3 useful Git-backed alpha 5–10 working days, credentials/connection dependent.
- G4/G5 integrated tab 2–3 weeks, depends on conflicts and phone tests.
- Forgejo connector, approved RMC project notes, scheduled monitoring belong to separate post-alpha scope; do not secretly add.

## Owner-facing labels
Facts: verified / source-backed historical / draft / unavailable / stale.
Actions: read-only now. Proposals may be drafted but **nothing** updates Git/RMC without new owner approval.

See Issue #27 for goals and boundaries.

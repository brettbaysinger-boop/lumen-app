# PS-02 — Gemini: offline-first project registry and read-only GitHub evidence collector
Primary authority: Issue #29. Coordination: Issue #27 / Draft PR #31.
**This branch is an assignment intake only. Backend implementation has NOT started.**

Goal: develop a deterministic source-backed project snapshot provider, not a custom project-management database or LLM framework. Follow `contracts/project-steward/project-snapshot.v1.schema.json`.

Only edit:
- `backend/lumen/project_steward/**`
- `backend/tests/test_project_steward_*.py`
- `docs/project-steward/fixtures/**`.

Separate project identities from Git repositories; examples must include non-repo projects DreamVault, Wisdom of the Crowd and Brett's Games. Provide project priority, blockers, repo refs, date-checked and source links. Make GitHub API client **read-only, allowlisted, bounded** and disabled until owner provides a suitable server-side token. Never ask to paste secrets into chats/PRs.

No editing shared API router, RMC, memories, chat, Live Room, deployment, or env config. Fail closed on unknown owner identity; integration auth to be wired by coordinator. Offline tests must cover token missing, 401, rate limit, timeout, redirection, malformed data, stale results, fake deployment, unsafe URLs and secret redaction. No live host/token action authorized.

Deliver draft PR into `feat/project-steward-coordination-20261115`, exact SHA, actual test output and honest gaps. Target initial source candidate 1–3 working days.

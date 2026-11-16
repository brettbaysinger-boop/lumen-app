# PS-03 — Grok: independent Project Steward safety and source-truth audit
Primary authority: Issue #30. Coordination: Issue #27 / Draft PR #31.
**This branch is an assignment intake only. An audit cannot PASS code that doesn't yet exist.**

Wait for Claude #28 and Gemini #29 to produce actual implementation branches/HEAD SHAs. Independent verification: try to reproduce tests and fail injection on **exact source hashes**.

Focus: credential exfiltration, SSRF/redirects, user auth and repo allowlist, stale timestamps, PR-not-deployed truth, tests-not-release, unauthorized RMC writes, accidental shared tab/memory/video files, false claims of GitHost connected, redaction, malicious repo content and JSX output escaping, mobile UX. No credential or real client data.

Your scope: `docs/project-steward/reviews/**` and isolated safe tests. Do not overwrite Claude/Gemini implementation or Live Room/Memory Tab changes.

Deliver 1-page severity-ranked PASS / CONDITIONAL / BLOCKED verdict with precise evidence, minimum viable fixes and retest instructions in a draft PR targeting `feat/project-steward-coordination-20261115`. Tests not run must be explicitly NOT RUN.

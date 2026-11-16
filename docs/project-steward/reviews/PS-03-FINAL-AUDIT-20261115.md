# PS-03 — Project Steward Final Independent Audit

**Lane:** PS-03 (issue #30), draft PR #34, branch
`review/ps03-grok-security-20261115`. **Coverage note:** this lane is
assigned to Grok; Grok is unavailable, so the audit is executed by
Muse at the owner's direction, with authorship disclosed here.
**Round:** final implementation audit (2026-11-15), following the
baseline checklist filed earlier the same day. This report audits
real implementation code at the exact heads below — not the
assignment-only heads the checklist was written against.

## Audited heads (recorded 2026-11-15, this session)

```text
PS03_AUDIT_VERDICT=CONDITIONAL
CLAUDE_PS01_HEAD=07f34ac7a039300a89db000ba95dfa698bbd4cd9
GEMINI_PS02_HEAD=1b0709f8f199586971ab69ead7234dcdd1f88067
COORDINATION_HEAD=431003636b4a841266488b2afa227a9257baf747
```

PS-01 is three implementation commits on its handoff commit; PS-02 is
one implementation commit on its handoff commit. Both PRs remain open
drafts. Nothing in this report merges or deploys anything.

## Tests independently executed (not developer-reported)

- **Gemini backend suite: 35/35 passed** (pytest, clean venv,
  pydantic 2.14.3), including the shipped contract-conformance tests
  validating generated snapshots against the v1 schema with
  python-jsonschema.
- **Claude UI unit suite: 91/91 passed** (tsc + `node --test`),
  plus the shipped schema crosscheck: the hand-written TypeScript
  validator's verdicts agree with python-jsonschema on all contract
  cases for both the v1.0 schema and Claude's proposed v1.1 schema.
- **Reviewer adversarial probes: 30 executed.** 27 against the
  backend (auth matrix, collector hardening, ingestion, contract
  coupling) and 3 against the compiled UI logic (cross-lane v1.1
  validation, freshness behavior, sanitizer). 28 behaved as required;
  the 2 exceptions are findings F-01 and F-02 below — both confirmed
  by execution, not by code reading alone.
- **Screenshot artifacts reviewed visually** (360px overview, detail
  Summary tab, live-stale state): demo banner unmissable, per-card
  DEMO badges, stale state labeled with age and window, no layout
  breakage. An independent render in a live app was NOT performed.

## 1. Authentication — the unsafe fallback is GONE (PASS)

The earlier handler behavior (any nonempty bearer token accepted as
the owner) does not exist at the audited head. The current
`require_user` verifies the bearer token against the Supabase Auth
API (or delegates to production `lumen.auth` when importable), and
`require_steward_owner` compares the verified user id to an
explicitly configured owner id with **no hardcoded default**.
Probed live via FastAPI TestClient with a stubbed auth service:

- No token → **401**. Wrong scheme → **401**. Every route probed
  (snapshot, projects, health, refresh) requires auth — health is
  owner-gated too.
- Forged bearer with the auth service unconfigured → **503, fail
  closed** (never accepted).
- Authenticated non-owner → **403**. Anonymous-flagged user → **401**.
  Expired/invalid at Supabase → **401**. Valid user but owner id
  unconfigured → **403, fail closed**.
- Missing production auth module → falls back to the built-in
  verifier, which itself fails closed when Supabase is unconfigured.

Residual note (INFO): when `lumen.auth` IS importable, its
`require_user` is trusted wholesale; that module lives outside these
branches and was not audited here.

## 2. Project evidence — no fabrication found (PASS with one LOW)

- The seed registry contains **zero commit SHAs** (every
  `commit_sha` is `None`) and **zero host receipts**. Deployment is
  never inferred from Git data anywhere in the ingestion path
  (`last_deploy` is hard-coded `None`; the deployment field is
  carried through ingestion unchanged). No CI evidence is
  manufactured — the collector's check-runs method is never called
  by the registry, so CI stays absent/unknown rather than invented.
- Named projects checked individually: Chorusfall, DreamVault,
  Regent (correctly the Sure-based finance project in
  monarch-private), Rattlesnake, Brett's Games, Wisdom of the Crowd,
  and RMC all carry accurate descriptions, honest evidence levels,
  and `unknown`/`not_deployed` where nothing stronger is sourced.
  Non-repo projects (DreamVault, Wisdom of the Crowd, Brett's Games)
  correctly have empty repository lists and owner-report sources.
- Claude's demo fixtures: the single `verified_current` row is an
  explicitly synthetic sample ("UI sample: verified deployment",
  `synthetic-fixture://` refs) inside the demo set, which the UI
  banners as offline sample data. No real project is given a
  deployment it did not earn on either side.
- **F-04 (LOW):** the RMC registry entry claims the operational
  pilot in its summary, but its own `sources[]` cite only the repo —
  the PR #10 record that backs the claim (and that the Raialume
  entry does cite) is missing. Add the PR #10 source to the RMC
  entry. The claim itself is consistent with the PS-00 record.
- The CPL-1 coupling gap from the checklist round **persists at
  schema and model level** (probe-confirmed: a snapshot with
  `deployment=verified_current`, `evidence_level=unverified`, and no
  host receipt validates cleanly). No shipped data exploits it and
  no code path produces it, but the contract still cannot stop a
  future data source from overclaiming. Coordinator should close it
  before any `verified_current` value is ever served. Tracked as
  condition C-4 below.

## 3. GitHub security (PASS)

All probed against the collector with mock transports:

- **Read-only:** GET is the only verb in the client; the collector
  is disabled without a server-side token; the token lives only in
  server settings (env), never in responses, fixtures, or the UI
  (the UI client explicitly forbids passing a GitHub token).
- **Allowlist:** exact-match against 22 pinned repos, enforced
  before every call. Probes refused: encoded traversal
  (`%2f..%2f`), `..` paths, case variants, lookalike owners, and
  sub-path injections.
- **SSRF/redirects:** host pinned to `api.github.com` (validated
  against a constant, not the configurable value);
  `follow_redirects=False` plus explicit 3xx rejection — a 302 to
  169.254.169.254 returned `security_denied`. Refs reject `/`, so
  slashed branch names fail closed.
- **Timeouts/limits:** 5s connect / 10s request; pagination capped
  (page 99 refused); 1MB body cap by header and by actual bytes.
- **Rate limits:** 429, or 403 with `x-ratelimit-remaining: 0`,
  returns a graceful `rate_limited` result — no retry storm.
- **Redaction:** a transport error containing the token came back
  with the token scrubbed; log lines are static/redacted.
- Malformed upstream JSON returns an error result, never partial
  data presented as fact.

## 4. User interface (PASS)

- **Tabs:** Summary / Activity / Evidence exist exactly as
  specified, with proper tab accessibility roles.
- **Labeling:** demo data carries a banner ("Demo fixture, offline
  sample data — Nothing on this screen is live") plus per-card DEMO
  badges; live-stale data is bannered STALE with its generation time
  and age; missing data renders UNKNOWN ("never checked",
  "unreadable time", and future timestamps are called out as clock
  skew rather than shown as fresh). Deployment labels never
  overclaim ("Reported, not verified"; historical verification is
  labeled historical, with "still running now?" explicitly listed
  as unknown). PR merges imply nothing about deployment anywhere.
- **No silent fallback:** on any live-fetch failure the client
  returns an explicit error state; demo data appears only when the
  user explicitly opens it.
- **Injection:** all payload strings pass a sanitizer that strips
  control, zero-width, and bidi-override characters before
  validation; rendering is React Native text (no HTML sink exists
  in the lane — no WebView, no `dangerouslySetInnerHTML`, no eval);
  links open only https URLs passing a strict check (real host, no
  embedded credentials, ≤512 chars) or github.com URLs constructed
  from regex-validated refs.
- **Mobile:** shipped 360px screenshots for overview, all three
  detail tabs, and every source state were reviewed; layout holds.

## 5. Contract and integration

- **v1.0 (the ratified contract): full agreement.** The backend
  emits `version: "1.0"` snapshots that validate against the frozen
  schema (independently reproduced); the UI validates v1.0 strictly
  and rejects the whole snapshot on any violation rather than
  rendering partial data. Models on both sides forbid extra
  properties and enforce the schema's enums, patterns, and lengths.
- **F-02 (MEDIUM) — the two "v1.1"s are different contracts.**
  Claude's proposed v1.1 adds a snapshot-level `stale_after_seconds`
  and per-project inline `insights`. Gemini's proposed v1.1 fixture
  instead carries a snapshot-level `freshness_policy_hours` and no
  inline insights (the backend serves insights from a separate
  endpoint). Executed proof: Gemini's `proposed_snapshot_v1.1.json`
  is **rejected** by Claude's validator ("unexpected property
  freshness_policy_hours") and is **invalid** under Claude's
  proposed v1.1 schema. v1.1 must not be adopted until there is one
  dialect; v1.0 integration is unaffected.
- **F-03 (MEDIUM) — freshness defaults disagree, 48h vs 72h.**
  Backend `stale_threshold_hours = 48` (comment claims it is
  "unified with UI 48-hour freshness policy"); UI
  `STALE_AFTER_MS = 72h` (comment claims it is "the same default
  the backend registry uses"). Both comments are wrong. Executed
  proof: at 60 hours old, the backend marks a project stale while
  the UI calls it fresh — the same snapshot can show a backend
  "[STALE]" prefix under a UI "fresh" chip. One number and one
  mechanism (the server-declared window both designs already
  contemplate) must win before integration.
- **Lane discipline: clean.** Tree diffs against the coordination
  baseline show PS-01 added 56 files and PS-02 added 18, every one
  inside its own lane, with zero modified and zero deleted files.
  No Live Room, Memory Tab, RMC, shared navigation, tab layout, or
  chat path was touched by either lane. The backend router is
  deliberately not registered into the shared API — that remains
  the coordinator's integration step, as PS-00 prescribes.

## Findings summary

| ID | Severity | Finding |
|---|---|---|
| F-01 | MEDIUM | Ingestion crash: an open PR whose title exceeds ~228 chars makes `ingest_github_evidence` raise a pydantic ValidationError (PR titles are truncated to 280 for `OpenPr`, but the activity text built from them exceeds `ActivityEvent`'s 240-char cap). One long-titled PR breaks evidence refresh for its project — and aborts the loop for later projects. Reproduced by probe. Fix: truncate activity text to the model cap (or raise the cap) and make per-project ingestion failure-isolated. |
| F-02 | MEDIUM | Two incompatible v1.1 dialects (see §5). Unify before any v1.1 use. |
| F-03 | MEDIUM | Freshness default mismatch 48h (backend) vs 72h (UI), each side's comment claiming agreement with the other. Pick one. |
| F-04 | LOW | RMC registry entry does not cite its PR #10 source. |
| — | INFO | CPL-1 coupling (verified_current ⇏ host-grade evidence) still unenforced by schema/models; no shipped data exploits it. |
| — | INFO | Collector reads the full body before the byte-cap check; exposure is bounded by the pinned api.github.com host. |
| — | INFO | Auth delegates wholesale to `lumen.auth` when present; that module is outside this audit's branches. |

No CRITICAL or HIGH findings. No critical vulnerability was found,
so there is no stop condition on security grounds.

## Verdict

```text
PS03_FINAL_VERDICT=CONDITIONAL
```

The security repairs this audit was convened to verify **have
arrived**: the auth fallback is gone and fails closed under probe,
the fabricated-evidence problems are gone, and both lanes held
their boundaries exactly. The conditions below are correctness and
contract hygiene, not security blockers — but they are real, and
each was reproduced, not inferred.

**Conditions for PASS:**
- C-1: Fix F-01 (truncate/align activity text; isolate per-project
  ingestion failures) with a regression test using a long PR title.
- C-2: Resolve F-03 — one freshness window, one mechanism, and
  correct the comments on both sides.
- C-3: Resolve F-02 — a single v1.1 dialect agreed by both lanes,
  or an explicit coordinator decision to integrate on v1.0 only and
  defer v1.1.
- C-4: Close CPL-1 in the contract (or in server-side validation)
  before any `verified_current` deployment value is served.
- C-5 (LOW, may ride along): F-04 source citation for the RMC entry.

**Remaining blockers outside the lanes:** coordinator registration
of the router into the shared API, owner configuration
(`PROJECT_STEWARD_OWNER_ID`, Supabase, optional GitHub token) in the
deployment environment, and the PS-00 gates that depend on them.
None of those are code defects in the audited heads.

**Retest:** conditions C-1..C-3 are checkable against new exact
heads with the same probes used here (auth matrix, long-title
ingestion, cross-lane fixture validation, 60-hour freshness case);
a short delta recheck is sufficient — no full re-audit needed.

## Filing appendix

Deliverable: this file only,
`docs/project-steward/reviews/PS-03-FINAL-AUDIT-20261115.md`, added
on the existing audit branch `review/ps03-grok-security-20261115`
(draft PR #34). The commit SHA and read-back verification are
recorded in the delivery message and the project record.

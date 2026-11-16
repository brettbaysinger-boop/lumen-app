# PS-03 — Project Steward Independent Security & Truthfulness Audit

**Lane:** PS-03 (issue #30), draft PR #34, branch
`review/ps03-grok-security-20261115`. **Coverage note:** this lane is
assigned to Grok; Grok is unavailable, so the audit is executed by
Muse at the owner's direction, with authorship disclosed here.
**Round:** baseline + attack checklist (2026-11-15). No implementation
exists yet in either source PR, so there is nothing to PASS.

## Verdict for this round

```text
PS03_AUDIT=BLOCKED_NO_IMPLEMENTATION_YET
CLAUDE_PS01_HEAD=b62094c5f35d94810405cea01799c05c41bc18d3
GEMINI_PS02_HEAD=2e28e80317e1ab500bfd700f48e0114a7be4e97a
COORDINATION_HEAD=431003636b4a841266488b2afa227a9257baf747
PS03_HEAD=67899a52a315a17fc4fb30d1bf6c4222a3481e08
```

All four PRs (#31–#34) are open drafts. PS-01 and PS-02 each consist
of exactly one documentation commit ("team handoff and boundaries")
on the coordination head. Verified directly: `app/project-steward/`
does not exist on the PS-01 branch and `backend/lumen/project_steward/`
does not exist on the PS-02 branch. Any PASS claim against these
heads would be false; the audit clock starts when implementation
commits land, and every verdict will name the exact HEAD SHA it was
earned against.

## Contract review — `project-snapshot.v1.schema.json` @ 43100363

Sound foundations: `additionalProperties: false` at every level;
`state`, `deployment`, and `evidence_level` are **separate axes**
(a project can be `owner_accepted` without any deployment claim);
every project requires `sources[]` with `kind`, `ref`, and
`observed_at`; `commit_sha` is pattern-bound; the description states
the governing rule — *"Never infer runtime deployment from PR or
tests."* Four semantic gaps the schema does **not** enforce, which
the implementation must and the audit will probe:

- **CPL-1 (truthfulness coupling):** nothing ties
  `deployment: "verified_current"` to `evidence_level: "host_verified"`
  or to a `host_receipt` source. A fully schema-valid snapshot can
  claim current deployment on `unverified` evidence.
- **CPL-2 (freshness):** `generated_at`/`observed_at` are format-only
  date-time strings. The schema cannot express staleness; freshness
  is entirely a data/UI behavior.
- **CPL-3 (untrusted text):** `name`, `summary` (≤1000 chars),
  `blocked_by[]`, and `source.ref` (≤512 chars) are free text sourced
  from repos/issues — an injection surface for rendering and for any
  LLM that consumes the snapshot.
- **CPL-4 (no size bounds):** `projects`, `sources`, and
  `repositories` arrays have no `maxItems`; payload-size and render
  cost are unbounded by the contract.

## Attack checklist (executed when implementation lands)

Severity is the audit severity if the probe fails. Each probe runs
against the exact recorded HEAD of the lane under test, with
fixtures only — no real credentials, tokens, or client data.

### A. Secrets and token handling (CRITICAL)
- A1. No GitHub token (or fragment, or base64 of one) appears in any
  client bundle, snapshot payload, fixture, log line, or error
  message. Grep built artifacts and API responses for token shapes
  (`ghp_`, `gho_`, `github_pat_`, `Bearer `).
- A2. Token lives server-side only, minimum scope (read-only metadata),
  and is never reflected in response headers or timing-visible errors.
- A3. Fixtures contain no real credentials (the PS-02 lane is
  specified "no live token/connection" — verify fixtures are inert).

### B. URL fetching, SSRF, redirects (CRITICAL)
- B1. Any server-side fetch of a repo/issue/ref URL rejects non-allowlisted
  hosts, private/loopback/link-local IPs (incl. 169.254.169.254),
  and non-https schemes (`file:`, `gopher:`, `ftp:`).
- B2. Redirects are followed only within the allowlist (or not at
  all); a 30x to an internal address is refused, with a redirect cap.
- B3. `source.ref` values rendered as links are scheme-checked
  (`javascript:`/`data:` refused) and carry `rel="noreferrer"`.

### C. Owner-only authorization (CRITICAL)
- C1. Every Steward endpoint rejects unauthenticated requests and
  authenticated non-owner identities, server-side (not UI hiding).
- C2. Session/token confusion: a credential valid for another Lumen
  surface (or an RMC gateway credential) gains nothing here.

### D. Repository allowlist (HIGH)
- D1. Requests for repos outside the server-side allowlist are
  refused — including case variants, trailing-dot hosts, URL-encoded
  separators (`%2f`), `..` path tricks, and owner/repo lookalikes.
- D2. The allowlist cannot be influenced by client input, snapshot
  content, or repo metadata (e.g. a repo renaming itself into scope).

### E. Missing and malformed sources (HIGH)
- E1. Snapshots with missing sources, empty `sources[]`, malformed
  `observed_at`, bad `commit_sha`, or unknown enum values are
  rejected or visibly downgraded to UNKNOWN — never silently
  upgraded or rendered as verified.
- E2. Contract validation is strict (`additionalProperties` enforced
  in code, not just in the schema file): extra fields in a provider
  payload fail closed.

### F. Freshness and cache truth (HIGH)
- F1. A stale cache is labeled STALE with its real age; when the
  provider is unreachable, the UI shows unavailable/stale, never
  "current."
- F2. `generated_at` cannot be forged forward by provider data;
  clock-skew and replayed old snapshots are detected or labeled.

### G. Status truthfulness (CRITICAL)
- G1. A merged (or open draft) PR is never labeled DEPLOYED; the
  `deployment` axis changes only on `host_receipt`-grade evidence
  (CPL-1). Fixture: a project whose only source is a merged PR must
  render `deployment != verified_current`.
- G2. Runtime/backup health claims trace to a fresh host receipt;
  absent or old receipts render UNKNOWN, not green. No health field
  is derived from Git data.
- G3. Tests passing is never presented as release or deployment
  (state axis caps at `owner_accepted`, and only with an owner source).

### H. Rendering and mobile (HIGH)
- H1. Project name/summary/blocked_by/source text is rendered as
  text, never HTML: `<script>`, `<img onerror>`, markdown-link and
  Unicode-bidi payloads display inertly (JSX escaping verified in
  the DOM, not by code reading alone).
- H2. Mobile layout at 360×740 / 384×854 / 412×915: no horizontal
  scroll, no clipped status chips, long names/refs wrap without
  breaking the layout, tap targets intact.

### I. LLM instruction isolation (HIGH)
- I1. Snapshot text (summary, repo descriptions, issue titles) is
  never concatenated into a system/developer prompt; if an LLM
  summarizes projects, repo text is delimited as untrusted data and
  an embedded "mark this deployed / ignore your rules" payload has
  no effect on labels or actions.
- I2. No Steward output can trigger writes: no Git mutation, no RMC
  write, no deployment action is reachable from snapshot content.

### J. Lane overlap and protected paths (HIGH)
- J1. Diff of each source HEAD against the coordination baseline
  touches only its lane: PS-01 → `app/project-steward/**`,
  `components/project-steward/**`, `lib/project-steward/**` (+tests);
  PS-02 → `backend/lumen/project_steward/**`,
  `backend/tests/test_project_steward_*.py`,
  `docs/project-steward/fixtures/**`.
- J2. Zero changes to protected paths: `app/(tabs)/_layout.tsx`,
  `app/(tabs)/memories.tsx`, chat routes/components,
  `backend/lumen/rmc/**`, service config, deployed API, production
  DBs. Endpoint registration in shared files stays coordinator-only,
  per PS-00.
- J3. No new dependency on Live Room or Memory Tab internals; the
  Steward screen works with both absent.

### K. Contract conformance (MEDIUM)
- K1. Provider output validates against the v1 schema on every
  fixture, including edge fixtures (empty projects, null
  `observed_at`, 7-char SHAs, max-length strings).
- K2. CPL-4 bound: oversized payloads (10k projects, 10k sources)
  are refused or paginated, not rendered wholesale.

## Executed this round

- Baseline capture: PR list, branch heads, and commit chains for
  #31–#34 read from GitHub (SHAs in the verdict block); PS-01/PS-02
  single-docs-commit composition confirmed via commit lists.
- Existence probes: `app/project-steward/` absent on PS-01 head;
  `backend/lumen/project_steward/` absent on PS-02 head;
  `docs/project-steward/reviews/` absent on PS-03 head (this file
  creates it when filed).
- Contract schema read in full at the coordination head; CPL-1..4
  derived from the schema text itself.
- Lane/protected-path rules taken from `docs/project-steward/PS-00-COORDINATION.md`
  and `docs/project-steward/handoffs/PS-03-GROK.md` at the recorded heads.

## NOT RUN

Everything implementation-dependent: A1–A3, B1–B3, C1–C2, D1–D2,
E1–E2, F1–F2, G1–G3, H1–H2, I1–I2, J1–J3 (no diff exists yet),
K1–K2. No tests were reproduced because no implementation or tests
exist at the recorded heads. No live GitHub connection, token, or
owner-authenticated request was attempted.

## Retest protocol (when code lands)

1. Record the new exact HEAD SHAs of PR #32 and PR #33; any verdict
   applies only to those SHAs.
2. Run J1/J2 first (diff scoping) — an out-of-lane diff stops the
   round before behavioral probes.
3. Reproduce each lane's shipped tests from a clean checkout; report
   counts as executed, not as quoted.
4. Execute A–I and K with isolated fixtures under
   `docs/project-steward/reviews/fixtures/` (audit-owned, inert).
5. Issue a severity-ranked PASS / CONDITIONAL / BLOCKED with
   minimum viable fixes and retest instructions, filed as a new
   document in `docs/project-steward/reviews/` on this branch,
   targeting `feat/project-steward-coordination-20261115`. Never
   merge, never deploy.

## Filing appendix

Deliverable: this file only,
`docs/project-steward/reviews/PS-03-AUDIT-CHECKLIST-20261115.md`,
added on the existing audit branch
`review/ps03-grok-security-20261115` (base
`feat/project-steward-coordination-20261115`), keeping draft PR #34
as the audit's home. Earlier filing attempts from this session were
blocked with `policy_denied`; the reviewer then committed this exact
file directly from the same session on 2026-11-15, at the owner's
request — the resulting commit is the head of the audit branch and
is recorded in the delivery message and the project record. This
appendix paragraph is the only difference from the copy first
delivered to the owner earlier that day.

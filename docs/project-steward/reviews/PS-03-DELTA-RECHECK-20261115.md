# PS-03 — Delta Recheck of the Final-Audit Conditions (Issue #41)

**Lane:** PS-03 (issue #30), draft PR #34, branch
`review/ps03-grok-security-20261115`. **Coverage note:** Grok's lane,
executed by Muse at the owner's direction, authorship disclosed.
**Round:** delta recheck (2026-11-15) of
`PS-03-FINAL-AUDIT-20261115.md` conditions C-1..C-5 against the
repaired heads below, per the coordinator's Issue #41 assignment.

## Audited heads (captured at recheck start AND re-verified at end)

```text
PS03_DELTA_VERDICT=PASS
CLAUDE_PS01_HEAD=0342c2eac8a9a86fb5acd864d0abb4ee0ffd9d68
GEMINI_PS02_HEAD=15de1eb56bb3c94cc74c86fc4553ae293db8e787
```

PS-01 delta: one fix commit on the previously audited `07f34ac7`.
PS-02 delta: two commits on the previously audited `1b0709f` —
`2ac2692` (auth/truth repair) and `15de1eb` (Issue #41 gate fixes).
Both heads were stable across the whole recheck window.

## Provenance correction (coordinator's note, accepted)

The coordinator was right to flag the final audit's pin. Timeline,
reconstructed from the commit chain (which is linear — no rewrite):
the final audit listed PS-02 head `1b0709f` at capture time, but
Gemini's repair commit `2ac2692` landed while the audit was running,
and the file fetches — made by branch ref — read the repaired tree.
The final audit's *evidence* (35 reproduced tests, clean handler and
registry, probe results) describes the `2ac2692` content; its *pin*
says `1b0709f`. The verdicts in that report stand for the content
actually examined; the SHA label was stale. This recheck removes
the ambiguity: every result below was produced from trees fetched
after both fix commits landed, with heads re-verified afterward.
Lesson recorded: capture by exact head, re-verify before verdict.

## Conditions — all CLOSED at the audited heads

**C-1 / F-01 (ingestion crash) — CLOSED.** Activity text is now
truncated to the 240-char model cap for both commit and PR events,
and per-project ingestion is failure-isolated. Probe: a 300-char PR
title ingests cleanly (activity texts [33, 240] chars), and projects
processed after the long-title project ingest normally. The
original round-1 probe (280-char title) also passes now.

**C-2 / F-03 (freshness mismatch) — CLOSED.** UI default is 48h
(`STALE_AFTER_MS = 48h`), equal to the backend's
`stale_threshold_hours = 48` and to `stale_after_seconds: 172800`.
Executed on the compiled UI logic: a 60-hour-old observation is
**stale** on both sides. Claude's shipped tests cover 47h fresh /
49h stale and the 60h case through the client for v1.0 and v1.1.

**C-3 / F-02 (two v1.1 dialects) — CLOSED.** There is now one
canonical v1.1: snapshot-level `stale_after_seconds`, optional
inline per-project `insights`, v1.0 unchanged. Executed
cross-validation with the *current* artifacts (not the vendored
historical sample): Gemini's current `proposed_snapshot_v1.1.json`
at `15de1eb` is **accepted** by Claude's current validator
(stale window parsed as 172800 s, insights extracted), is **valid**
under Claude's proposed v1.1 schema, and validates against the
backend's own new `ProjectSnapshotV11` models. The backend serves
it via `/snapshot?version=1.1` and `/snapshot/v1.1`, owner-gated
identically to v1.0. The coordinator's collected-vs-uncollected
item is also fixed: a checked-but-empty PR list now yields an
`OpenPrsGroup` with `items: []`; `null` means uncollected only.

**C-4 / CPL-1 (verified_current coupling) — CLOSED at model
level.** `Project.validate_deployment_coupling` rejects
`verified_current` unless `evidence_level == 'host_verified'` AND
at least one `host_receipt` source exists. Probes: the legitimate
combination is accepted; `git_verified` + receipt → rejected;
`host_verified` without receipt → rejected; the exact round-1
overclaim payload (`verified_current` + `unverified`) → rejected.
Residual (LOW): the validator checks receipt *presence*, not
receipt *freshness* — a `verified_current` project whose only
receipt is years old still constructs. The staleness machinery
flags such a project overall, but the coupling check itself does
not read the receipt's `observed_at`. Recommend the coordinator
track this as hardening, not a gate item.

**C-5 / F-04 (RMC citation) — CLOSED.** The RMC registry entry now
cites `https://github.com/brettbaysinger-boop/lumen-app/pull/10`
alongside its repo source.

## Regression evidence (independently executed)

- **Backend suite on the `15de1eb` tree: 39/39 passed** (was 35;
  the delta adds coupling, v1.1, and long-title coverage).
- **UI suite on the `0342c2ea` tree: 95/95 passed** (was 91),
  including the shipped 60h and PS-02-payload cases.
- **Original 27-probe battery re-run against the new backend:**
  every behavior now as required — the one changed line is the
  CPL-1 probe, which flipped because the overclaim it used to
  accept is now rejected (the fix working, recorded as such).
- **Real auth import behavior** (auditor stub `lumen.auth`, test
  fixture only): with the production module importable, the handler
  delegates to it — owner → 200, non-owner → 403, its 401
  propagates with **no fallthrough** to the built-in verifier,
  missing credentials → 401. A production module that *crashes*
  (RuntimeError) yields HTTP 500 — fail-closed (no access granted),
  though a clean 503 would be tidier (INFO). With the module
  absent, the built-in Supabase verifier behaves exactly as the
  final audit probed.
- **Lane discipline on the delta commits:** PS-01 +3 files / 8
  changed, PS-02 5 changed — every path inside its lane; against
  the coordination baseline both branches still show zero modified
  and zero deleted files. No Live Room, Memory Tab, RMC, or shared
  navigation touched.

## Verdict

```text
PS03_DELTA_VERDICT=PASS
```

Scoped strictly to the two heads above. All five conditions from
the final audit are closed with executed evidence, and the
auth/evidence/GitHub posture from that audit is unregressed. This
PASS is an audit verdict on source code and reproduced tests; it
does **not** merge, deploy, register the router, or configure the
owner environment — coordinator integration (router wiring, owner
id, Supabase, optional GitHub token) and the remaining PS-00 gates
stay owner/coordinator steps, as before.

## Filing appendix

Deliverable: this file only,
`docs/project-steward/reviews/PS-03-DELTA-RECHECK-20261115.md`,
added on the existing audit branch
`review/ps03-grok-security-20261115` (draft PR #34). The commit SHA
and read-back verification are recorded in the delivery message and
the project record.

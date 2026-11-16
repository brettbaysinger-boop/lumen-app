# Public / Private mode: guarded integration procedures (PR #43)

**Status: candidate only. Nothing here has been run on the Lumen host. Each step needs the owner's
go-ahead.** The PR carries backend changes, so it is two separately reviewed steps. The
frontend-only web updater (`scripts/animated-web-update.sh`) must refuse the backend part, and its
allowlist is not changed.

Source this candidate is built on: PR #36 (Live Room, auto landscape) + PR #38 at `8b182cf`
(D01-63E automatic learning; `runtime.py` identical to `05232f7`; `RmcMemoriesPanel.tsx` sha256
`abb6f4e4c35114a7…`, which matches the owner's posted live prefix). Those files are carried unchanged.

## 0. Read-only preflight (safe to run any time)

From a clone of the PR #43 head, with PR #38's commit present:

```
scripts/animated-privacy-mode-preflight.sh /path/to/live/lumen-checkout
```

It prints, per file, `applied` (live already equals the candidate), `clean` (live equals PR #38, so
the change applies as designed) or `REVIEW` (live differs from both: hand merge, never copy), and
runs `git apply --check` for the backend patch. It writes nothing and prints only the
`LUMEN_MEMORY_BACKEND` and `RMC_AUTO_INGEST_ENABLED` values from `.env`. Also run the updater's own
`scripts/animated-web-update.sh check` (read-only) to see what it would accept.

Stop if anything says `REVIEW`, or if `RmcMemoriesPanel.tsx`, `memories.tsx` or `memory_routes.py`
is not `applied`.

## 1. Backend (owner-gated; RMC02, GOLD V2 and Helios untouched)

Files: `backend/lumen/privacy_mode.py` (new), small hunks in `main.py` (runtime choice, image guard,
queue guard), `rmc_auto_ingest.py` (two Public checks), `schemas.py`, `voice.py`. No database,
RMC engine, port or auth change. Older clients that send no `privacy_mode` behave exactly as today.

1. Preflight says `clean` (or `applied`) for every backend file and the patch applies.
2. Back up the live backend files listed above with the existing backup tooling.
3. Apply only `git diff 8b182cf <PR head> -- backend/lumen` as a patch to the live tree. Never copy
   whole files over the live checkout.
4. Run the backend test suite on the host, including `tests/test_privacy_mode.py` and
   `tests/test_privacy_mode_rmc.py`.
5. Restart only the Lumen API the usual way. Check with fictional data: Private chat and automatic
   learning unchanged; a Public turn sends `privacy_mode: "public"` and leaves no `rmc_auto_state`.
6. Rollback: restore the backed-up files and restart the Lumen API. No data migration to undo.

The backend can go first by itself: until a new web build sends `privacy_mode`, every request is Private.

## Preflight receipt (owner-run, 2026-11-15 America/Phoenix)

`PREFLIGHT: no file needs review` at candidate `c6cf0cd` against PR #38 `8b182cf`. Live checkout
HEAD `f23d112` with 12 uncommitted paths. Backend files clean (`runtime.py` applied), frontend files
clean, protected Memories files identical to PR #38, backend patch `git apply --check` clean.
Nothing changed on the host.

## 2. Frontend: the protected web updater cannot ship this, by design

`scripts/animated-web-update.sh` fast-forwards the live checkout from its HEAD and refuses any range
that is not frontend-only or that touches a locally edited file. Live is `f23d112` plus uncommitted
scoped files (#35/#38 Memories and RMC backend). The range `f23d112..candidate` therefore contains
backend files (from #38 and this PR) and touches locally edited files, so `check` must say NOT READY.
That is correct behaviour: the updater is not changed, widened or bypassed.

**STOP here.** No existing tool can release this safely. Proposed minimal path, for owner review
(nothing below is built or run yet):

* **Step 1, backend (new owner-gated script, backend lane, not the web updater).** Confirm token
  `apply:<patch sha256>`; sha256 backup of the 5 backend files; refuse unless each live file still
  matches the preflight's `clean` hash; `git apply` of the exact reviewed patch
  (`git diff 8b182cf <head> -- backend/lumen`) without moving HEAD or touching other local edits; run
  the backend tests in a throwaway copy of the patched tree; restart only `lumen-api` the way it is
  restarted today; health check plus fictional canary (Public turn: no `rmc_auto_state`, nothing
  queued; Private turn: queued as today); automatic restore of the 5 files and restart on any failure.
  Until a new web build exists, every request is Private, so this step changes no behaviour.
* **Step 2, frontend (new scoped web step that mirrors how #35/#38 went live).** Confirm token;
  build `dist` in a clean clone of the candidate with the live `.env`, run the updater's own
  `export_problem` checks; refuse unless every live frontend file is in the preflight's `clean` or
  `applied` state; swap `dist` keeping `dist.previous` for rollback; leave the live git HEAD and every
  local edit as they are (like the current Memories files). This keeps the updater's allowlist and
  fast-forward rule untouched for ordinary updates.
* **Step 3, Android (separate gate).** The Live Room needs the newer APK (#26/#36). Use the existing
  signed `scripts/android-refresh.sh` path and its rollback, owner-run.

Alternative the owner may prefer: commit the live local edits to a local branch on the host so the
existing updater can fast-forward again. That changes production Git, which the owner has ruled out
so far, so it is not recommended.

## Not covered by Public mode yet (labelled in the app as "Chat and Live Room only")

Memories, Documents and My Day tabs, push and reminder previews, the "Continue together" picker,
saved message drafts, and scene selection (#18).

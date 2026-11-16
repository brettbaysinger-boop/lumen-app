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

## 2. Frontend (frontend-only release candidate, via the protected updater)

Only after step 1 is live. The web build must carry the Live Room (#26/#36), the live Memories UI
(#35/#38, byte-for-byte as above) and this PR's client files. Every frontend file in this PR,
including `scripts/test-animated-privacy-mode-browser.cjs` and
`scripts/animated-privacy-mode-preflight.sh`, matches the updater's existing `FRONTEND_ONLY` rule.

1. Build from a branch whose backend matches what is live after step 1 (otherwise the updater
   refuses, as designed).
2. `scripts/animated-web-update.sh check`, then the owner's confirmed `update:<commit>`.
3. Browser check: switch in Chat, Video Chat, Theater; mid-stream flip; reload in Public.
4. Android: no new native module, so the existing JS-only refresh path applies, owner-run, with
   the signed installation and rollback scripts as they are.
5. Rollback: `LUMEN_WEB_UPDATE_CONFIRM=rollback scripts/animated-web-update.sh rollback`.

## Not covered by Public mode yet (labelled in the app as "Chat and Live Room only")

Memories, Documents and My Day tabs, push and reminder previews, the "Continue together" picker,
saved message drafts, and scene selection (#18).

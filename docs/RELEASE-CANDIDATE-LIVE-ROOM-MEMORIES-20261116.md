# Web release candidate: Live Room + automatic landscape + the live RMC Memories screen — November 16, 2026

**Not for deployment. Not a release.** An isolated, frontend-only candidate for review, so that a
future guarded web update of the Live Room does not drop the RMC Memories screen that is live on
Lumen. Nothing here was run on Lumen, deployed, or built into an APK.

## What it is made of

- PR #36 at `1fbd8b0f99e08c7cef520228ad0f8cba42f6c140` (which contains PR #26 `d0bea7d`, PR #20,
  PR #17 and Wide Theater `f23d112`, the commit of the live checkout), unchanged.
- From PR #35 at `ca45253a8083aa5347d14dc9beb1dd0bea239e8d`, copied byte for byte, **frontend files
  only**:

| File | SHA256 in this candidate |
| --- | --- |
| `app/(tabs)/memories.tsx` | `065b0b213965c2382f3b9e1508d60a5d759b2854aae89e76a26449d3863580f0` |
| `components/RmcMemoriesPanel.tsx` | `9b832a6367a9b9a032af3d929dce4345a67a22f28b867356a6d75d85ebad94ac` |
| `tests/rmc-memories-panel.test.cjs` | as in PR #35 |
| `docs/RMC-MEMORIES-PANEL-20261115.md` | as in PR #35 |

Deliberately **not** included: PR #35's `backend/lumen/main.py`, `backend/lumen/rmc/memory_routes.py`,
`backend/lumen/runtime.py` and `backend/tests/test_rmc_memory_routes.py`. The backend on Lumen
already has them, a web build does not use them, and the web updater rightly refuses any change
under `backend/`. Also untouched: `backend/lumen/config.py`, `scripts/lumen-rmc.sh`,
`supabase/config.toml`, `package.json`, `app.json`.

## Blocker before this can be considered: one checksum does not match

The owner's read-only inventory of `/home/brett/lumen-push` (PR #36, November 15 Phoenix time):

- live `app/(tabs)/memories.tsx`: `065b0b21…580f0`. **Identical** to this candidate.
- live `components/RmcMemoriesPanel.tsx`: posted as `abb6f4e4c35114a761585c65d3e3ae753ce6133667fed195a685`
  (52 characters, so cut short). **Does not match** this candidate's `9b832a63…`, and differs from
  its first character on.

Until the full live checksum is read again and matches, this candidate may contain a Memories panel
that is **not** the one live, and must not be served. If the live file really differs from
`ca45253a`, the live bytes are the ones to carry, and they would have to come from the host by the
owner's hand.

```
sha256sum /home/brett/lumen-push/components/RmcMemoriesPanel.tsx "/home/brett/lumen-push/app/(tabs)/memories.tsx"
git -C /home/brett/lumen-push status --short --untracked-files=all -- app components lib hooks types
```

## Second thing to settle: the updater will, correctly, not just run

`scripts/animated-web-update.sh` fast-forwards the live checkout and refuses when a locally edited
file would be touched. On Lumen, `app/(tabs)/memories.tsx` is a local edit and
`components/RmcMemoriesPanel.tsx` a local file, and this candidate carries both. So `check` is
expected to stop on them even when the bytes are identical. That is the guard doing its job. How
the live checkout's local RMC edits get recorded so that an update can proceed (and the five
protected non-frontend edits stay exactly as they are) is a decision for the owner together with
the RMC work. Nothing here forces it, and `update` must not be run from this branch.

## Checks run on this candidate

- All files changed relative to the live commit `f23d112` fit the updater's unchanged frontend-only
  rule; none is under `backend/`, `supabase/`, or is a dependency or service script.
- Type check passes. Web export builds. `scripts/test-animated-live-room-browser.cjs`,
  `scripts/test-chat-scroll.cjs`, `scripts/test-animated-web-update.sh`: pass.
- `node --test tests/*.test.cjs`: 132 tests, **131 pass, 1 fails**. The failing one is PR #35's
  "backend receipts are tagged RMC-only and no list-all is claimed": it reads
  `backend/lumen/rmc/memory_routes.py`, which a frontend-only candidate does not carry (`ENOENT`).
  It is left as it is, not skipped or edited. On a full trial merge of PR #35, backend files
  included, all 131 tests of that merge passed. PR #35's three panel tests pass here.

## Not proven

That this is what is live (see the blocker), anything on Lumen, anything on the phone.

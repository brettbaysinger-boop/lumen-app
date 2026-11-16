# Public / Private mode: release procedure (three separate gates)

**Status: prepared only. Nothing has been run on the Lumen host or the phone. Each gate needs the
owner's go-ahead and its own confirmation word.** No feature is added here; this ships exactly the
reviewed PR #43 with PR #36 (Live Room, automatic landscape) and PR #38 (D01-63E automatic learning,
RMC Memories interface) as they are.

## Pinned candidate

| What | Commit | Content |
|---|---|---|
| Live today (owner preflight) | `f23d112` + 12 uncommitted files | the 12 files are byte for byte PR #38 |
| PR #38, automatic learning | `8b182cfe46fa` | unchanged |
| **Backend release** (gate 1) | `a2148d8761e0` | `8b182cf` + PR #43's 7 backend files, nothing else |
| **Web release** (gate 2) | release branch head, see PR #43 | child of `a2148d8`; 35 frontend files only |
| Android source (gate 3) | PR #43 head | same `app/ components/ lib/ hooks/ types/` as the web release |

Branch `release/public-private-20261116` holds the two release commits. Its tree equals PR #43's head,
with three deliberate differences that keep the release inside the **unchanged** web updater:

* `scripts/animated-web-update.sh` is the live one (`97e032f`). PR #26 (in PR #36) widened its
  allowlist to `scripts/android-refresh.sh`; that wider version is **not** released.
* `scripts/android-refresh.sh` and its test are left out of the web release (they are not web files
  under the live allowlist). Android uses them from a PR #43 clone on the build host.

Run everything from a clean clone of the release branch on the Lumen host, as the user lumen-api runs as:

```bash
git clone <repo> ~/lumen-privacy-release && cd ~/lumen-privacy-release
git checkout release/public-private-20261116 && npm ci
git log --oneline -3     # release head, a2148d8, 8b182cf
```

## Gate 1: backend (lumen-api only)

```bash
scripts/animated-privacy-release.sh backend-check            # read-only; prints the confirmation line
PRIVACY_RELEASE_CONFIRM=backend:<12 printed> scripts/animated-privacy-release.sh backend
```

`backend-check` refuses unless every one of the 7 backend files in the patch is exactly PR #38's (or
all are already the reviewed ones), the patch applies (`git apply --check`), `runtime.py`, `config.py`,
`memory_routes.py`, `RmcMemoriesPanel.tsx` and `memories.tsx` are PR #38's, lumen-api is healthy and runs
as this user. The confirmation word is the first 12 characters of the patch's sha256 (`3967011f7def`
for `a2148d8`).

`backend` then, in this order:

1. backs up the 7 files with their sha256 under `~/.local/state/lumen-animated/privacy-release/backend-*`
   (the 3 new files are recorded as absent);
2. copies the live `backend/` and `scripts/` (no `.venv`, no `.env`) to a throwaway directory, applies the
   reviewed patch there, checks every patched file equals the reviewed commit, and adds the reviewed copy of
   any backend test file the live checkout lacks (the copy only; the live checkout has no
   `test_rmc_auto_ingest.py` or `test_rmc_memory_routes.py`). With the live venv's Python it then runs, by
   test discovery, the **whole backend suite**, then the Public / Private tests (exactly 26) and the D01-63E
   automatic-learning tests (exactly 14). Each must say OK with the expected number of tests run. Any failure
   stops here: nothing live has changed;
3. applies the same patch to the live working files only (no index, no HEAD, no other file) and checks the
   result byte for byte;
4. restarts lumen-api only (`sudo systemctl restart lumen-api`), waits for `/health`, checks the running
   API now serves `privacy_mode`, that the RMC / automatic-learning settings systemd gives lumen-api are
   exactly as before, and that the protected files, both `.env` files and live HEAD did not change.

Any failure in 3 or 4 restores the 7 files byte for byte and restarts lumen-api again, by itself.
Until gate 2 ships the new web app, no client sends `privacy_mode`, so every request is Private and
behaves exactly as today.

Owner acceptance after gate 1, fictional data: a normal Private chat still answers; "Remember that my
fictional favourite colour is teal" still shows up as automatic learning in Memories.

**Rollback:** `PRIVACY_RELEASE_CONFIRM=backend-rollback scripts/animated-privacy-release.sh backend-rollback`
restores the backed-up files and restarts lumen-api. It refuses while the new web app is live (roll
that back first: an old backend would ignore Public).

## Gate 2: web app

### 2a. Record what the live checkout already contains (owner decision: moves live HEAD, writes no file)

The updater only fast-forwards from live HEAD and never touches a locally edited file. Live HEAD is
`f23d112` and PR #38 (and, after gate 1, the privacy backend) are uncommitted files, so the updater
correctly refuses any release today. This step is the smallest safe fix, and is the one change to
production Git in this procedure:

```bash
scripts/animated-privacy-release.sh baseline-check           # read-only
PRIVACY_RELEASE_CONFIRM=baseline:a2148d8761e0 scripts/animated-privacy-release.sh baseline
```

It refuses unless gate 1 is done, live HEAD is an ancestor of `a2148d8`, and **every** file that differs
between live HEAD and `a2148d8` is already in the working tree byte for byte (and file mode), with none
staged. Then it fetches the commit into the live repository, moves HEAD (the branch) from `f23d112` to
`a2148d8` with `git update-ref`, and sets the index entries of exactly those files. It writes no working
file, resets nothing, discards nothing: afterwards `git status` is clean because the files already were
that commit. Any other local edit stays as it is.

**Open item before 2a:** the owner's Gate 1 run showed the live checkout lacks PR #38's
`backend/tests/test_rmc_auto_ingest.py` and `backend/tests/test_rmc_memory_routes.py`, so `baseline-check`
will refuse (correctly) until that is decided. Nothing here adds them to the live checkout.

**Undo:** `PRIVACY_RELEASE_CONFIRM=baseline-undo scripts/animated-privacy-release.sh baseline-undo` puts
HEAD and those index entries back to `f23d112`; the files stay untouched. It refuses while the new web
app is live.

### 2b. Release through the unchanged web updater

```bash
scripts/animated-privacy-release.sh web-check                # read-only, then runs the updater's own check
LUMEN_WEB_UPDATE_CONFIRM=update:<7 printed> scripts/animated-web-update.sh update
```

`web-check` requires gate 1 and 2a, the running API serving `privacy_mode`, the release keeping PR #38's
`RmcMemoriesPanel.tsx` and `memories.tsx`, and this clone's `animated-web-update.sh` byte-identical to the
live one, then runs `animated-web-update.sh check`, which must say READY: fast-forward, frontend only
(35 files: Live Room, automatic landscape, Public/Private, docs, tests), no local edit touched.

The updater then builds the web app with the live `.env`, swaps `dist` (keeping the old one), and
fast-forwards the live checkout. No service is restarted. Reload the browser.

Owner acceptance: the six checks in `docs/public-private-mode.md` ("Owner acceptance"), fictional data.

**Rollback:** `LUMEN_WEB_UPDATE_CONFIRM=rollback scripts/animated-web-update.sh rollback`: the previous
build and HEAD `a2148d8`, nothing restarted. (If the updater ever stops during its fetch or merge, its
build swap is already recorded: run the same rollback.)

## Gate 3: Android (Galaxy S22), on the build host

Needs gate 1 (the phone app sends `privacy_mode` too). Uses the existing guarded script unchanged,
from a clone of **PR #43's head** (it contains `scripts/android-refresh.sh`; its app source equals the
web release). One step per command; go on only after `RESULT <step>: OK`.

```bash
git diff --quiet release/public-private-20261116 HEAD -- app components lib hooks types && echo "same app source as the web release"
scripts/android-refresh.sh backup                     # copies the installed APK off the phone; note the sha256 and signer it prints
scripts/android-refresh.sh phone
scripts/android-refresh.sh build-check
ANDROID_REFRESH_CONFIRM=build:<12 printed> scripts/android-refresh.sh build
scripts/android-refresh.sh verify <APK printed by build>
unzip -p <APK> assets/index.android.bundle | grep -ac lumenroompublic    # must be 1 or more: this bundle has the switch
ANDROID_REFRESH_CONFIRM=install:<12 printed> scripts/android-refresh.sh install <APK>
```

The installed APK is whatever ADB reports at that moment. Earlier hashes are history, not an expectation:
`e963ef43…` (Nov 15 build-host inventory) and `9ba60544…8d1192a` (PR #20 receipt for the signed in-app APK).
If `backup` or `phone` reports a hash or signer you do not recognise, stop there.

`verify` and `install` refuse another package, certificate, lower `versionCode`, missing public settings
or a stale bundle. The script's own bundle marker proves the Live Room build; the `grep` line proves
the Public/Private switch is in it. Only `adb install -r` touches the phone (data kept); nothing is signed.

**Rollback:** `ANDROID_REFRESH_CONFIRM=rollback scripts/android-refresh.sh rollback` (the APK that was
installed before), or `... rollback <older kept APK>`.

## Way back, in order

Web app (updater rollback) → 2a (`baseline-undo`) → backend (`backend-rollback`). The phone is
independent: its rollback can run at any time, but do not leave a new phone app on an old backend.
Tested end to end: after all three, live HEAD, index, every file and the served build are exactly as
before gate 1.

## Validation (offline, no service touched)

`scripts/test-animated-privacy-release.sh` builds a simulated live checkout from this repository's real
commits (`f23d112` with PR #38's 12 files uncommitted), stubs systemd, sudo, curl and the web build,
runs the real backend suite on the patched copy, and drives every gate, refusal and rollback, including
the unchanged updater's `check`, `update` and `rollback`.

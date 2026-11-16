#!/usr/bin/env bash
# Offline test of scripts/animated-privacy-release.sh together with the unchanged web updater, on a
# simulated live checkout built from this repository's real commits: the owner's live HEAD (f23d112) with
# PR #38's files present as uncommitted edits, exactly as the owner's preflight found it. Stand-ins for
# systemctl, sudo, curl, npx and id. The real backend test suite runs on the patched copy.
# Touches no service and no real checkout. Run it from a clone of the release branch:
#   TEST_PYTHON=/path/to/venv/bin/python scripts/test-animated-privacy-release.sh
# TEST_LOCPATH: a directory with a compiled en_US.UTF-8 locale, if the system has none (localedef -i en_US -f UTF-8 DIR/en_US.UTF-8).
set -euo pipefail
SRC=$(cd "$(dirname "$0")/.." && pwd)
PY="${TEST_PYTHON:-$SRC/backend/.venv/bin/python}"
LIVE_BASE=f23d112ada23d6b8a49d7750345ef4f4d33233fc
RMC_BASE=8b182cfe46fae3480e90b9db64787544e25541f6
BACKEND=$(sed -n 's/^BACKEND_COMMIT="${PRIVACY_RELEASE_BACKEND:-\([0-9a-f]*\)}"$/\1/p' "$SRC/scripts/animated-privacy-release.sh")
PR43="${TEST_PR43_HEAD:-}"   # optional: a PR #43 commit whose web updater is wider than the live one
T=$(mktemp -d); T=$(realpath "$T"); [ -n "${KEEP_TEST_DIR:-}" ] && echo "test dir: $T" || trap 'rm -rf "$T"' EXIT
fail=0; ok() { echo "PASS $1"; }; bad() { echo "FAIL $1"; fail=1; }
[ -x "$PY" ] || { echo "no Python at $PY (set TEST_PYTHON)"; exit 2; }

L=$T/live; C=$T/clone
git -c advice.detachedHead=false clone -q "$SRC" "$L"; git -C "$L" -c advice.detachedHead=false checkout -q -B main "$LIVE_BASE"; git -C "$L" remote remove origin
git -C "$L" diff --name-only "$LIVE_BASE" "$RMC_BASE" > "$T/rmc-paths"
while read -r p; do mkdir -p "$L/$(dirname "$p")"; git -C "$SRC" show "$RMC_BASE:$p" > "$L/$p"; done < "$T/rmc-paths"
echo "EXPO_PUBLIC_X=fictional" > "$L/.env"; echo "RMC_AUTO_INGEST_ENABLED=true" > "$L/backend/.env"
mkdir -p "$L/dist"; echo old > "$L/dist/index.html"
git -c advice.detachedHead=false clone -q "$SRC" "$C"; git -C "$C" -c advice.detachedHead=false checkout -q "$(git -C "$SRC" rev-parse HEAD)"; mkdir -p "$C/node_modules"

snap() {  # everything that matters in the live checkout: HEAD, index, every working file, the served build
  (cd "$L" && git rev-parse HEAD && git ls-files -s && find . -path ./.git -prune -o -type f -print0 | sort -z | xargs -0 sha256sum) | sha256sum
}
START=$(snap)
[ "$(wc -l < "$T/rmc-paths")" = 12 ] && [ "$(git -C "$L" status --porcelain | wc -l)" = 12 ] && ok "simulated live: f23d112 with PR #38's 12 files uncommitted" || bad "setup"

S=$T/state; B=$T/bin; H=$T/home; mkdir -p "$S" "$B" "$H"
cat > "$B/systemctl" <<STUB
#!/usr/bin/env bash
echo "systemctl \$*" >> "$S/calls"
case "\$*" in
  "show -p User --value lumen-api") echo fictional ;;
  "show -p Environment --value lumen-api") echo "LUMEN_MEMORY_BACKEND=rmc RMC_AUTO_INGEST_ENABLED=true PATH=/usr/bin" ;;
  "cat lumen-web.service") echo "ExecStart=node $L/scripts/serve-web.cjs" ;;
  "restart lumen-api") if grep -q privacy_mode "$L/backend/lumen/schemas.py"; then touch "$S/serving_privacy"; else rm -f "$S/serving_privacy"; fi ;;
esac
exit 0
STUB
printf '#!/usr/bin/env bash\necho "sudo $*" >> "%s/calls"\nexec "$@"\n' "$S" > "$B/sudo"
printf '#!/usr/bin/env bash\ncase "$1" in -u) echo 1000 ;; *) echo fictional ;; esac\n' > "$B/id"
cat > "$B/curl" <<STUB
#!/usr/bin/env bash
url="\${@: -1}"
case "\$url" in
  */health) [[ -f "$S/health_broken" && -f "$S/serving_privacy" ]] && exit 22; echo '{"status":"ok"}' ;;
  */openapi.json) [[ -f "$S/serving_privacy" ]] && echo '{"RespondRequest":{"properties":{"privacy_mode":{}}}}' || echo '{}' ;;
  *) [[ -f "$L/dist/index.html" ]] && printf 200 || printf 404 ;;
esac
STUB
cat > "$B/npx" <<STUB
#!/usr/bin/env bash
echo "npx \$*" >> "$S/calls"
mkdir -p dist/_expo/static/js/web
echo "new <script src=\"/_expo/static/js/web/entry-abc.js\" defer></script>" > dist/index.html
echo bundle > dist/_expo/static/js/web/entry-abc.js
STUB
cat > "$B/python" <<STUB
#!/usr/bin/env bash
[[ -f "$S/tests_fail" && " \$* " == *" unittest "* ]] && { echo "FAILED (failures=1)"; exit 1; }
exec "$PY" "\$@"
STUB
chmod +x "$B"/*
run() {  # run SCRIPT MODE [VAR=value ...]
  local script="$1" mode="$2"; shift 2
  env PATH="$B:$PATH" HOME="$H" XDG_STATE_HOME="$H/state" LIVE_DIR="$L" PRIVACY_RELEASE_PYTHON="$B/python" PRIVACY_RELEASE_WAIT=2 "$@" \
    bash "$C/scripts/$script" "$mode" 2>&1
}
rel() { run animated-privacy-release.sh "$@"; }
upd() { run animated-web-update.sh "$@"; }
restarts() { grep -c '^systemctl restart lumen-api' "$S/calls" 2>/dev/null || true; }
backend_is() { local p; while read -r p; do [ "$(git -C "$C" rev-parse -q --verify "$1:$p" || echo absent)" = "$( [ -f "$L/$p" ] && git hash-object "$L/$p" || echo absent)" ] || return 1; done < <(git -C "$C" diff --name-only "$RMC_BASE" "$BACKEND" -- backend); }
PATCH_ID=$(git -C "$C" diff --binary "$RMC_BASE" "$BACKEND" -- backend | sha256sum | cut -c1-12)

# --- Step 1: backend --------------------------------------------------------------------------------
out=$(rel backend-check) && grep -q '^READY' <<<"$out" && [ "$(snap)" = "$START" ] && ok "backend-check: ready, read-only" || { bad "backend-check"; echo "$out"; }
grep -q "PRIVACY_RELEASE_CONFIRM=backend:$PATCH_ID" <<<"$out" && ok "backend token is the reviewed patch's sha256 ($PATCH_ID)" || bad "token"
out=$(rel backend) || true; grep -q 'Owner confirmation missing' <<<"$out" && [ "$(snap)" = "$START" ] && ok "backend refuses without confirmation" || bad "backend confirmation"
touch "$S/tests_fail"; out=$(rel backend PRIVACY_RELEASE_CONFIRM=backend:$PATCH_ID) || true; rm "$S/tests_fail"
grep -q 'tests failed or did not all run on the patched copy' <<<"$out" && [ "$(snap)" = "$START" ] && [ "$(restarts)" = 0 ] && ok "failing tests on the patched copy: nothing live changed, nothing restarted" || { bad "tests fail"; echo "$out"; }
rm -f "$H/state/lumen-animated/privacy-release/backend-current"
touch "$S/health_broken"; out=$(rel backend PRIVACY_RELEASE_CONFIRM=backend:$PATCH_ID) || true; rm "$S/health_broken"
grep -q 'restoring the backed-up files' <<<"$out" && [ "$(snap)" = "$START" ] && [ "$(restarts)" = 2 ] && [ ! -f "$S/serving_privacy" ] \
  && ok "unhealthy after restart: files restored byte for byte and lumen-api restarted on the old code" || { bad "auto rollback"; echo "$out"; }
: > "$S/calls"
out=$(rel backend PRIVACY_RELEASE_CONFIRM=backend:$PATCH_ID) || { bad "backend run"; echo "$out"; }
grep -q 'whole backend suite: [0-9]* tests pass' <<<"$out" && grep -q 'Public / Private mode: 26 tests pass' <<<"$out" && grep -q 'RMC automatic learning (D01-63E): 14 tests pass' <<<"$out" \
  && ok "real backend suites passed on the patched copy: $(grep -o 'whole backend suite: [0-9]* tests' <<<"$out"), privacy 26, automatic learning 14" || { bad "suite"; echo "$out"; }
backend_is "$BACKEND" && [ "$(git -C "$L" rev-parse HEAD)" = "$LIVE_BASE" ] && [ -z "$(git -C "$L" diff --cached --name-only)" ] \
  && ok "backend: the 7 files are the reviewed ones; HEAD and index untouched" || bad "backend files"
[ "$(git -C "$L" status --porcelain | wc -l)" = 17 ] && ok "backend: the 12 PR #38 local edits are still there (plus schemas.py, voice.py and 3 new privacy files)" || { bad "local edits"; git -C "$L" status --porcelain; }
for p in backend/lumen/runtime.py backend/lumen/config.py backend/lumen/rmc/memory_routes.py components/RmcMemoriesPanel.tsx "app/(tabs)/memories.tsx"; do
  [ "$(git hash-object "$L/$p")" = "$(git -C "$C" rev-parse "$RMC_BASE:$p")" ] || bad "protected $p changed"
done; ok "backend: runtime.py, config.py and the RMC Memories files are PR #38's, unchanged"
[ "$(restarts)" = 1 ] && ! grep -q 'lumen-web' "$S/calls" && ok "backend: only lumen-api restarted, once" || { bad "restarts"; cat "$S/calls"; }
out=$(rel backend PRIVACY_RELEASE_CONFIRM=backend:$PATCH_ID) || true; grep -q 'already recorded' <<<"$out" && ok "backend does not run twice" || bad "twice"
AFTER1=$(snap)
out=$(rel backend-rollback) || true; grep -q 'Owner confirmation missing' <<<"$out" && ok "backend-rollback refuses without confirmation" || bad "rollback confirmation"
out=$(rel backend-rollback PRIVACY_RELEASE_CONFIRM=backend-rollback) && [ "$(snap)" = "$START" ] && [ ! -f "$S/serving_privacy" ] \
  && ok "backend-rollback: live checkout exactly as at the start, lumen-api on the old code" || { bad "backend rollback"; echo "$out"; }
out=$(rel backend PRIVACY_RELEASE_CONFIRM=backend:$PATCH_ID) && [ "$(snap)" = "$AFTER1" ] && ok "backend can be applied again after a rollback" || { bad "reapply"; echo "$out"; }

# --- Step 2: the unchanged updater refuses before the baseline; the baseline writes no file ----------
out=$(upd check) || true; grep -q '^NOT READY' <<<"$out" && ok "web updater (unchanged) refuses while live HEAD is f23d112: $(grep -c '^FAIL' <<<"$out") problem(s)" || { bad "updater before baseline"; echo "$out"; }
out=$(rel web-check) || true; grep -q 'do steps 1 and 2a first' <<<"$out" && ok "web-check refuses before the baseline" || { bad "web-check early"; echo "$out"; }
out=$(rel baseline-check) && grep -q '^READY' <<<"$out" && [ "$(snap)" = "$AFTER1" ] && ok "baseline-check: ready, read-only" || { bad "baseline-check"; echo "$out"; }
out=$(rel baseline) || true; grep -q 'Owner confirmation missing' <<<"$out" && ok "baseline refuses without confirmation" || bad "baseline confirmation"
sums() { (cd "$L" && find . -path ./.git -prune -o -type f -print0 | sort -z | xargs -0 sha256sum) | sha256sum; }
FILES=$(sums)
out=$(rel baseline PRIVACY_RELEASE_CONFIRM=baseline:${BACKEND:0:12}) || { bad "baseline run"; echo "$out"; }
[ "$(git -C "$L" rev-parse HEAD)" = "$BACKEND" ] && [ -z "$(git -C "$L" status --porcelain)" ] && [ "$(sums)" = "$FILES" ] \
  && ok "baseline: HEAD is the backend commit, nothing uncommitted, not one working file written" || { bad "baseline"; git -C "$L" status --porcelain; }
AFTER2=$(snap)
out=$(rel baseline-undo PRIVACY_RELEASE_CONFIRM=baseline-undo) && [ "$(snap)" = "$AFTER1" ] && ok "baseline-undo: HEAD and index exactly as before, files untouched" || { bad "baseline undo"; echo "$out"; }
out=$(rel baseline PRIVACY_RELEASE_CONFIRM=baseline:${BACKEND:0:12}) && [ "$(snap)" = "$AFTER2" ] && ok "baseline can be recorded again" || { bad "baseline again"; echo "$out"; }

# --- Step 2b: web app through the unchanged updater ------------------------------------------------
out=$(rel web-check) && grep -q '^READY' <<<"$out" && grep -q 'frontend only' <<<"$out" && grep -q "web updater is the live one, unchanged" <<<"$out" \
  && ok "web-check + unchanged updater check: READY, frontend only ($(grep -o 'frontend only: [0-9]* file(s)' <<<"$out"))" || { bad "web-check"; echo "$out"; }
TARGET=$(git -C "$C" rev-parse HEAD)
out=$(upd update LUMEN_WEB_UPDATE_CONFIRM=update:${TARGET:0:7}) || { bad "updater update"; echo "$out"; }
[ "$(git -C "$L" rev-parse HEAD)" = "$TARGET" ] && [ -z "$(git -C "$L" status --porcelain --untracked-files=no)" ] && grep -q '^new' "$L/dist/index.html" \
  && ok "web: the unchanged updater fast-forwards to the release and serves the new build" || { bad "web update"; echo "$out"; }
[ "$(git -C "$L" diff --name-only "$TARGET" -- 'components/RmcMemoriesPanel.tsx' 'app/(tabs)/memories.tsx' backend)" = "" ] && backend_is "$BACKEND" \
  && ok "web: live RMC Memories files and backend are the reviewed ones" || bad "web protected"
out=$(rel backend-rollback PRIVACY_RELEASE_CONFIRM=backend-rollback) || true; grep -q 'Roll back the web app first' <<<"$out" && backend_is "$BACKEND" && ok "backend-rollback refuses while the new web app is live" || { bad "order"; echo "$out"; }
out=$(rel baseline-undo PRIVACY_RELEASE_CONFIRM=baseline-undo) || true; grep -q 'Roll back the web app first' <<<"$out" && ok "baseline-undo refuses while the new web app is live" || { bad "order 2"; echo "$out"; }

# --- Full way back, in order ------------------------------------------------------------------------
out=$(upd rollback LUMEN_WEB_UPDATE_CONFIRM=rollback) && [ "$(snap)" = "$AFTER2" ] && ok "web rollback (unchanged updater): old build, HEAD at the backend commit" || { bad "web rollback"; echo "$out"; }
out=$(rel baseline-undo PRIVACY_RELEASE_CONFIRM=baseline-undo) && [ "$(snap)" = "$AFTER1" ] || { bad "undo 2a"; echo "$out"; }
out=$(rel backend-rollback PRIVACY_RELEASE_CONFIRM=backend-rollback) && [ "$(snap)" = "$START" ] \
  && ok "all the way back: live HEAD, index, every file and the served build are exactly as at the start" || { bad "full rollback"; echo "$out"; }

# --- As found on the real host: 5 of PR #38's tests and docs never reached the live checkout ------------
HOSTMISSING="backend/tests/test_rmc_auto_ingest.py backend/tests/test_rmc_memory_routes.py docs/RMC-AUTOMATIC-LEARNING-D01-63.md docs/RMC-MEMORIES-PANEL-20261115.md tests/rmc-memories-panel.test.cjs"
for p in $HOSTMISSING; do rm "$L/$p"; done; NOTESTS=$(snap)
out=$(rel backend PRIVACY_RELEASE_CONFIRM=backend:$PATCH_ID) || { bad "backend without live test files"; echo "$out"; }
[ "$(grep -c 'added reviewed test file missing from the live checkout (copy only)' <<<"$out")" = 1 ] && grep -q 'copy only): backend/tests/test_rmc_auto_ingest.py' <<<"$out" && grep -q 'RMC automatic learning (D01-63E): 14 tests pass' <<<"$out" \
  && backend_is "$BACKEND" && [ ! -e "$L/backend/tests/test_rmc_auto_ingest.py" ] \
  && ok "live without PR #38's test files (as on the host): whole suite on the live tests, reviewed test_rmc_auto_ingest.py added to the copy only, targeted suites 26 + 14, live gets only the 7 files" || { bad "missing test files"; echo "$out"; }
AFTERG1=$(snap)
rc=0; out=$(env ${TEST_LOCPATH:+LOCPATH=$TEST_LOCPATH} LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 PATH="$B:$PATH" HOME="$H" XDG_STATE_HOME="$H/state" LIVE_DIR="$L" bash "$C/scripts/animated-privacy-release.sh" baseline-check 2>&1) || rc=$?
[ "$rc" = 1 ] && grep -q '^NOT READY' <<<"$out" && [ "$(grep -c '^INFO    missing ' <<<"$out")" = 5 ] && ! grep -q 'comm:' <<<"$out" && grep -q 'PRIVACY_RELEASE_CONFIRM=fill:' <<<"$out" && [ "$(snap)" = "$AFTERG1" ] \
  && ok "baseline-check (UTF-8 locale): names the 5 files as missing, ends NOT READY, no sort/comm error, read-only" || { bad "baseline-check classify"; echo "$out"; }
FILL=$(grep -o 'PRIVACY_RELEASE_CONFIRM=fill:[0-9a-f]*' <<<"$out" | head -1)
out=$(rel baseline PRIVACY_RELEASE_CONFIRM=baseline:${BACKEND:0:12}) || true; grep -q 'baseline-check reports' <<<"$out" && [ "$(snap)" = "$AFTERG1" ] && ok "baseline refuses while files are missing; nothing written" || { bad "baseline with missing"; echo "$out"; }
out=$(rel baseline-fill) || true; grep -q 'Owner confirmation missing' <<<"$out" && [ "$(snap)" = "$AFTERG1" ] && ok "baseline-fill refuses without confirmation" || { bad "fill confirmation"; echo "$out"; }
echo "# changed" >> "$L/docs/RMC-AUTOMATIC-LEARNING-D01-63.md" 2>/dev/null; git -C "$SRC" show "$RMC_BASE:docs/RMC-AUTOMATIC-LEARNING-D01-63.md" > "$L/docs/RMC-AUTOMATIC-LEARNING-D01-63.md"; echo "# changed" >> "$L/docs/RMC-AUTOMATIC-LEARNING-D01-63.md"
out=$(rel baseline-fill $FILL) || true; grep -q 'Owner confirmation missing' <<<"$out" && [ ! -e "$L/backend/tests/test_rmc_auto_ingest.py" ] && ok "baseline-fill: the token names the exact files, so a changed file voids it; nothing written" || { bad "fill token"; echo "$out"; }
F2=$(git -C "$C" diff --name-only "$LIVE_BASE" "$BACKEND" | while read -r p; do case " $HOSTMISSING " in *" $p "*) [ "$p" = docs/RMC-AUTOMATIC-LEARNING-D01-63.md ] || echo "$(git -C "$C" rev-parse "$BACKEND:$p") $p" ;; esac; done | sha256sum | cut -c1-12)
out=$(rel baseline-fill PRIVACY_RELEASE_CONFIRM=fill:$F2) || true; grep -q "is 'changed', not missing" <<<"$out" && [ ! -e "$L/backend/tests/test_rmc_auto_ingest.py" ] && ok "baseline-fill refuses when a file exists but differs (hand review; never overwritten)" || { bad "fill changed"; echo "$out"; }
rm "$L/docs/RMC-AUTOMATIC-LEARNING-D01-63.md"; [ "$(snap)" = "$AFTERG1" ] || bad "reset changed doc"
out=$(rel baseline-fill $FILL) || { bad "fill run"; echo "$out"; }
for p in $HOSTMISSING; do [ "$(git hash-object "$L/$p")" = "$(git -C "$C" rev-parse "$BACKEND:$p")" ] || bad "fill wrote $p wrong"; done
[ "$(grep -c '^wrote ' <<<"$out")" = 5 ] && ok "baseline-fill writes exactly the 5 missing tests/docs from the commit, byte for byte" || { bad "fill"; echo "$out"; }
[ "$(snap)" = "$AFTER1" ] && ok "after the fill the live checkout equals the normal post-gate-1 state" || bad "fill state"
out=$(rel baseline-check) && grep -q '^READY' <<<"$out" && ok "baseline-check READY after the fill" || { bad "check after fill"; echo "$out"; }
out=$(rel baseline-fill-undo PRIVACY_RELEASE_CONFIRM=fill-undo) && [ "$(snap)" = "$AFTERG1" ] && ok "baseline-fill-undo deletes exactly what it wrote" || { bad "fill undo"; echo "$out"; }
out=$(rel baseline-fill $FILL) && out=$(rel baseline PRIVACY_RELEASE_CONFIRM=baseline:${BACKEND:0:12}) && [ "$(snap)" = "$AFTER2" ] || { bad "fill + baseline"; echo "$out"; }
out=$(rel baseline-fill-undo PRIVACY_RELEASE_CONFIRM=fill-undo) || true; grep -q 'undo it first' <<<"$out" && ok "baseline-fill-undo refuses while the baseline is recorded" || { bad "fill-undo order"; echo "$out"; }
out=$(rel baseline-undo PRIVACY_RELEASE_CONFIRM=baseline-undo) && out=$(rel baseline-fill-undo PRIVACY_RELEASE_CONFIRM=fill-undo) && out=$(rel backend-rollback PRIVACY_RELEASE_CONFIRM=backend-rollback) && [ "$(snap)" = "$NOTESTS" ] \
  && ok "host case all the way back (baseline-undo, fill-undo, backend-rollback): exactly as before gate 1" || { bad "host way back"; echo "$out"; }
for p in $HOSTMISSING; do git -C "$SRC" show "$RMC_BASE:$p" > "$L/$p"; done
[ "$(snap)" = "$START" ] || bad "restore test files"

# --- Refusals ---------------------------------------------------------------------------------------
echo "# drift" >> "$L/backend/lumen/main.py"
out=$(rel backend-check) || true; grep -q 'hand review needed' <<<"$out" && grep -q '^NOT READY' <<<"$out" && ok "backend-check refuses a live main.py that is neither PR #38's nor the candidate's" || { bad "drift"; echo "$out"; }
git -C "$SRC" show "$RMC_BASE:backend/lumen/main.py" > "$L/backend/lumen/main.py"
echo "// drift" >> "$L/components/RmcMemoriesPanel.tsx"
out=$(rel backend-check) || true; grep -q 'RmcMemoriesPanel.tsx differs' <<<"$out" && ok "backend-check refuses when the live Memories panel is not PR #38's" || { bad "panel drift"; echo "$out"; }
git -C "$SRC" show "$RMC_BASE:components/RmcMemoriesPanel.tsx" > "$L/components/RmcMemoriesPanel.tsx"
out=$(rel backend PRIVACY_RELEASE_CONFIRM=backend:$PATCH_ID) || { bad "apply for drift test"; echo "$out"; }
echo "// drift" >> "$L/app/(tabs)/memories.tsx"
out=$(rel baseline-check) || true; grep -q 'differ from the reviewed commit' <<<"$out" && grep -q 'memories.tsx' <<<"$out" && ok "baseline-check refuses when an uncommitted live file is not byte for byte the reviewed one" || { bad "baseline drift"; echo "$out"; }
git -C "$SRC" show "$RMC_BASE:app/(tabs)/memories.tsx" > "$L/app/(tabs)/memories.tsx"
if [ -n "$PR43" ]; then
  out=$(rel baseline PRIVACY_RELEASE_CONFIRM=baseline:${BACKEND:0:12}) || bad "baseline for PR #43 test"
  git -C "$C" -c advice.detachedHead=false checkout -q "$PR43"; mkdir -p "$C/node_modules"
  out=$(rel web-check) || true; grep -q 'differs from the live one' <<<"$out" && ok "web-check refuses a clone whose web updater is wider than the live one (PR #43 head)" || { bad "wider updater"; echo "$out"; }
  git -C "$C" -c advice.detachedHead=false checkout -q "$TARGET"
fi
[[ $fail == 0 ]] && echo "ALL PASS" || { echo "SOME FAILED"; exit 1; }

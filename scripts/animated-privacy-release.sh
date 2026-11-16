#!/usr/bin/env bash
# Public / Private mode (Issue #39, PR #43): the owner-gated release steps the web updater does not do.
# Every step is separate. A *-check step is read-only. A changing step needs its own confirmation word,
# undoes itself if anything fails, and has its own way back.
#
# Step 1, backend: lumen-api only.
#   scripts/animated-privacy-release.sh backend-check
#   PRIVACY_RELEASE_CONFIRM=backend:<12 of the patch's sha256> scripts/animated-privacy-release.sh backend
#   PRIVACY_RELEASE_CONFIRM=backend-rollback scripts/animated-privacy-release.sh backend-rollback
# Step 2a, record that the live checkout already contains the reviewed backend commit (no file is written):
#   scripts/animated-privacy-release.sh baseline-check
#   PRIVACY_RELEASE_CONFIRM=baseline:<12 of the backend commit> scripts/animated-privacy-release.sh baseline
#   PRIVACY_RELEASE_CONFIRM=baseline-undo scripts/animated-privacy-release.sh baseline-undo
#   Only if baseline-check names files as "missing" (tests and docs that never reached the live checkout):
#   PRIVACY_RELEASE_CONFIRM=fill:<12 printed> scripts/animated-privacy-release.sh baseline-fill
#   PRIVACY_RELEASE_CONFIRM=fill-undo scripts/animated-privacy-release.sh baseline-fill-undo
# Step 2b, web app: read-only pre-check here, then the unchanged scripts/animated-web-update.sh.
#   scripts/animated-privacy-release.sh web-check
#   scripts/animated-privacy-release.sh status
# Step 3, Android: scripts/android-refresh.sh on the build host (docs/public-private-mode-release.md).
#
# Run from a clean clone of the release branch, as the user lumen-api runs as. sudo is used only by
# `backend` and `backend-rollback`, to restart lumen-api, as scripts/animated-deploy.sh does.
# Settings: LIVE_DIR (default /home/brett/lumen-push), LUMEN_API_URL (default http://127.0.0.1:8001),
# PRIVACY_RELEASE_PYTHON (default $LIVE_DIR/backend/.venv/bin/python, used only for the tests in a copy).
#
# Never touched: RMC02 and its gateway, the database, .env files, systemd settings and drop-ins, lumen-web,
# runtime.py, config.py, the RMC Memories files, GOLD V2, Helios, the Android app. No file is ever copied
# over a live file: the backend step applies only the reviewed patch, and only to files that still equal
# PR #38. The baseline step writes no file at all.
set -Eeuo pipefail   # -E: a failure inside a helper function still runs the undo trap
export LC_ALL=C      # one byte order for every list compared below
MODE="${1:-}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIVE_DIR="${LIVE_DIR:-/home/brett/lumen-push}"
API="${LUMEN_API_URL:-http://127.0.0.1:8001}"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/lumen-animated/privacy-release"
PYTHON="${PRIVACY_RELEASE_PYTHON:-$LIVE_DIR/backend/.venv/bin/python}"
# Pinned and reviewed. PR #38 @ 8b182cf is the live D01-63E automatic-learning source (owner preflight
# 2026-11-15); the backend commit is exactly PR #43's backend change on top of it.
RMC_BASE="${PRIVACY_RELEASE_RMC_BASE:-8b182cfe46fae3480e90b9db64787544e25541f6}"
BACKEND_COMMIT="${PRIVACY_RELEASE_BACKEND:-a2148d8761e0ac96954fb47379b05bffc2361712}"
# Files that must stay exactly PR #38's (the automatic learning and the RMC Memories interface).
PROTECTED=(backend/lumen/runtime.py backend/lumen/config.py backend/lumen/rmc/memory_routes.py components/RmcMemoriesPanel.tsx "app/(tabs)/memories.tsx")
ZERO=0000000000000000000000000000000000000000
problems=0
pass() { printf 'PASS  %s\n' "$1"; }
bad()  { printf 'FAIL  %s\n' "$1"; problems=$((problems + 1)); }
info() { printf 'INFO  %s\n' "$1"; }
die()  { printf 'STOP  %s\n' "$1" >&2; exit 1; }
[ "$(id -u)" != 0 ] || die "Run as the Lumen service user, not root."

repo() { git -C "$REPO" "$@"; }
live() { git -C "$LIVE_DIR" "$@"; }
blob_of() { repo rev-parse -q --verify "$1:$2" 2>/dev/null || echo absent; }            # commit path
live_blob() { if [ -f "$LIVE_DIR/$1" ]; then git hash-object --no-filters -- "$LIVE_DIR/$1"; else echo absent; fi; }
mode_of() { repo ls-tree "$1" -- "$2" | cut -d' ' -f1; }
live_mode() { if [ -x "$LIVE_DIR/$1" ]; then echo 100755; else echo 100644; fi; }
backend_files() { repo diff --name-only "$RMC_BASE" "$BACKEND_COMMIT" -- backend; }
the_patch() { repo diff --binary "$RMC_BASE" "$BACKEND_COMMIT" -- backend; }
patch_id() { the_patch | sha256sum | cut -c1-12; }
health_ok() { curl -fsS --max-time 5 "$API/health" >/dev/null 2>&1; }
wait_health() { for _ in $(seq 1 "${PRIVACY_RELEASE_WAIT:-60}"); do health_ok && return 0; sleep 1; done; return 1; }
serves_privacy() { curl -fsS --max-time 5 "$API/openapi.json" 2>/dev/null | grep -q '"privacy_mode"'; }
memory_settings() {  # names and values lumen-api gets from systemd for its memory store (no key is among them)
  systemctl show -p Environment --value lumen-api 2>/dev/null | tr ' ' '\n' | grep -E '^(LUMEN_MEMORY_BACKEND|RMC_[A-Z_]+)=' | sort || true
}
fingerprint() {  # hashes only, never contents: protected files, .env files, live HEAD
  local p
  for p in "${PROTECTED[@]}" .env backend/.env; do
    printf '%s %s\n' "$( [ -f "$LIVE_DIR/$p" ] && sha256sum < "$LIVE_DIR/$p" | cut -c1-64 || echo absent)" "$p"
  done
  echo "HEAD $(live rev-parse HEAD)"
}
backend_state() {  # base: every backend file equals PR #38 | applied: equals the backend commit | mixed
  local p l b n s=0 a=0 total=0
  while read -r p; do
    total=$((total + 1)); l=$(live_blob "$p"); b=$(blob_of "$RMC_BASE" "$p"); n=$(blob_of "$BACKEND_COMMIT" "$p")
    [ "$l" = "$b" ] && s=$((s + 1)); [ "$l" = "$n" ] && a=$((a + 1))
  done < <(backend_files)
  if [ "$total" -gt 0 ] && [ "$s" = "$total" ]; then echo base
  elif [ "$total" -gt 0 ] && [ "$a" = "$total" ]; then echo applied; else echo mixed; fi
}
clone_checks() {
  [ -z "$(repo status --porcelain --untracked-files=no)" ] && pass "this clone has no uncommitted changes" || bad "this clone has uncommitted changes; use a reviewed commit only"
  [ "$(realpath "$REPO")" != "$(realpath "$LIVE_DIR" 2>/dev/null)" ] && pass "separate from the live checkout" || bad "run this from the reviewed clone, not the live checkout"
  if repo cat-file -e "$BACKEND_COMMIT^{commit}" 2>/dev/null && [ "$(repo rev-parse "$BACKEND_COMMIT^")" = "$(repo rev-parse "$RMC_BASE")" ]; then
    local outside; outside=$(repo diff --name-only "$RMC_BASE" "$BACKEND_COMMIT" | grep -v '^backend/' || true)
    [ -z "$outside" ] && pass "backend commit ${BACKEND_COMMIT:0:12} is PR #38 ${RMC_BASE:0:12} plus $(backend_files | wc -l) backend file(s), nothing else" \
      || bad "backend commit changes more than backend/: $(tr '\n' ' ' <<< "$outside")"
  else
    bad "backend commit ${BACKEND_COMMIT:0:12} (child of PR #38 ${RMC_BASE:0:12}) is not in this clone"
  fi
  live rev-parse HEAD >/dev/null 2>&1 && info "live: $LIVE_DIR @ $(live rev-parse --short=12 HEAD), $(live status --porcelain --untracked-files=no | wc -l) local edit(s)" || bad "$LIVE_DIR is not a git checkout"
}
protected_check() {
  local p
  for p in "${PROTECTED[@]}"; do
    [ "$(live_blob "$p")" = "$(blob_of "$RMC_BASE" "$p")" ] && pass "live $p equals PR #38's" || bad "live $p differs from PR #38's; this release was built and tested on PR #38's copy"
  done
}
new_record() { mkdir -p "$STATE_DIR"; chmod 700 "$STATE_DIR"; mktemp -d "$STATE_DIR/$1-$(date +%Y%m%d-%H%M%S)-XXXXXX"; }

# --- Step 1: backend ---------------------------------------------------------------------------------
backend_check() {
  clone_checks
  [ "$problems" = 0 ] || return 0
  local state p; state=$(backend_state)
  case "$state" in
    base) pass "every backend file in the patch equals PR #38's, as the owner's preflight found"
          the_patch | live apply --check - 2>/dev/null && pass "the reviewed patch applies to the live files (checked, nothing written)" || bad "the reviewed patch does not apply to the live files" ;;
    applied) info "the backend change is already applied" ;;
    *) bad "live backend files are neither PR #38's nor the candidate's; hand review needed, nothing may be applied"
       while read -r p; do info "  $p live=$(live_blob "$p" | cut -c1-12) pr38=$(blob_of "$RMC_BASE" "$p" | cut -c1-12) candidate=$(blob_of "$BACKEND_COMMIT" "$p" | cut -c1-12)"; done < <(backend_files) ;;
  esac
  protected_check
  [ -x "$PYTHON" ] && "$PYTHON" -I -c 'import fastapi, httpx, pydantic_settings' 2>/dev/null && pass "the live Python can run the backend tests ($PYTHON)" || bad "no usable Python at $PYTHON (set PRIVACY_RELEASE_PYTHON)"
  [ "$(systemctl show -p User --value lumen-api 2>/dev/null)" = "$(id -un)" ] && pass "lumen-api runs as $(id -un)" || bad "lumen-api does not run as $(id -un)"
  health_ok && pass "lumen-api is healthy" || bad "lumen-api does not answer $API/health"
  serves_privacy && info "lumen-api already serves privacy_mode" || info "lumen-api does not serve privacy_mode yet (expected before step 1)"
  info "memory settings from systemd (kept exactly): $(memory_settings | tr '\n' ' ')"
}

backend_restore() {  # $1 = record; puts every backed-up file back exactly, then restarts lumen-api
  local record="$1" sum path
  while read -r sum path; do
    if [ "$sum" = absent ]; then rm -f "$LIVE_DIR/$path"
    else cp -p "$record/files/$path" "$LIVE_DIR/$path"; [ "$(sha256sum < "$LIVE_DIR/$path" | cut -c1-64)" = "$sum" ] || die "could not restore $path; the copy is in $record/files"; fi
  done < "$record/before"
  sudo systemctl restart lumen-api
  wait_health || die "files restored, but lumen-api is not healthy; check: systemctl status lumen-api"
  mv "$STATE_DIR/backend-current" "$STATE_DIR/backend-undone-$(basename "$record")" 2>/dev/null || true
  echo "Backend files are exactly as before step 1, and lumen-api was restarted."
}

# Runs one discovery pattern on the patched copy (uses $copy, $record and run from backend_apply). Fails closed:
# it needs OK and, unless "any", exactly the expected number of tests, so a missing or unloadable file stops.
suite() {
  local label="$1" pattern="$2" expected="$3" out ran ok
  out=$(cd "$copy/backend" && "${run[@]}" -m unittest discover -s tests -p "$pattern" -q 2>&1) && ok=1 || ok=0
  printf '== %s (%s)\n%s\n' "$label" "$pattern" "$out" >> "$record/tests.log"
  ran=$(sed -n 's/^Ran \([0-9][0-9]*\) tests\{0,1\} in .*/\1/p' <<< "$out" | tail -1)
  [ "$ok" = 1 ] && [ -n "$ran" ] && [ "$ran" -gt 0 ] && { [ "$expected" = any ] || [ "$ran" = "$expected" ]; } && tail -1 <<< "$out" | grep -q '^OK' \
    || die "$label: tests failed or did not all run on the patched copy (ran ${ran:-0}, expected $expected; see $record/tests.log). Nothing was changed."
  pass "$label: $ran tests pass on the patched copy"
}
test_count() { local f n=0; for f in "$@"; do n=$((n + $(repo show "$BACKEND_COMMIT:$f" | grep -cE '^[[:space:]]+(async )?def test_'))); done; echo "$n"; }

backend_apply() {
  local id; id=$(patch_id)
  [ "${PRIVACY_RELEASE_CONFIRM:-}" = "backend:$id" ] || die "Owner confirmation missing. After reviewing 'backend-check', run: PRIVACY_RELEASE_CONFIRM=backend:$id $0 backend"
  [ ! -f "$STATE_DIR/backend-current" ] || die "Step 1 is already recorded ($(cat "$STATE_DIR/backend-current")). Use status, or backend-rollback."
  backend_check > /dev/null; [ "$problems" = 0 ] || die "backend-check reports $problems problem(s). Nothing was changed. Run: $0 backend-check"
  [ "$(backend_state)" = base ] || die "the backend change is already applied. Nothing was changed."
  local record path before_head
  record=$(new_record backend); before_head=$(live rev-parse HEAD)
  the_patch > "$record/patch"; memory_settings > "$record/memory-settings"; fingerprint > "$record/fingerprint"
  mkdir -p "$record/files"
  while read -r path; do   # backup with sha256; "absent" for the new files
    if [ -f "$LIVE_DIR/$path" ]; then
      mkdir -p "$record/files/$(dirname "$path")"; cp -p "$LIVE_DIR/$path" "$record/files/$path"
      echo "$(sha256sum < "$LIVE_DIR/$path" | cut -c1-64) $path" >> "$record/before"
    else echo "absent $path" >> "$record/before"; fi
  done < <(backend_files)
  echo "Backup: $record"

  # Test the production-compatible candidate first: a throwaway copy of the live backend with the patch.
  copy=$(mktemp -d); trap 'rm -rf "$copy"' EXIT
  # backend/ and scripts/ (some backend tests run scripts), without the venv, caches or any .env file.
  tar -C "$LIVE_DIR" --exclude=backend/.venv --exclude=.env --exclude='*.env' --exclude=__pycache__ --exclude=.pytest_cache -cf - backend scripts | tar -C "$copy" -xf -
  git -C "$copy" apply - < "$record/patch" || die "the patch does not apply to a copy of the live backend. Nothing was changed."
  while read -r path; do [ "$(git hash-object --no-filters -- "$copy/$path")" = "$(blob_of "$BACKEND_COMMIT" "$path")" ] || die "the patched copy of $path is not the reviewed file. Nothing was changed."; done < <(backend_files)
  local run=(env -i PATH="$PATH" HOME="$HOME" LANG=C.UTF-8 PYTHONPATH="$copy/backend" SUPABASE_URL=http://127.0.0.1:9 SUPABASE_SERVICE_ROLE_KEY=fictional "$PYTHON" -B)
  [[ "$(cd "$copy/backend" && "${run[@]}" -c 'import lumen; print(lumen.__file__)')" == "$copy/backend/"* ]] || die "the tests would not use the patched copy. Nothing was changed."
  : > "$record/tests.log"
  echo "Running the backend tests on the patched copy (log: $record/tests.log) ..."
  suite "whole backend suite" 'test*.py' any      # the live checkout's own tests, as they are
  # The targeted suites. The live checkout lacks some of PR #38's test files (tests are not deployed code), so
  # the reviewed copy of a missing targeted test file is added to the throwaway copy only, after the whole suite ran;
  # a test file the live checkout has is never replaced.
  for path in backend/tests/test_privacy_mode.py backend/tests/test_privacy_mode_rmc.py backend/tests/test_rmc_auto_ingest.py; do
    if [ ! -e "$copy/$path" ]; then
      repo show "$BACKEND_COMMIT:$path" > "$copy/$path"
      echo "added reviewed test file missing from the live checkout (copy only): $path" | tee -a "$record/tests.log"
    fi
    [ "$(git hash-object --no-filters -- "$copy/$path")" = "$(blob_of "$BACKEND_COMMIT" "$path")" ] || die "$path in the copy is not the reviewed file. Nothing was changed."
  done
  suite "Public / Private mode" 'test_privacy_mode*.py' "$(test_count backend/tests/test_privacy_mode.py backend/tests/test_privacy_mode_rmc.py)"
  suite "RMC automatic learning (D01-63E)" 'test_rmc_auto_ingest.py' "$(test_count backend/tests/test_rmc_auto_ingest.py)"

  echo "$record" > "$STATE_DIR/backend-current"
  trap 'echo "Step 1 failed; restoring the backed-up files." >&2; trap - ERR; backend_restore "$record"; rm -rf "$copy"; exit 1' ERR
  live apply - < "$record/patch"                      # working files only: no index, no HEAD, no other file
  while read -r path; do [ "$(live_blob "$path")" = "$(blob_of "$BACKEND_COMMIT" "$path")" ]; done < <(backend_files)
  [ "$(live rev-parse HEAD)" = "$before_head" ]
  sudo systemctl restart lumen-api
  wait_health
  serves_privacy                                         # the running lumen-api now knows privacy_mode
  [ "$(memory_settings)" = "$(cat "$record/memory-settings")" ]   # RMC / automatic-learning settings exactly as before
  [ "$(fingerprint)" = "$(cat "$record/fingerprint")" ]           # protected files, .env files and HEAD untouched
  trap - ERR
  echo "Step 1 done: the reviewed backend change is live, lumen-api restarted and healthy, memory settings unchanged."
  echo "Until the new web app is released every request is Private, exactly as before."
  echo "Go back with: PRIVACY_RELEASE_CONFIRM=backend-rollback $0 backend-rollback"
}

backend_rollback() {
  [ "${PRIVACY_RELEASE_CONFIRM:-}" = backend-rollback ] || die "Owner confirmation missing. Run: PRIVACY_RELEASE_CONFIRM=backend-rollback $0 backend-rollback"
  [ -f "$STATE_DIR/backend-current" ] || die "Step 1 is not recorded. Nothing to go back to."
  local head path; head=$(live rev-parse HEAD)
  if [ "$head" != "$(repo rev-parse "$BACKEND_COMMIT")" ] && repo merge-base --is-ancestor "$BACKEND_COMMIT" "$head" 2>/dev/null; then
    die "the new web app is live (${head:0:12}); without this backend it would send Public turns to a backend that ignores them. Roll back the web app first: LUMEN_WEB_UPDATE_CONFIRM=rollback scripts/animated-web-update.sh rollback"
  fi
  while read -r path; do
    [ "$(live_blob "$path")" = "$(blob_of "$BACKEND_COMMIT" "$path")" ] || die "$path was changed after step 1; nothing was restored. Its backup is in $(cat "$STATE_DIR/backend-current")/files"
  done < <(backend_files)
  backend_restore "$(cat "$STATE_DIR/backend-current")"
  [ "$head" != "$(repo rev-parse "$BACKEND_COMMIT")" ] || info "the baseline record (step 2a) is still in place; undo it too with: PRIVACY_RELEASE_CONFIRM=baseline-undo $0 baseline-undo"
}

# --- Step 2a: baseline record ------------------------------------------------------------------------
# The live checkout is at an older commit with PR #38's files present as uncommitted edits, and after
# step 1 with the reviewed backend change too. The web updater only fast-forwards and never touches a
# local edit, so it cannot go on from there. This step checks that every such file is byte for byte the
# reviewed backend commit, then moves the checkout's HEAD (and those index entries) to that commit.
# No file in the working tree is written; `baseline-undo` moves HEAD and the index back.
baseline_paths() { repo diff --name-only "$(live rev-parse HEAD)" "$BACKEND_COMMIT"; }
live_edits() { live -c core.quotePath=false diff --name-only HEAD; }        # tracked files edited locally
in_list() { grep -Fxf "$1" || true; }                                       # lines of stdin that are in file $1
FILL_ALLOWED='^(backend/tests/|docs/|tests/)'   # only tests and docs may ever be written by baseline-fill
classify() {  # path -> ok | missing | changed | mode | extra (live has a file the commit does not)
  local path="$1" want; want=$(blob_of "$BACKEND_COMMIT" "$path")
  if [ "$(live_blob "$path")" = "$want" ]; then
    [ "$want" = absent ] || [ "$(live_mode "$path")" = "$(mode_of "$BACKEND_COMMIT" "$path")" ] && echo ok || echo mode
  elif [ "$want" = absent ]; then echo extra
  elif [ ! -e "$LIVE_DIR/$path" ]; then echo missing
  else echo changed; fi
}
fillable() {  # the missing files baseline-fill may write: absent in live, tests or docs only
  local path; while read -r path; do [ "$(classify "$path")" = missing ] && grep -Eq "$FILL_ALLOWED" <<< "$path" && echo "$path"; done < <(baseline_paths) || true
}
fill_id() { fillable | while read -r p; do echo "$(blob_of "$BACKEND_COMMIT" "$p") $p"; done | sha256sum | cut -c1-12; }
baseline_check() {
  clone_checks
  [ "$problems" = 0 ] || return 0
  local head path state n=0 paths staged others
  local -a missing=() other=()
  head=$(live rev-parse HEAD)
  repo merge-base --is-ancestor "$BACKEND_COMMIT" HEAD && pass "this clone's commit builds on the backend commit" || bad "this clone is not the release branch (its HEAD does not contain ${BACKEND_COMMIT:0:12})"
  if [ "$head" = "$(repo rev-parse "$BACKEND_COMMIT")" ]; then info "already recorded: live HEAD is the backend commit"; return 0; fi
  repo cat-file -e "$head^{commit}" 2>/dev/null && repo merge-base --is-ancestor "$head" "$BACKEND_COMMIT" \
    && pass "live HEAD ${head:0:12} is an ancestor of the backend commit" || { bad "live HEAD ${head:0:12} is not an ancestor of the backend commit"; return 0; }
  [ "$(backend_state)" = applied ] && pass "step 1 is done (live backend files are the reviewed ones)" || bad "do step 1 (backend) first"
  while read -r path; do
    n=$((n + 1)); state=$(classify "$path")
    case "$state" in
      ok) ;;
      missing) missing+=("$path"); info "  missing  $path (reviewed $(blob_of "$BACKEND_COMMIT" "$path" | cut -c1-12), not in the live checkout)" ;;
      *) other+=("$path"); info "  $state  $path (live $(live_blob "$path" | cut -c1-12), reviewed $(blob_of "$BACKEND_COMMIT" "$path" | cut -c1-12))" ;;
    esac
  done < <(baseline_paths)
  [ "${#missing[@]}" = 0 ] && [ "${#other[@]}" = 0 ] && pass "all $n file(s) between live HEAD and the backend commit are already in the working tree, byte for byte"
  [ "${#missing[@]}" = 0 ] || bad "${#missing[@]} reviewed file(s) are missing from the live checkout, so nothing can be recorded: ${missing[*]}"
  [ "${#other[@]}" = 0 ] || bad "${#other[@]} live file(s) differ from the reviewed commit and need hand review (never overwritten): ${other[*]}"
  if [ "${#missing[@]}" -gt 0 ] && [ "${#other[@]}" = 0 ] && [ "$(fillable | wc -l)" = "${#missing[@]}" ]; then
    info "every missing file is a test or doc; after owner review they can be written exactly from the commit with:"
    info "  PRIVACY_RELEASE_CONFIRM=fill:$(fill_id) $0 baseline-fill"
  fi
  paths=$(mktemp); baseline_paths > "$paths"
  staged=$(live -c core.quotePath=false diff --cached --name-only | in_list "$paths")
  [ -z "$staged" ] && pass "none of them is staged in the live index" || bad "staged in the live index: $(tr '\n' ' ' <<< "$staged")"
  others=$(live_edits | grep -vFxf "$paths" || true); rm -f "$paths"
  info "other local edits stay exactly as they are: $(grep -c . <<< "$others" || true)"
}

# Writes only reviewed tests and docs that are absent from the live checkout (never an existing file), exactly
# from the backend commit, and records them so baseline-fill-undo can delete exactly those again.
baseline_fill() {
  local id; id=$(fill_id)
  [ "${PRIVACY_RELEASE_CONFIRM:-}" = "fill:$id" ] || die "Owner confirmation missing. After reviewing 'baseline-check', run: PRIVACY_RELEASE_CONFIRM=fill:$id $0 baseline-fill"
  [ ! -f "$STATE_DIR/fill-current" ] || die "A fill is already recorded ($(cat "$STATE_DIR/fill-current"))."
  [ ! -f "$STATE_DIR/baseline-current" ] || die "A baseline is recorded; nothing may be written now."
  clone_checks > /dev/null; [ "$problems" = 0 ] || die "this clone or the live checkout is not as expected. Nothing was changed."
  [ "$(backend_state)" = applied ] || die "do step 1 (backend) first. Nothing was changed."
  local path state record
  while read -r path; do
    state=$(classify "$path")
    [ "$state" = ok ] || [ "$state" = missing ] || die "$path is '$state', not missing; that needs hand review. Nothing was changed."
    [ "$state" = ok ] || grep -Eq "$FILL_ALLOWED" <<< "$path" || die "$path is missing but is not a test or doc; it is never written here. Nothing was changed."
  done < <(baseline_paths)
  [ -n "$(fillable)" ] || die "nothing is missing. Nothing was changed."
  local dir tmp
  while read -r path; do   # before any write: no target may exist in any form, and no directory on the way may be a link
    [ ! -e "$LIVE_DIR/$path" ] && [ ! -L "$LIVE_DIR/$path" ] || die "$path exists (or is a link). Nothing was changed."
    dir=$(dirname "$path")
    while [ "$dir" != . ]; do [ ! -L "$LIVE_DIR/$dir" ] || die "$dir is a symbolic link. Nothing was changed."; dir=$(dirname "$dir"); done
  done < <(fillable)
  record=$(new_record fill); fillable > "$record/planned"; : > "$record/written"
  echo "$record" > "$STATE_DIR/fill-current"
  trap 'echo "Fill failed; deleting only what it created." >&2; trap - ERR; rm -f "${tmp:-}"; fill_remove "$record"; exit 1' ERR
  while read -r path; do
    mkdir -p "$LIVE_DIR/$(dirname "$path")"
    # Write and check a temporary file in the same directory, then hard-link it to the name. `ln` without -f
    # fails if anything exists at the name (a file, a directory or a link, even a dangling one): no clobbering.
    tmp=$(mktemp "$LIVE_DIR/$(dirname "$path")/.privacy-fill.XXXXXX")
    repo show "$BACKEND_COMMIT:$path" > "$tmp"
    if [ "$(mode_of "$BACKEND_COMMIT" "$path")" = 100755 ]; then chmod 755 "$tmp"; else chmod 644 "$tmp"; fi
    [ "$(git hash-object --no-filters -- "$tmp")" = "$(blob_of "$BACKEND_COMMIT" "$path")" ]
    ln -T -- "$tmp" "$LIVE_DIR/$path"   # -T: an existing directory at the name is an error, never a destination
    echo "$path" >> "$record/written"                                # recorded only once it was created
    rm -f -- "$tmp"; tmp=
    [ ! -L "$LIVE_DIR/$path" ] && [ "$(classify "$path")" = ok ]
    echo "wrote $path"
  done < "$record/planned"
  trap - ERR
  echo "Done: $(wc -l < "$record/written") reviewed test/doc file(s) written; no other file touched. Next: $0 baseline-check"
  echo "Go back with: PRIVACY_RELEASE_CONFIRM=fill-undo $0 baseline-fill-undo"
}
fill_remove() {  # $1 = record; deletes exactly the files it wrote, only while they are still the reviewed ones
  local record="$1" path
  while read -r path; do
    [ -e "$LIVE_DIR/$path" ] || [ -L "$LIVE_DIR/$path" ] || continue
    [ ! -L "$LIVE_DIR/$path" ] && [ "$(classify "$path")" = ok ] || die "$path changed after the fill; left in place, nothing more was deleted."
    rm -f "$LIVE_DIR/$path"
  done < "$record/written"
  mv "$STATE_DIR/fill-current" "$STATE_DIR/fill-undone-$(basename "$record")" 2>/dev/null || true
  echo "The written test/doc files are gone again; the live checkout is as before the fill."
}
baseline_fill_undo() {
  [ "${PRIVACY_RELEASE_CONFIRM:-}" = fill-undo ] || die "Owner confirmation missing. Run: PRIVACY_RELEASE_CONFIRM=fill-undo $0 baseline-fill-undo"
  [ -f "$STATE_DIR/fill-current" ] || die "No fill is recorded. Nothing to go back to."
  [ ! -f "$STATE_DIR/baseline-current" ] || die "A baseline is recorded; undo it first: PRIVACY_RELEASE_CONFIRM=baseline-undo $0 baseline-undo"
  fill_remove "$(cat "$STATE_DIR/fill-current")"
}

tree_sums() { local p; while read -r p; do echo "$(live_blob "$p") $p"; done < "$1"; }
baseline_restore() {  # $1 = record; HEAD and index entries back, working tree untouched
  local record="$1" prev path line
  prev=$(cat "$record/previous-head")
  live update-ref -m "privacy release: baseline undo" HEAD "$prev" "$(repo rev-parse "$BACKEND_COMMIT")"
  while read -r path; do
    line=$(awk -F'\t' -v p="$path" '$2 == p' "$record/index-before")
    [ -n "$line" ] && printf '%s\n' "$line" || printf '0 %s\t%s\n' "$ZERO" "$path"
  done < "$record/paths" | live update-index --index-info
  [ "$(tree_sums "$record/paths")" = "$(cat "$record/tree-sums")" ] || die "working tree files changed during undo; compare with $record/tree-sums"
  mv "$STATE_DIR/baseline-current" "$STATE_DIR/baseline-undone-$(basename "$record")" 2>/dev/null || true
  echo "Live HEAD is back at ${prev:0:12}; every file is exactly as it was."
}
baseline_record() {
  [ "${PRIVACY_RELEASE_CONFIRM:-}" = "baseline:${BACKEND_COMMIT:0:12}" ] || die "Owner confirmation missing. After reviewing 'baseline-check', run: PRIVACY_RELEASE_CONFIRM=baseline:${BACKEND_COMMIT:0:12} $0 baseline"
  [ ! -f "$STATE_DIR/baseline-current" ] || die "A baseline is already recorded ($(cat "$STATE_DIR/baseline-current"))."
  baseline_check > /dev/null; [ "$problems" = 0 ] || die "baseline-check reports $problems problem(s). Nothing was changed. Run: $0 baseline-check"
  local record prev
  prev=$(live rev-parse HEAD); [ "$prev" != "$(repo rev-parse "$BACKEND_COMMIT")" ] || die "already recorded. Nothing was changed."
  record=$(new_record baseline)
  echo "$prev" > "$record/previous-head"; live symbolic-ref -q HEAD > "$record/branch" || echo detached > "$record/branch"
  baseline_paths > "$record/paths"; tree_sums "$record/paths" > "$record/tree-sums"
  (cd "$LIVE_DIR" && tr '\n' '\0' < "$record/paths" | xargs -0 git ls-files -s --) > "$record/index-before"
  live fetch -q "$REPO" "$BACKEND_COMMIT"                # objects only (and FETCH_HEAD), as the web updater does
  echo "$record" > "$STATE_DIR/baseline-current"
  trap 'echo "Step 2a failed; putting HEAD back." >&2; trap - ERR; baseline_restore "$record"; exit 1' ERR
  live update-ref -m "privacy release: working tree already equals ${BACKEND_COMMIT:0:12} (PR #38 + reviewed backend)" HEAD "$BACKEND_COMMIT" "$prev"
  while read -r path; do   # index entries of exactly these paths, from the commit (ls-tree lines are index-info lines)
    if repo cat-file -e "$BACKEND_COMMIT:$path" 2>/dev/null; then repo ls-tree "$BACKEND_COMMIT" -- "$path"; else printf '0 %s\t%s\n' "$ZERO" "$path"; fi
  done < "$record/paths" | live update-index --index-info
  [ -z "$(cd "$LIVE_DIR" && tr '\n' '\0' < "$record/paths" | xargs -0 git status --porcelain --untracked-files=all --)" ]
  [ "$(tree_sums "$record/paths")" = "$(cat "$record/tree-sums")" ]
  trap - ERR
  echo "Step 2a done: live HEAD is ${BACKEND_COMMIT:0:12}. No file was written; $(wc -l < "$record/paths") file(s) are no longer local edits."
  echo "Go back with: PRIVACY_RELEASE_CONFIRM=baseline-undo $0 baseline-undo"
}
baseline_undo() {
  [ "${PRIVACY_RELEASE_CONFIRM:-}" = baseline-undo ] || die "Owner confirmation missing. Run: PRIVACY_RELEASE_CONFIRM=baseline-undo $0 baseline-undo"
  [ -f "$STATE_DIR/baseline-current" ] || die "No baseline is recorded. Nothing to go back to."
  [ "$(live rev-parse HEAD)" = "$(repo rev-parse "$BACKEND_COMMIT")" ] || die "live HEAD is not the backend commit (web app released?). Roll back the web app first: LUMEN_WEB_UPDATE_CONFIRM=rollback scripts/animated-web-update.sh rollback"
  baseline_restore "$(cat "$STATE_DIR/baseline-current")"
}

# --- Step 2b: web app pre-check (the release itself is the unchanged web updater) ---------------------
web_check() {
  clone_checks
  [ "$problems" = 0 ] || return 0
  local p
  [ "$(live rev-parse HEAD)" = "$(repo rev-parse "$BACKEND_COMMIT")" ] && pass "step 2a is done (live HEAD is the backend commit)" || bad "do steps 1 and 2a first (live HEAD is not ${BACKEND_COMMIT:0:12})"
  [ "$(backend_state)" = applied ] && pass "the live backend files are the reviewed ones" || bad "the live backend files are not the reviewed ones"
  serves_privacy && pass "the running lumen-api understands privacy_mode" || bad "the running lumen-api does not serve privacy_mode; a Public switch would not be enforced"
  for p in components/RmcMemoriesPanel.tsx "app/(tabs)/memories.tsx"; do
    [ "$(blob_of HEAD "$p")" = "$(blob_of "$RMC_BASE" "$p")" ] && pass "release keeps PR #38's $p" || bad "release changes $p"
  done
  if cmp -s "$REPO/scripts/animated-web-update.sh" <(live show HEAD:scripts/animated-web-update.sh 2>/dev/null) \
     && cmp -s "$REPO/scripts/animated-web-update.sh" "$LIVE_DIR/scripts/animated-web-update.sh"; then
    pass "this clone's web updater is the live one, unchanged"
  else bad "this clone's scripts/animated-web-update.sh differs from the live one; use the release branch"; fi
  echo "== The unchanged web updater's own check"
  bash "$REPO/scripts/animated-web-update.sh" check || problems=$((problems + 1))
}

status() {
  info "live checkout: $LIVE_DIR @ $(live rev-parse --short=12 HEAD 2>/dev/null || echo '?')"
  info "backend files: $(backend_state) (base = PR #38, applied = reviewed change)"
  health_ok && info "lumen-api: healthy" || info "lumen-api: NOT healthy"
  serves_privacy && info "lumen-api serves privacy_mode" || info "lumen-api does not serve privacy_mode"
  for s in backend baseline; do
    [ -f "$STATE_DIR/$s-current" ] && info "$s step recorded: $(cat "$STATE_DIR/$s-current")" || info "$s step: not recorded"
  done
}

finish() { echo; [ "$problems" = 0 ] && echo "READY. Nothing was changed. $1" || { echo "NOT READY: $problems problem(s). Nothing was changed."; exit 1; }; }
case "$MODE" in
backend-check)  backend_check; finish "After owner review: PRIVACY_RELEASE_CONFIRM=backend:$(patch_id) $0 backend" ;;
backend)        backend_apply ;;
backend-rollback) backend_rollback ;;
baseline-check) baseline_check; finish "After owner review: PRIVACY_RELEASE_CONFIRM=baseline:${BACKEND_COMMIT:0:12} $0 baseline" ;;
baseline)       baseline_record ;;
baseline-undo)  baseline_undo ;;
baseline-fill)  baseline_fill ;;
baseline-fill-undo) baseline_fill_undo ;;
web-check)      web_check; finish "After owner review: LUMEN_WEB_UPDATE_CONFIRM=update:$(repo rev-parse --short=7 HEAD) scripts/animated-web-update.sh update" ;;
status)         status ;;
*) sed -n '2,30p' "${BASH_SOURCE[0]}"; exit 2 ;;
esac

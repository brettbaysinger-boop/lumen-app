#!/usr/bin/env bash
# Hotfix (PR #51): an explicit video request never becomes a still image. Owner-gated, one way back.
# Live failure 2026-11-16: "Make a 3-second video animating the image you just generated." was sent by the
# web app straight to /v0.2/images/generate (it names "image"), which made a new BigLust still.
#
# Two parts, each through its own reviewed path:
#   backend  3 files, 0b370fb -> a4c06b0 (main.py, runtime.py, tests/test_media_generation.py), applied
#            to the live WORKING FILES only if they still equal the video backend (0b370fb) byte for byte.
#            Restarts lumen-api only. The worker, .env, HEAD, ComfyUI/FP-Studio routes are not touched.
#   web      release/video-frontend-20261116 @ 49b4a36 (frontend only, fast-forward from 9ed4737) through the
#            unchanged scripts/animated-web-update.sh. This script only checks it; it never moves HEAD.
#
#   scripts/video-routing-hotfix.sh check            read-only: live files, tests on a patched copy, patch id
#   VIDEO_HOTFIX_CONFIRM=hotfix:<patch id> scripts/video-routing-hotfix.sh apply
#   VIDEO_HOTFIX_CONFIRM=hotfix-rollback scripts/video-routing-hotfix.sh rollback
#   scripts/video-routing-hotfix.sh status
#
# Run from a clean clone of feat/local-media-generation-20261116, as the user lumen-api runs as.
# Settings as scripts/video-release.sh: LIVE_DIR, LUMEN_API_URL, VIDEO_RELEASE_PYTHON. No .env value is printed.
set -Eeuo pipefail
export LC_ALL=C
MODE="${1:-}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIVE_DIR="${LIVE_DIR:-/home/brett/lumen-push}"
API="${LUMEN_API_URL:-http://127.0.0.1:8001}"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/lumen-video-release"
PYTHON="${VIDEO_RELEASE_PYTHON:-$LIVE_DIR/backend/.venv/bin/python}"
# Pinned and reviewed.
FROM="${VIDEO_HOTFIX_FROM:-0b370fb92884c82227ceb61202007c8f8f5884a6}"   # video backend, live since stage 3
TO="${VIDEO_HOTFIX_TO:-a4c06b0d3c3877da328ea5fa51f2f4206b0b0a29}"       # + the routing hotfix
WEB_FROM="${VIDEO_HOTFIX_WEB_FROM:-9ed47374874068c9ccd61f0c61ab0701bfb0b26e}"
WEB_TO="${VIDEO_HOTFIX_WEB_TO:-49b4a36e9cfecd3de44489ce1523ba5850c0c7f4}"
problems=0
pass() { printf 'PASS  %s\n' "$1"; }
bad()  { printf 'FAIL  %s\n' "$1"; problems=$((problems + 1)); }
info() { printf 'INFO  %s\n' "$1"; }
die()  { printf 'STOP  %s\n' "$1" >&2; exit 1; }
[ "$(id -u)" != 0 ] || die "Run as the Lumen service user, not root."

repo() { git -C "$REPO" "$@"; }
blob_of() { repo rev-parse -q --verify "$1:$2" 2>/dev/null || echo absent; }
live_blob() { if [ -f "$LIVE_DIR/$1" ]; then git hash-object --no-filters -- "$LIVE_DIR/$1"; else echo absent; fi; }
files() { repo diff --name-only "$FROM" "$TO" -- backend; }
the_patch() { repo diff --binary "$FROM" "$TO" -- backend; }
patch_id() { the_patch | sha256sum | cut -c1-12; }
health_ok() { curl -fsS --max-time 5 "$API/health" >/dev/null 2>&1; }
wait_health() { for _ in $(seq 1 "${VIDEO_RELEASE_WAIT:-60}"); do health_ok && return 0; sleep 1; done; return 1; }
serves_media() { curl -fsS --max-time 5 "$API/openapi.json" 2>/dev/null | grep -q '/v0.3/media/jobs/'; }
env_file() { local wd; wd=$(systemctl show -p WorkingDirectory --value lumen-api 2>/dev/null || true)
  [ -n "$wd" ] && echo "$wd/.env" || echo "$LIVE_DIR/backend/.env"; }

state() {  # before | applied | mixed
  local p l f=0 t=0 n=0
  while read -r p; do
    n=$((n + 1)); l=$(live_blob "$p")
    [ "$l" = "$(blob_of "$FROM" "$p")" ] && f=$((f + 1)); [ "$l" = "$(blob_of "$TO" "$p")" ] && t=$((t + 1))
  done < <(files)
  if [ "$f" = "$n" ]; then echo before; elif [ "$t" = "$n" ]; then echo applied; else echo mixed; fi
}

test_copy() {  # $1 = record dir: the patch on a throwaway copy of the live backend, then its tests
  local copy p; copy=$(mktemp -d)
  tar -C "$LIVE_DIR" --exclude=backend/.venv --exclude=.env --exclude='*.env' --exclude=__pycache__ \
    --exclude=.pytest_cache -cf - backend | tar -C "$copy" -xf -
  repo archive "$TO" scripts | tar -C "$copy" -xf -
  git -C "$copy" apply - < "$1/patch" || { rm -rf "$copy"; return 1; }
  while read -r p; do
    [ "$(git hash-object --no-filters -- "$copy/$p")" = "$(blob_of "$TO" "$p")" ] || { rm -rf "$copy"; return 1; }
  done < <(files)
  local run=(-m pytest -q -p no:cacheprovider tests/test_media_generation.py tests/test_privacy_mode.py
             tests/test_media_worker.py tests/test_sdxl_image_workflow.py)
  "$PYTHON" -c 'import pytest' 2>/dev/null || run=(-c 'import sys, unittest, lumen.main, lumen.media_worker
r = unittest.TextTestRunner(verbosity=1).run(unittest.defaultTestLoader.loadTestsFromNames(
    ["tests.test_media_generation", "tests.test_privacy_mode", "tests.test_media_worker",
     "tests.test_sdxl_image_workflow"]))
print(f"{r.testsRun} passed (unittest; app and worker import)" if r.wasSuccessful() else "unittest FAILED")
sys.exit(0 if r.wasSuccessful() else 1)')
  if (cd "$copy/backend" && env -i PATH="$PATH" HOME="$HOME" LANG=C.UTF-8 PYTHONPATH="$copy/backend" \
      SUPABASE_URL=http://127.0.0.1:9 SUPABASE_SERVICE_ROLE_KEY=fictional "$PYTHON" -B "${run[@]}" \
      > "$1/tests.log" 2>&1); then rm -rf "$copy"; return 0; fi
  rm -rf "$copy"; return 1
}

check() {
  echo "== Video routing hotfix: read-only check =="
  [ -z "$(repo status --porcelain)" ] && pass "this clone is clean" || bad "this clone has local changes"
  repo cat-file -e "$TO^{commit}" 2>/dev/null && repo merge-base --is-ancestor "$FROM" "$TO" \
    && pass "reviewed commit ${TO:0:12} is on top of the live video backend ${FROM:0:12}" || bad "pinned commits not found"
  [ -d "$LIVE_DIR/.git" ] && pass "live checkout: $LIVE_DIR" || { bad "no live checkout at $LIVE_DIR"; return; }
  info "live HEAD $(git -C "$LIVE_DIR" rev-parse --short=12 HEAD) (never moved by this script)"
  [ -f "$STATE_DIR/backend" ] && pass "video backend stage is recorded ($(cat "$STATE_DIR/backend"))" \
    || bad "no video backend stage recorded in $STATE_DIR"
  local st; st=$(state)
  case "$st" in
    before) pass "all $(files | wc -l) target files equal the live video backend ${FROM:0:12}, byte for byte" ;;
    applied) info "the hotfix backend is already applied" ;;
    *) bad "live target files differ from both ${FROM:0:12} and ${TO:0:12} (never overwritten):"
       local p; while read -r p; do info "  $p live $(live_blob "$p" | cut -c1-12) expected $(blob_of "$FROM" "$p" | cut -c1-12)"; done < <(files) ;;
  esac
  health_ok && pass "lumen-api is healthy" || bad "lumen-api /health does not answer"
  local record; record=$(mktemp -d); the_patch > "$record/patch"
  if [ "$st" = before ] && test_copy "$record"; then
    pass "backend tests on a patched copy of the live backend: $(tail -1 "$record/tests.log")"
  elif [ "$st" = before ]; then bad "backend tests on the patched copy failed (log: $record/tests.log)"; fi
  local head; head=$(git -C "$LIVE_DIR" rev-parse HEAD)
  if [ "$head" = "$WEB_TO" ]; then info "web: hotfix ${WEB_TO:0:12} is live"
  elif [ "$head" = "$WEB_FROM" ]; then info "web: ${WEB_FROM:0:12} live; the web part goes through animated-web-update.sh (below)"
  else bad "web: live HEAD is neither ${WEB_FROM:0:12} nor ${WEB_TO:0:12}"; fi
  echo "Patch id: $(patch_id)  ($(files | wc -l) files: $(files | tr '\n' ' '))"
  [ "$problems" = 0 ] && echo "READY. Backend: VIDEO_HOTFIX_CONFIRM=hotfix:$(patch_id) $0 apply" \
    || echo "NOT READY: $problems problem(s)."
}

restore_files() {
  local record="$1" sum p
  while read -r sum p; do
    cp -p "$record/files/$p" "$LIVE_DIR/$p"
    [ "$(sha256sum < "$LIVE_DIR/$p" | cut -c1-64)" = "$sum" ] || die "restore of $p did not verify"
  done < "$record/before"
}

apply() {
  local id; id=$(patch_id)
  [ "${VIDEO_HOTFIX_CONFIRM:-}" = "hotfix:$id" ] || die "Owner confirmation missing. After 'check', run: VIDEO_HOTFIX_CONFIRM=hotfix:$id $0 apply"
  [ ! -f "$STATE_DIR/hotfix" ] || die "Already applied ($(cat "$STATE_DIR/hotfix")). Use status or rollback."
  [ "$(state)" = before ] || die "Live target files are not the video backend byte for byte. Nothing was changed."
  check > /dev/null || true; [ "$problems" = 0 ] || die "check reports $problems problem(s). Nothing was changed."
  local record p head envsum ef; record="$STATE_DIR/hotfix-$(date +%Y%m%d-%H%M%S)"; mkdir -p "$record/files"; chmod 700 "$STATE_DIR" "$record"
  head=$(git -C "$LIVE_DIR" rev-parse HEAD); ef=$(env_file); envsum=$(sha256sum < "$ef" | cut -c1-64); the_patch > "$record/patch"
  while read -r p; do
    mkdir -p "$record/files/$(dirname "$p")"; cp -p "$LIVE_DIR/$p" "$record/files/$p"
    echo "$(sha256sum < "$LIVE_DIR/$p" | cut -c1-64) $p" >> "$record/before"
  done < <(files)
  echo "Backup: $record"; echo "$record" > "$STATE_DIR/hotfix"
  trap 'echo "Hotfix failed; restoring the backup." >&2; trap - ERR; restore_files "$record"; sudo systemctl restart lumen-api; wait_health || true; rm -f "$STATE_DIR/hotfix"; exit 1' ERR
  git -C "$LIVE_DIR" apply - < "$record/patch"
  while read -r p; do [ "$(live_blob "$p")" = "$(blob_of "$TO" "$p")" ]; done < <(files)
  [ "$(git -C "$LIVE_DIR" rev-parse HEAD)" = "$head" ]
  [ "$(sha256sum < "$ef" | cut -c1-64)" = "$envsum" ]
  sudo systemctl restart lumen-api
  wait_health
  serves_media
  trap - ERR
  echo "Applied: video requests can no longer become stills on the server; lumen-api restarted and healthy."
  echo "The worker, .env and HEAD are unchanged. Web part next: see docs/video-release.md (Hotfix)."
  echo "Way back: VIDEO_HOTFIX_CONFIRM=hotfix-rollback $0 rollback"
}

rollback() {
  [ "${VIDEO_HOTFIX_CONFIRM:-}" = hotfix-rollback ] || die "Run: VIDEO_HOTFIX_CONFIRM=hotfix-rollback $0 rollback"
  [ -f "$STATE_DIR/hotfix" ] || die "Nothing recorded to roll back."
  [ ! -f "$STATE_DIR/length" ] || die "The 120-second backend is applied. First: VIDEO_LENGTH_CONFIRM=backend-rollback scripts/video-length-release.sh rollback"
  restore_files "$(cat "$STATE_DIR/hotfix")"
  sudo systemctl restart lumen-api
  wait_health || die "lumen-api is not healthy after the restore. Backup: $(cat "$STATE_DIR/hotfix")"
  rm -f "$STATE_DIR/hotfix"
  echo "Restored: the 3 files are exactly the video backend ${FROM:0:12} again; lumen-api restarted and healthy."
}

status() {
  info "hotfix backend: $(state) $( [ -f "$STATE_DIR/hotfix" ] && echo "(recorded $(cat "$STATE_DIR/hotfix"))")"
  info "live HEAD $(git -C "$LIVE_DIR" rev-parse --short=12 HEAD 2>/dev/null || echo unknown)"
  health_ok && pass "lumen-api is healthy" || bad "lumen-api /health does not answer"
}

case "$MODE" in
  check) check; [ "$problems" = 0 ] ;;
  apply) apply ;;
  rollback) rollback ;;
  status) status ;;
  *) die "usage: $0 check|apply|rollback|status" ;;
esac

#!/usr/bin/env bash
# BigLust SDXL v1.6 still images (PR #51, images only): the owner-gated backend step.
# Video stays off, no migration, no frontend, no runtime.py. Every mode is separate:
#   scripts/biglust-images-release.sh check        read-only: live files, settings, tests on a patched copy
#   BIGLUST_RELEASE_CONFIRM=images:<12 of the patch's sha256> scripts/biglust-images-release.sh apply
#   BIGLUST_RELEASE_CONFIRM=images-rollback scripts/biglust-images-release.sh rollback
#   scripts/biglust-images-release.sh status
# `apply` backs up every file it will touch and the lumen-api .env byte for byte (with sha256), tests the
# patch on a throwaway copy of the live backend first (through check), applies the reviewed patch to the working files
# only (no index, no HEAD), sets COMFYUI_WORKFLOW and COMFYUI_CHECKPOINT in that .env (no other line
# changes), restarts lumen-api only and checks health. Any failure restores the backup automatically.
#
# Run from a clean clone of release/biglust-images-20261116, as the user lumen-api runs as. sudo is used
# only to restart lumen-api. Settings: LIVE_DIR (default /home/brett/lumen-push), LUMEN_API_URL (default
# http://127.0.0.1:8001), BIGLUST_RELEASE_PYTHON (default $LIVE_DIR/backend/.venv/bin/python).
# Never touched: the database, RMC and its gateway, systemd units and drop-ins, lumen-web, the Android app,
# runtime.py, privacy_mode.py, the frontend, Heavy and ComfyUI. COMFYUI_URL is never read out or changed.
set -Eeuo pipefail
export LC_ALL=C
MODE="${1:-}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIVE_DIR="${LIVE_DIR:-/home/brett/lumen-push}"
API="${LUMEN_API_URL:-http://127.0.0.1:8001}"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/lumen-biglust-release"
PYTHON="${BIGLUST_RELEASE_PYTHON:-$LIVE_DIR/backend/.venv/bin/python}"
# Pinned and reviewed: the live S22 release, and the images-only change on top of it.
BASE="${BIGLUST_RELEASE_BASE:-7f63d520f56133f09dc7e2bdd2b92c31d0e484b7}"
CODE="${BIGLUST_RELEASE_CODE:-27fa0bcc1a5101f283b6e53afa8116e1f35473d6}"
CHECKPOINT=bigLust_v16.safetensors
WORKFLOW_REL=backend/workflows/biglust-sdxl-v16-api.json
problems=0
pass() { printf 'PASS  %s\n' "$1"; }
bad()  { printf 'FAIL  %s\n' "$1"; problems=$((problems + 1)); }
info() { printf 'INFO  %s\n' "$1"; }
die()  { printf 'STOP  %s\n' "$1" >&2; exit 1; }
[ "$(id -u)" != 0 ] || die "Run as the Lumen service user, not root."

repo() { git -C "$REPO" "$@"; }
blob_of() { repo rev-parse -q --verify "$1:$2" 2>/dev/null || echo absent; }
live_blob() { if [ -f "$LIVE_DIR/$1" ]; then git hash-object --no-filters -- "$LIVE_DIR/$1"; else echo absent; fi; }
files() { repo diff --name-only "$BASE" "$CODE" -- backend; }
the_patch() { repo diff --binary "$BASE" "$CODE" -- backend; }
patch_id() { the_patch | sha256sum | cut -c1-12; }
health_ok() { curl -fsS --max-time 5 "$API/health" >/dev/null 2>&1; }
wait_health() { for _ in $(seq 1 "${BIGLUST_RELEASE_WAIT:-60}"); do health_ok && return 0; sleep 1; done; return 1; }
serves_privacy() { curl -fsS --max-time 5 "$API/openapi.json" 2>/dev/null | grep -q '"privacy_mode"'; }
workdir() { systemctl show -p WorkingDirectory --value lumen-api 2>/dev/null || true; }
env_file() { local wd; wd=$(workdir); [ -n "$wd" ] && echo "$wd/.env" || echo "$LIVE_DIR/backend/.env"; }
# Names only, never values: COMFYUI_* set by systemd would override the .env and need a different decision.
systemd_comfy_names() {
  { systemctl show -p Environment --value lumen-api 2>/dev/null | tr ' ' '\n'
    systemctl show -p EnvironmentFiles --value lumen-api 2>/dev/null | tr ' ' '\n' | sed -n 's/^\(\/[^ (]*\).*/\1/p' |
      while read -r f; do [ -r "$f" ] && cat "$f"; done; } | grep -oE '^(export )?COMFYUI_(WORKFLOW|CHECKPOINT)=' | sort -u || true
}
state() {  # base | applied | mixed
  local p l s=0 a=0 n=0
  while read -r p; do
    n=$((n + 1)); l=$(live_blob "$p")
    [ "$l" = "$(blob_of "$BASE" "$p")" ] && s=$((s + 1)); [ "$l" = "$(blob_of "$CODE" "$p")" ] && a=$((a + 1))
  done < <(files)
  if [ "$s" = "$n" ]; then echo base; elif [ "$a" = "$n" ]; then echo applied; else echo mixed; fi
}
# The .env with exactly two keys set; every other line kept as it is.
env_with_keys() {  # $1 = source file, $2 = workflow path
  awk -v wf="$2" -v ck="$CHECKPOINT" '
    /^(export )?COMFYUI_WORKFLOW=/ { print "COMFYUI_WORKFLOW=" wf; w=1; next }
    /^(export )?COMFYUI_CHECKPOINT=/ { print "COMFYUI_CHECKPOINT=" ck; c=1; next }
    { print }
    END { if (!w) print "COMFYUI_WORKFLOW=" wf; if (!c) print "COMFYUI_CHECKPOINT=" ck }' "$1"
}
effective() {  # what lumen-api would load: checkpoint and workflow file name only (COMFYUI_URL is never printed)
  (cd "$(dirname "$(env_file)")" && SUPABASE_URL="${SUPABASE_URL:-http://127.0.0.1:9}" \
    SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-unused}" PYTHONPATH="$LIVE_DIR/backend" "$PYTHON" -B -c '
from pathlib import Path
from lumen.config import get_settings
s = get_settings()
print(getattr(s, "comfyui_checkpoint", "(no setting)"), Path(s.comfyui_workflow).name if s.comfyui_workflow else "(unset)",
      "url-set" if s.comfyui_url else "url-unset", "video-on" if getattr(s, "video_generation_enabled", False) else "video-off")')
}

test_copy() {  # $1 = record dir; tests the patch on a throwaway copy of the live backend
  local copy; copy=$(mktemp -d)
  tar -C "$LIVE_DIR" --exclude=backend/.venv --exclude=.env --exclude='*.env' --exclude=__pycache__ \
    --exclude=.pytest_cache -cf - backend $( [ -d "$LIVE_DIR/scripts" ] && echo scripts ) | tar -C "$copy" -xf -
  mkdir -p "$copy/scripts"
  for s in canary-comfyui-image.py check-comfyui-image-workflow.py; do repo show "$CODE:scripts/$s" > "$copy/scripts/$s"; done
  git -C "$copy" apply - < "$1/patch" || { rm -rf "$copy"; return 1; }
  local p; while read -r p; do
    [ "$(git hash-object --no-filters -- "$copy/$p")" = "$(blob_of "$CODE" "$p")" ] || { rm -rf "$copy"; return 1; }
  done < <(files)
  # Full suite when the live venv has pytest; otherwise (production venvs usually don't) the new tests
  # with stdlib unittest plus an import of the whole app. Nothing is installed either way.
  local run=(-m pytest -q -p no:cacheprovider)
  "$PYTHON" -c 'import pytest' 2>/dev/null || run=(-c 'import sys, unittest, lumen.main
r = unittest.TextTestRunner(verbosity=1).run(unittest.defaultTestLoader.loadTestsFromNames(
    ["tests.test_media_safety", "tests.test_sdxl_image_workflow"]))
print(f"{r.testsRun} passed (unittest; app imports)" if r.wasSuccessful() else "unittest FAILED")
sys.exit(0 if r.wasSuccessful() else 1)')
  if (cd "$copy/backend" && env -i PATH="$PATH" HOME="$HOME" LANG=C.UTF-8 PYTHONPATH="$copy/backend" \
      SUPABASE_URL=http://127.0.0.1:9 SUPABASE_SERVICE_ROLE_KEY=fictional "$PYTHON" -B "${run[@]}" \
      > "$1/tests.log" 2>&1); then rm -rf "$copy"; return 0; fi
  rm -rf "$copy"; return 1
}

check() {
  echo "== BigLust images-only backend step: read-only check =="
  [ -z "$(repo status --porcelain)" ] && pass "this clone is clean" || bad "this clone has local changes"
  repo cat-file -e "$CODE^{commit}" 2>/dev/null && repo merge-base --is-ancestor "$BASE" "$CODE" \
    && pass "reviewed commit ${CODE:0:12} is on top of the live S22 release ${BASE:0:12}" || bad "pinned commits not found"
  [ -d "$LIVE_DIR/.git" ] && pass "live checkout: $LIVE_DIR" || { bad "no live checkout at $LIVE_DIR"; return; }
  info "live HEAD $(git -C "$LIVE_DIR" rev-parse --short=12 HEAD) (expected the S22 release ${BASE:0:12}; HEAD is never moved)"
  local st; st=$(state)
  case "$st" in
    base) pass "all $(files | wc -l) target files equal the live S22 release, byte for byte" ;;
    applied) info "the images-only change is already applied" ;;
    *) bad "live target files differ from both the release and the change (never overwritten):"
       local p; while read -r p; do info "  $p live $(live_blob "$p" | cut -c1-12) base $(blob_of "$BASE" "$p" | cut -c1-12)"; done < <(files) ;;
  esac
  local ef; ef=$(env_file)
  [ -f "$ef" ] && pass "lumen-api .env: $ef" || bad "lumen-api .env not found at $ef"
  [ -f "$ef" ] && { grep -qE '^(export )?COMFYUI_URL=.' "$ef" && pass "COMFYUI_URL is set (value not shown; it stays as it is)" || bad "COMFYUI_URL is not set in $ef"; }
  [ -z "$(systemd_comfy_names)" ] && pass "systemd does not set COMFYUI_WORKFLOW/COMFYUI_CHECKPOINT" \
    || bad "systemd sets $(systemd_comfy_names | tr '\n' ' ')- that would override the .env; needs a separate decision"
  health_ok && pass "lumen-api is healthy" || bad "lumen-api /health does not answer"
  serves_privacy && pass "lumen-api serves Public/Private mode" || bad "lumen-api does not report privacy_mode"
  info "effective now: $(effective 2>/dev/null || echo unreadable)"
  local record; record=$(mktemp -d); the_patch > "$record/patch"
  if [ "$st" = base ] && test_copy "$record"; then
    pass "backend tests on a patched copy of the live backend: $(tail -1 "$record/tests.log")"
  elif [ "$st" = base ]; then bad "backend tests on the patched copy failed (log: $record/tests.log)"; fi
  echo "Patch id: $(patch_id)  ($(files | wc -l) files)"
  [ "$problems" = 0 ] && echo "READY. To apply: BIGLUST_RELEASE_CONFIRM=images:$(patch_id) $0 apply" || echo "NOT READY: $problems problem(s)."
}

restore() {  # $1 = record; everything back exactly, lumen-api restarted
  local record="$1" sum p
  while read -r sum p; do
    if [ "$sum" = absent ]; then rm -f "$LIVE_DIR/$p"
    else cp -p "$record/files/$p" "$LIVE_DIR/$p"; [ "$(sha256sum < "$LIVE_DIR/$p" | cut -c1-64)" = "$sum" ] || die "restore of $p did not verify"; fi
  done < "$record/before"
  if [ -f "$record/env" ]; then
    cat "$record/env" > "$(cat "$record/env-path")"
    [ "$(sha256sum < "$(cat "$record/env-path")" | cut -c1-64)" = "$(cat "$record/env-sha256")" ] || die "restore of .env did not verify"
  fi
  rmdir "$LIVE_DIR/backend/workflows" 2>/dev/null || true
  sudo systemctl restart lumen-api
  wait_health || die "lumen-api is not healthy after the restore. Backup: $record"
  rm -f "$STATE_DIR/current"
  echo "Restored: backend files and .env are exactly as before, lumen-api restarted and healthy."
}

apply() {
  local id; id=$(patch_id)
  [ "${BIGLUST_RELEASE_CONFIRM:-}" = "images:$id" ] || die "Owner confirmation missing. After reviewing 'check', run: BIGLUST_RELEASE_CONFIRM=images:$id $0 apply"
  [ ! -f "$STATE_DIR/current" ] || die "Already applied ($(cat "$STATE_DIR/current")). Use status or rollback."
  [ "$(state)" = base ] || die "Live target files are not the S22 release byte for byte. Nothing was changed."
  check > /dev/null || true; [ "$problems" = 0 ] || die "check reports $problems problem(s). Nothing was changed. Run: $0 check"
  local record ef p head; record="$STATE_DIR/$(date +%Y%m%d-%H%M%S)"; mkdir -p "$record/files"; chmod 700 "$STATE_DIR" "$record"
  ef=$(env_file); head=$(git -C "$LIVE_DIR" rev-parse HEAD)
  the_patch > "$record/patch"
  while read -r p; do
    if [ -f "$LIVE_DIR/$p" ]; then mkdir -p "$record/files/$(dirname "$p")"; cp -p "$LIVE_DIR/$p" "$record/files/$p"
      echo "$(sha256sum < "$LIVE_DIR/$p" | cut -c1-64) $p" >> "$record/before"
    else echo "absent $p" >> "$record/before"; fi
  done < <(files)
  cp -p "$ef" "$record/env"; echo "$ef" > "$record/env-path"; sha256sum < "$ef" | cut -c1-64 > "$record/env-sha256"
  echo "Backup: $record"
  echo "$record" > "$STATE_DIR/current"
  trap 'echo "Apply failed; restoring the backup." >&2; trap - ERR; restore "$record"; exit 1' ERR
  git -C "$LIVE_DIR" apply - < "$record/patch"
  while read -r p; do [ "$(live_blob "$p")" = "$(blob_of "$CODE" "$p")" ]; done < <(files)
  [ "$(git -C "$LIVE_DIR" rev-parse HEAD)" = "$head" ]
  env_with_keys "$ef" "$LIVE_DIR/$WORKFLOW_REL" > "$record/env.new"
  # Only the two keys may differ.
  [ -z "$(diff <(grep -vE '^(export )?COMFYUI_(WORKFLOW|CHECKPOINT)=' "$ef") <(grep -vE '^(export )?COMFYUI_(WORKFLOW|CHECKPOINT)=' "$record/env.new"))" ]
  cat "$record/env.new" > "$ef"; rm -f "$record/env.new"
  [[ "$(effective)" == "$CHECKPOINT biglust-sdxl-v16-api.json url-set video-off" ]]
  sudo systemctl restart lumen-api
  wait_health
  serves_privacy
  trap - ERR
  echo "Applied: images-only change live, COMFYUI_WORKFLOW=BigLust SDXL, COMFYUI_CHECKPOINT=$CHECKPOINT, video off."
  echo "Next (owner): Private Chat image canary on desktop and S22; Gallery check. Way back: BIGLUST_RELEASE_CONFIRM=images-rollback $0 rollback"
}

rollback() {
  [ "${BIGLUST_RELEASE_CONFIRM:-}" = images-rollback ] || die "Run: BIGLUST_RELEASE_CONFIRM=images-rollback $0 rollback"
  [ -f "$STATE_DIR/current" ] || die "Nothing recorded to roll back."
  restore "$(cat "$STATE_DIR/current")"
}

status() {
  echo "state: $(state)"; [ -f "$STATE_DIR/current" ] && echo "recorded: $(cat "$STATE_DIR/current")" || echo "recorded: none"
  echo "effective: $(effective 2>/dev/null || echo unreadable)"; health_ok && echo "health: ok" || echo "health: FAIL"
}

case "$MODE" in
  check) check; [ "$problems" = 0 ] ;;
  apply) apply ;;
  rollback) rollback ;;
  status) status ;;
  *) die "usage: $0 check|apply|rollback|status" ;;
esac

#!/usr/bin/env bash
# Short video (PR #51): the owner-gated release, in separate stages, each with a hard STOP and a way back.
# Built for exactly what is live on Lumen: the S22 release 7f63d52 (HEAD) with the BigLust images-only
# patch applied to the working files (PR #52, scripts/biglust-images-release.sh, code 27fa0bc).
# Nothing here does `git checkout`, `git pull`, rebase or reset in the live checkout: the backend step
# applies one reviewed patch to files that must still equal the images release byte for byte.
#
#   scripts/video-release.sh check                 read-only: every stage's state, nothing changed
#   scripts/video-release.sh route                 read-only: how 127.0.0.1:18188 (ComfyUI) reaches Heavy
#   scripts/video-release.sh migration-check       read-only: table and bucket state; writes the undo SQL
#   scripts/video-release.sh backend-check         read-only: live files, tests on a patched copy
#   VIDEO_RELEASE_CONFIRM=backend:<patch id> scripts/video-release.sh backend
#   VIDEO_RELEASE_CONFIRM=backend-rollback scripts/video-release.sh backend-rollback
#   VIDEO_RELEASE_CONFIRM=worker scripts/video-release.sh worker
#   VIDEO_RELEASE_CONFIRM=worker-rollback scripts/video-release.sh worker-rollback
#   VIDEO_FRAMEPACK_URL=http://127.0.0.1:17863 VIDEO_RELEASE_CONFIRM=enable scripts/video-release.sh enable
#   VIDEO_RELEASE_CONFIRM=enable-rollback scripts/video-release.sh enable-rollback
#   scripts/video-release.sh status
#
# Order (docs/video-release.md): 0 provenance MATCH on Heavy, 1 route, 2 migration, 3 backend (video off),
# 4 worker unit (video off: it exits at once), 5 web app (release/video-frontend-20261116 through the
# unchanged scripts/animated-web-update.sh), 6 enable + live canary. Roll back in reverse order.
# Never run scripts/biglust-images-release.sh rollback while this backend step is applied: it would put
# back pre-images copies of files this step changed. `backend` refuses to run if that has happened.
#
# Run from a clean clone of feat/local-media-generation-20261116, as the user lumen-api runs as. sudo is
# used only to restart lumen-api / the worker and to install or remove the worker's unit file.
# Settings: LIVE_DIR (default /home/brett/lumen-push), LUMEN_API_URL (default http://127.0.0.1:8001),
# VIDEO_RELEASE_PYTHON (default $LIVE_DIR/backend/.venv/bin/python), UNIT_DIR (default /etc/systemd/system).
# Never touched: RMC and its gateway, Heavy, FP-Studio, ComfyUI and its route, SSH or Tailscale settings,
# lumen-web, the Android app. No value from any .env is printed.
set -Eeuo pipefail
export LC_ALL=C
MODE="${1:-}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIVE_DIR="${LIVE_DIR:-/home/brett/lumen-push}"
API="${LUMEN_API_URL:-http://127.0.0.1:8001}"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/lumen-video-release"
PYTHON="${VIDEO_RELEASE_PYTHON:-$LIVE_DIR/backend/.venv/bin/python}"
UNIT_DIR="${UNIT_DIR:-/etc/systemd/system}"
UNIT=lumen-media-worker.service
# Pinned and reviewed.
BASE="${VIDEO_RELEASE_BASE:-7f63d520f56133f09dc7e2bdd2b92c31d0e484b7}"     # live S22 release (HEAD)
IMAGES="${VIDEO_RELEASE_IMAGES:-27fa0bcc1a5101f283b6e53afa8116e1f35473d6}" # images-only code, applied live
CODE="${VIDEO_RELEASE_CODE:-0b370fb92884c82227ceb61202007c8f8f5884a6}"     # this PR's backend
WEB="${VIDEO_RELEASE_WEB:-9ed47374874068c9ccd61f0c61ab0701bfb0b26e}"       # release/video-frontend-20261116
MIGRATION=supabase/migrations/20261116100000_media_generation_jobs.sql
problems=0
pass() { printf 'PASS  %s\n' "$1"; }
bad()  { printf 'FAIL  %s\n' "$1"; problems=$((problems + 1)); }
info() { printf 'INFO  %s\n' "$1"; }
die()  { printf 'STOP  %s\n' "$1" >&2; exit 1; }
[ "$(id -u)" != 0 ] || die "Run as the Lumen service user, not root."

repo() { git -C "$REPO" "$@"; }
blob_of() { repo rev-parse -q --verify "$1:$2" 2>/dev/null || echo absent; }
live_blob() { if [ -f "$LIVE_DIR/$1" ]; then git hash-object --no-filters -- "$LIVE_DIR/$1"; else echo absent; fi; }
files() { repo diff --name-only "$IMAGES" "$CODE" -- backend; }
the_patch() { repo diff --binary "$IMAGES" "$CODE" -- backend; }
patch_id() { the_patch | sha256sum | cut -c1-12; }
health_ok() { curl -fsS --max-time 5 "$API/health" >/dev/null 2>&1; }
wait_health() { for _ in $(seq 1 "${VIDEO_RELEASE_WAIT:-60}"); do health_ok && return 0; sleep 1; done; return 1; }
serves_media() { curl -fsS --max-time 5 "$API/openapi.json" 2>/dev/null | grep -q '/v0.3/media/jobs/'; }
api_show() { systemctl show -p "$1" --value lumen-api 2>/dev/null || true; }
env_file() { local wd; wd=$(api_show WorkingDirectory); [ -n "$wd" ] && echo "$wd/.env" || echo "$LIVE_DIR/backend/.env"; }
unit_installed() { [ -f "$UNIT_DIR/$UNIT" ]; }

state() {  # images | video | mixed: the backend files this step changes
  local p l i=0 v=0 n=0
  while read -r p; do
    n=$((n + 1)); l=$(live_blob "$p")
    [ "$l" = "$(blob_of "$IMAGES" "$p")" ] && i=$((i + 1)); [ "$l" = "$(blob_of "$CODE" "$p")" ] && v=$((v + 1))
  done < <(files)
  if [ "$i" = "$n" ]; then echo images; elif [ "$v" = "$n" ]; then echo video; else echo mixed; fi
}
images_live() {  # the images release's own files still equal its code (not rolled back, not edited)
  local p
  while read -r p; do
    case "$(files | grep -Fx -- "$p" || true)" in "") [ "$(live_blob "$p")" = "$(blob_of "$IMAGES" "$p")" ] || return 1 ;; esac
  done < <(repo diff --name-only "$BASE" "$IMAGES" -- backend)
}
web_live() { git -C "$LIVE_DIR" merge-base --is-ancestor "$WEB" HEAD 2>/dev/null; }
# Inline Environment= names on lumen-api (never values): the worker would not see them.
inline_names() { api_show Environment | tr ' ' '\n' | sed -n 's/^\([A-Z_][A-Z0-9_]*\)=.*/\1/p' | sort -u; }

effective() {  # what lumen-api would load, as words only (no URL or key is printed)
  (cd "$(dirname "$(env_file)")" && PYTHONPATH="$LIVE_DIR/backend" "$PYTHON" -B -c '
from lumen.config import get_settings
s = get_settings()
g = lambda k, d=None: getattr(s, k, d)
print("video-on" if g("video_generation_enabled") else "video-off",
      "framepack-url-set" if g("framepack_url") else "framepack-url-unset",
      "api=" + str(g("framepack_api_name")), "budget=%ss" % g("video_render_budget_seconds", "n/a"),
      "max-clip=%ss" % g("video_max_seconds", "n/a"))')
}
db_state() {  # table present/absent; bucket size limit and video types (read-only, service role, values hidden)
  [ -z "${VIDEO_RELEASE_FAKE_DB:-}" ] || { echo "$VIDEO_RELEASE_FAKE_DB"; return; }  # offline tests only
  (cd "$(dirname "$(env_file)")" && PYTHONPATH="$LIVE_DIR/backend" "$PYTHON" -B -c '
import json, sys, httpx
from lumen.config import get_settings
s = get_settings()
h = {"apikey": s.supabase_service_role_key, "Authorization": "Bearer " + s.supabase_service_role_key}
base = s.supabase_url.rstrip("/")
t = httpx.get(base + "/rest/v1/media_generation_jobs", params={"select": "id", "limit": "1"}, headers=h, timeout=10)
b = httpx.get(base + "/storage/v1/bucket/chat-media", headers=h, timeout=10)
bucket = b.json() if b.status_code == 200 else {}
print(json.dumps({"table": "present" if t.status_code == 200 else "absent (%s)" % t.status_code,
                  "bucket_limit": bucket.get("file_size_limit"), "bucket_types": bucket.get("allowed_mime_types")}))')
}

test_copy() {  # $1 = record dir: the patch on a throwaway copy of the live backend, then its tests
  local copy p; copy=$(mktemp -d)
  tar -C "$LIVE_DIR" --exclude=backend/.venv --exclude=.env --exclude='*.env' --exclude=__pycache__ \
    --exclude=.pytest_cache -cf - backend | tar -C "$copy" -xf -
  git -C "$copy" apply - < "$1/patch" || { rm -rf "$copy"; return 1; }
  while read -r p; do
    [ "$(git hash-object --no-filters -- "$copy/$p" 2>/dev/null || echo absent)" = "$(blob_of "$CODE" "$p")" ] \
      || { rm -rf "$copy"; return 1; }
  done < <(files)
  local run=(-m pytest -q -p no:cacheprovider)
  "$PYTHON" -c 'import pytest' 2>/dev/null || run=(-c 'import sys, unittest, lumen.main, lumen.media_worker
r = unittest.TextTestRunner(verbosity=1).run(unittest.defaultTestLoader.loadTestsFromNames(
    ["tests.test_media_worker", "tests.test_framepack_studio", "tests.test_media_generation",
     "tests.test_sdxl_image_workflow"]))
print(f"{r.testsRun} passed (unittest; app and worker import)" if r.wasSuccessful() else "unittest FAILED")
sys.exit(0 if r.wasSuccessful() else 1)')
  if (cd "$copy/backend" && env -i PATH="$PATH" HOME="$HOME" LANG=C.UTF-8 PYTHONPATH="$copy/backend" \
      SUPABASE_URL=http://127.0.0.1:9 SUPABASE_SERVICE_ROLE_KEY=fictional "$PYTHON" -B "${run[@]}" \
      > "$1/tests.log" 2>&1); then rm -rf "$copy"; return 0; fi
  rm -rf "$copy"; return 1
}

backend_check() {
  echo "== Stage 3, backend (video stays off): read-only check =="
  [ -z "$(repo status --porcelain)" ] && pass "this clone is clean" || bad "this clone has local changes"
  repo cat-file -e "$CODE^{commit}" 2>/dev/null && repo merge-base --is-ancestor "$BASE" "$CODE" \
    && pass "reviewed commit ${CODE:0:12} is on top of the live S22 release" || bad "pinned commits not found"
  [ -d "$LIVE_DIR/.git" ] && pass "live checkout: $LIVE_DIR" || { bad "no live checkout at $LIVE_DIR"; return; }
  info "live HEAD $(git -C "$LIVE_DIR" rev-parse --short=12 HEAD) (never moved by this script)"
  images_live && pass "the BigLust images release is live and unchanged" \
    || bad "the BigLust images release's files are not as released (rolled back or edited); STOP"
  local st; st=$(state)
  case "$st" in
    images) pass "all $(files | wc -l) target files equal the live images release, byte for byte" ;;
    video) info "the video backend is already applied" ;;
    *) bad "live target files differ from both the images release and this step (never overwritten):"
       local p; while read -r p; do
         info "  $p live $(live_blob "$p" | cut -c1-12) images $(blob_of "$IMAGES" "$p" | cut -c1-12)"
       done < <(files) ;;
  esac
  [ -f "$(env_file)" ] && pass "lumen-api .env found (not changed by this stage)" || bad "lumen-api .env not found"
  [[ "$(effective 2>/dev/null)" == video-off* ]] && pass "video is off in lumen-api's settings" \
    || bad "video is not off in lumen-api's settings: $(effective 2>/dev/null || echo unreadable)"
  health_ok && pass "lumen-api is healthy" || bad "lumen-api /health does not answer"
  local record; record=$(mktemp -d); the_patch > "$record/patch"
  if [ "$st" = images ] && test_copy "$record"; then
    pass "backend tests on a patched copy of the live backend: $(tail -1 "$record/tests.log")"
  elif [ "$st" = images ]; then bad "backend tests on the patched copy failed (log: $record/tests.log)"; fi
  echo "Patch id: $(patch_id)  ($(files | wc -l) files)"
  [ "$problems" = 0 ] && echo "READY. To apply: VIDEO_RELEASE_CONFIRM=backend:$(patch_id) $0 backend" \
    || echo "NOT READY: $problems problem(s)."
}

restore_files() {  # $1 = record
  local record="$1" sum p
  while read -r sum p; do
    if [ "$sum" = absent ]; then rm -f "$LIVE_DIR/$p"
    else mkdir -p "$(dirname "$LIVE_DIR/$p")"; cp -p "$record/files/$p" "$LIVE_DIR/$p"
      [ "$(sha256sum < "$LIVE_DIR/$p" | cut -c1-64)" = "$sum" ] || die "restore of $p did not verify"; fi
  done < "$record/before"
}

backend() {
  local id; id=$(patch_id)
  [ "${VIDEO_RELEASE_CONFIRM:-}" = "backend:$id" ] || die "Owner confirmation missing. After 'backend-check', run: VIDEO_RELEASE_CONFIRM=backend:$id $0 backend"
  [ ! -f "$STATE_DIR/backend" ] || die "Already applied ($(cat "$STATE_DIR/backend")). Use status or backend-rollback."
  [ "$(state)" = images ] || die "Live target files are not the images release byte for byte. Nothing was changed."
  backend_check > /dev/null || true; [ "$problems" = 0 ] || die "backend-check reports $problems problem(s). Nothing was changed."
  local record p head; record="$STATE_DIR/backend-$(date +%Y%m%d-%H%M%S)"; mkdir -p "$record/files"; chmod 700 "$STATE_DIR" "$record"
  head=$(git -C "$LIVE_DIR" rev-parse HEAD); the_patch > "$record/patch"
  while read -r p; do
    if [ -f "$LIVE_DIR/$p" ]; then mkdir -p "$record/files/$(dirname "$p")"; cp -p "$LIVE_DIR/$p" "$record/files/$p"
      echo "$(sha256sum < "$LIVE_DIR/$p" | cut -c1-64) $p" >> "$record/before"
    else echo "absent $p" >> "$record/before"; fi
  done < <(files)
  echo "Backup: $record"; echo "$record" > "$STATE_DIR/backend"
  trap 'echo "Backend step failed; restoring the backup." >&2; trap - ERR; restore_files "$record"; sudo systemctl restart lumen-api; wait_health || true; rm -f "$STATE_DIR/backend"; exit 1' ERR
  git -C "$LIVE_DIR" apply - < "$record/patch"
  while read -r p; do [ "$(live_blob "$p")" = "$(blob_of "$CODE" "$p")" ]; done < <(files)
  [ "$(git -C "$LIVE_DIR" rev-parse HEAD)" = "$head" ]
  [[ "$(effective)" == video-off* ]]
  sudo systemctl restart lumen-api
  wait_health
  serves_media
  trap - ERR
  echo "Applied: video backend live with video OFF (no .env change). BigLust images unchanged."
  echo "Way back: VIDEO_RELEASE_CONFIRM=backend-rollback $0 backend-rollback"
}

backend_rollback() {
  [ "${VIDEO_RELEASE_CONFIRM:-}" = backend-rollback ] || die "Run: VIDEO_RELEASE_CONFIRM=backend-rollback $0 backend-rollback"
  [ -f "$STATE_DIR/backend" ] || die "Nothing recorded to roll back."
  [ ! -f "$STATE_DIR/enable" ] || die "Video is enabled. First: VIDEO_RELEASE_CONFIRM=enable-rollback $0 enable-rollback"
  ! unit_installed || die "The worker unit is installed. First: VIDEO_RELEASE_CONFIRM=worker-rollback $0 worker-rollback"
  restore_files "$(cat "$STATE_DIR/backend")"
  sudo systemctl restart lumen-api
  wait_health || die "lumen-api is not healthy after the restore. Backup: $(cat "$STATE_DIR/backend")"
  rm -f "$STATE_DIR/backend"
  echo "Restored: backend files are exactly the images release again; lumen-api restarted and healthy."
}

unit_text() {
  local user wd files
  user=$(api_show User); wd=$(api_show WorkingDirectory)
  files=$(api_show EnvironmentFiles | tr ' ' '\n' | sed -n 's/^\(-\{0,1\}\/[^ (]*\).*/\1/p')
  cat <<EOF
# Lumen video worker: follows FramePack-Studio jobs (PR #51). Installed by scripts/video-release.sh worker.
# Same user, directory and environment files as lumen-api. With VIDEO_GENERATION_ENABLED=false it exits at once.
[Unit]
Description=Lumen video worker (follows FramePack-Studio jobs)
After=network-online.target lumen-api.service
Wants=network-online.target

[Service]
User=$user
WorkingDirectory=$wd
$(while read -r f; do [ -n "$f" ] && echo "EnvironmentFile=$f"; done <<< "$files")
ExecStart=$PYTHON -m lumen.media_worker
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
}

worker() {
  [ "${VIDEO_RELEASE_CONFIRM:-}" = worker ] || die "Run: VIDEO_RELEASE_CONFIRM=worker $0 worker"
  [ "$(state)" = video ] || die "The video backend is not applied. Stage 3 first."
  ! unit_installed || die "$UNIT_DIR/$UNIT already exists. Use status, or worker-rollback."
  [ "$(api_show User)" = "$(id -un)" ] || die "lumen-api runs as '$(api_show User)', not $(id -un). Run as that user."
  [ -n "$(api_show WorkingDirectory)" ] || die "lumen-api has no WorkingDirectory; the worker would not find the same .env."
  local leaked; leaked=$(inline_names | grep -E '^(SUPABASE_|VIDEO_|FRAMEPACK_|COMFYUI_)' || true)
  [ -z "$leaked" ] || die "lumen-api sets $(echo "$leaked" | tr '\n' ' ')inline (Environment=); the worker would not see them. Move them to its .env or EnvironmentFile first."
  [ -x "$PYTHON" ] || die "no Python at $PYTHON"
  unit_text | sudo tee "$UNIT_DIR/$UNIT" > /dev/null
  echo installed > "$STATE_DIR/worker" 2>/dev/null || { mkdir -p "$STATE_DIR"; echo installed > "$STATE_DIR/worker"; }
  sudo systemctl daemon-reload
  sudo systemctl enable "$UNIT"
  sudo systemctl start "$UNIT" || true
  sleep 2
  local result; result=$(systemctl show -p Result --value "$UNIT" 2>/dev/null || true)
  [ "$result" = success ] || { echo "Worker did not exit cleanly ($result); removing it." >&2
    VIDEO_RELEASE_CONFIRM=worker-rollback worker_rollback; exit 1; }
  echo "Installed and enabled $UNIT. With video off it logged 'nothing to do' and exited (journalctl -u $UNIT)."
  echo "Way back: VIDEO_RELEASE_CONFIRM=worker-rollback $0 worker-rollback"
}

worker_rollback() {
  [ "${VIDEO_RELEASE_CONFIRM:-}" = worker-rollback ] || die "Run: VIDEO_RELEASE_CONFIRM=worker-rollback $0 worker-rollback"
  [ ! -f "$STATE_DIR/enable" ] || die "Video is enabled. First: VIDEO_RELEASE_CONFIRM=enable-rollback $0 enable-rollback"
  sudo systemctl disable --now "$UNIT" 2>/dev/null || true
  sudo rm -f "$UNIT_DIR/$UNIT"
  sudo systemctl daemon-reload
  rm -f "$STATE_DIR/worker"
  echo "Removed $UNIT. Jobs in the database are kept; nothing on Heavy was touched."
}

loopback_url() { [[ "$1" =~ ^http://127\.0\.0\.1:[0-9]{2,5}/?$ ]]; }

enable() {
  [ "${VIDEO_RELEASE_CONFIRM:-}" = enable ] || die "Run: VIDEO_FRAMEPACK_URL=http://127.0.0.1:17863 VIDEO_RELEASE_CONFIRM=enable $0 enable"
  local url="${VIDEO_FRAMEPACK_URL:-}"
  loopback_url "$url" || die "VIDEO_FRAMEPACK_URL must be a loopback URL like http://127.0.0.1:17863 (the private route)."
  [ ! -f "$STATE_DIR/enable" ] || die "Already enabled. Use status or enable-rollback."
  [ "$(state)" = video ] || die "Stage 3 (backend) is not applied."
  unit_installed || die "Stage 4 (worker unit) is not installed."
  web_live || die "Stage 5 (web app with the Gallery Public lock, ${WEB:0:12}) is not live."
  case "$(db_state 2>/dev/null)" in *'"table": "present"'*'video/mp4'*) ;; *) die "Stage 2 (migration) is not applied." ;; esac
  ${VIDEO_RELEASE_FP_CHECK:-"$PYTHON" "$REPO/scripts/check-framepack-endpoint.py"} --url "$url" --api-name /handle_start_button > /dev/null 2>&1 \
    || die "FP-Studio's contract check failed through $url (route down, or FP-Studio changed). Nothing was changed."
  local ef record; ef=$(env_file); record="$STATE_DIR/enable-$(date +%Y%m%d-%H%M%S)"; mkdir -p "$record"; chmod 700 "$STATE_DIR" "$record"
  cp -p "$ef" "$record/env"; echo "$ef" > "$record/env-path"; sha256sum < "$ef" | cut -c1-64 > "$record/env-sha256"
  awk -v u="$url" '
    /^(export )?VIDEO_GENERATION_ENABLED=/ { print "VIDEO_GENERATION_ENABLED=true"; a=1; next }
    /^(export )?FRAMEPACK_URL=/ { print "FRAMEPACK_URL=" u; b=1; next }
    /^(export )?FRAMEPACK_API_NAME=/ { print "FRAMEPACK_API_NAME=/handle_start_button"; c=1; next }
    { print }
    END { if (!a) print "VIDEO_GENERATION_ENABLED=true"; if (!b) print "FRAMEPACK_URL=" u;
          if (!c) print "FRAMEPACK_API_NAME=/handle_start_button" }' "$ef" > "$record/env.new"
  local keys='^(export )?(VIDEO_GENERATION_ENABLED|FRAMEPACK_URL|FRAMEPACK_API_NAME)='
  [ -z "$(diff <(grep -vE "$keys" "$ef") <(grep -vE "$keys" "$record/env.new"))" ] || die "unexpected .env difference; nothing changed"
  echo "$record" > "$STATE_DIR/enable"
  trap 'echo "Enable failed; restoring .env." >&2; trap - ERR; cat "$record/env" > "$ef"; sudo systemctl restart lumen-api; sudo systemctl restart '"$UNIT"' || true; rm -f "$STATE_DIR/enable"; exit 1' ERR
  cat "$record/env.new" > "$ef"; rm -f "$record/env.new"
  [[ "$(effective)" == "video-on framepack-url-set api=/handle_start_button"* ]]
  sudo systemctl restart lumen-api
  wait_health
  sudo systemctl restart "$UNIT"
  sleep 3
  [ "$(systemctl show -p ActiveState --value "$UNIT")" = active ]
  trap - ERR
  echo "Enabled: video on (clips up to the existing 10 s), worker running, render budget $(effective | awk '{print $4}')."
  echo "Next (owner): the live canary in docs/video-release.md. Way back: VIDEO_RELEASE_CONFIRM=enable-rollback $0 enable-rollback"
}

enable_rollback() {
  [ "${VIDEO_RELEASE_CONFIRM:-}" = enable-rollback ] || die "Run: VIDEO_RELEASE_CONFIRM=enable-rollback $0 enable-rollback"
  [ -f "$STATE_DIR/enable" ] || die "Nothing recorded to roll back."
  local record; record=$(cat "$STATE_DIR/enable")
  cat "$record/env" > "$(cat "$record/env-path")"
  [ "$(sha256sum < "$(cat "$record/env-path")" | cut -c1-64)" = "$(cat "$record/env-sha256")" ] || die "restore of .env did not verify"
  sudo systemctl restart lumen-api
  wait_health || die "lumen-api is not healthy after the restore."
  sudo systemctl restart "$UNIT" || true   # with video off again it exits at once
  rm -f "$STATE_DIR/enable"
  echo "Video is off again (.env exactly as before). Unfinished jobs stay in the database; nothing on Heavy was cancelled."
}

route() {
  echo "== Stage 1: how lumen-api reaches Heavy today (read-only) =="
  local line pid unit
  line=$(ss -ltnpH 'sport = :18188' 2>/dev/null | head -1 || true)
  [ -n "$line" ] || { bad "nothing listens on 127.0.0.1:18188 here"; return; }
  info "listener: $(awk '{print $4}' <<< "$line")"
  case "$(awk '{print $4}' <<< "$line")" in 127.0.0.1:*|'[::1]:'*) pass "18188 is bound to loopback only" ;; *) bad "18188 is not loopback-only" ;; esac
  pid=$(grep -oE 'pid=[0-9]+' <<< "$line" | head -1 | cut -d= -f2 || true)
  if [ -n "$pid" ]; then
    info "process: $(ps -o user=,comm= -p "$pid" 2>/dev/null | xargs)"
    unit=$(ps -o unit= -p "$pid" 2>/dev/null | xargs || true)
    info "systemd unit: ${unit:-none (started by hand or by another tool)}"
    [ -n "$unit" ] && [ "$unit" != "-" ] && { info "its definition (systemctl cat $unit):"; systemctl cat "$unit" 2>/dev/null | sed 's/^/        /'; }
    info "its command line (ps): $(ps -o args= -p "$pid" 2>/dev/null)"
  else
    info "the owning process is not visible to this user; rerun as root: sudo ss -ltnp 'sport = :18188'"
  fi
  if ss -ltnH 'sport = :17863' 2>/dev/null | grep -q .; then info "17863 is already in use here"; else pass "17863 is free here"; fi
  echo "Recommendation: give FP-Studio the SAME mechanism as 18188, with one more loopback forward,"
  echo "127.0.0.1:17863 -> Heavy 127.0.0.1:7863 (for an ssh/autossh unit: one more '-L 127.0.0.1:17863:127.0.0.1:7863')."
  echo "Keep both ends on loopback, keep its key and auth as they are (never remove a passphrase or widen"
  echo "AllowTcpForwarding/Tailscale ACLs to do it). This script changes none of it."
}

migration_check() {
  echo "== Stage 2: migration (read-only) =="
  local s; s=$(db_state 2>/dev/null || echo '{}')
  info "now: $s"
  mkdir -p "$STATE_DIR"; chmod 700 "$STATE_DIR"
  if [[ "$s" == *'"table": "absent'* ]] && [ ! -f "$STATE_DIR/migration-undo.sql" ]; then
    python3 - "$s" > "$STATE_DIR/migration-undo.sql" <<'PY'
import json, sys
s = json.loads(sys.argv[1])
types = s.get("bucket_types")
arr = "NULL" if types is None else "ARRAY[" + ", ".join("'%s'" % t.replace("'", "''") for t in types) + "]::text[]"
limit = "NULL" if s.get("bucket_limit") is None else str(int(s["bucket_limit"]))
print("-- Undo of 20261116100000_media_generation_jobs.sql, with chat-media's values recorded before it ran.")
print("DROP TABLE IF EXISTS media_generation_jobs;")
print("UPDATE storage.buckets SET file_size_limit = %s, allowed_mime_types = %s WHERE id = 'chat-media';" % (limit, arr))
PY
    pass "undo SQL with today's bucket values written to $STATE_DIR/migration-undo.sql"
  fi
  [ -f "$STATE_DIR/migration-undo.sql" ] && info "undo SQL: $STATE_DIR/migration-undo.sql"
  echo "Apply (owner): $REPO/$MIGRATION, one transaction, with the same SQL path you use for this Supabase."
  echo "It only creates media_generation_jobs (RLS on, no client policies) and lets chat-media hold MP4/WebM up to 50 MB."
}

check() {
  echo "== Video release: every stage, read-only =="
  echo "Stage 0 (Heavy, read-only): framepack-studio-job-output.py must print MATCH for 0bb4dd05-... first."
  info "backend: $(state) $( [ -f "$STATE_DIR/backend" ] && echo "(recorded $(cat "$STATE_DIR/backend"))")"
  images_live && info "images release: live and unchanged" || info "images release: NOT as released"
  info "database: $(db_state 2>/dev/null || echo unreadable)"
  unit_installed && info "worker unit: installed ($(systemctl show -p ActiveState,Result --value "$UNIT" 2>/dev/null | xargs))" || info "worker unit: not installed"
  web_live && info "web app: ${WEB:0:12} live" || info "web app: video frontend not live (live HEAD $(git -C "$LIVE_DIR" rev-parse --short=12 HEAD 2>/dev/null))"
  info "settings: $(effective 2>/dev/null || echo unreadable)"
  health_ok && pass "lumen-api is healthy" || bad "lumen-api /health does not answer"
}

status() { check; }

case "$MODE" in
  check) check; [ "$problems" = 0 ] ;;
  route) route; [ "$problems" = 0 ] ;;
  migration-check) migration_check ;;
  backend-check) backend_check; [ "$problems" = 0 ] ;;
  backend) backend ;;
  backend-rollback) backend_rollback ;;
  worker) worker ;;
  worker-rollback) worker_rollback ;;
  enable) enable ;;
  enable-rollback) enable_rollback ;;
  status) status ;;
  *) die "usage: $0 check|route|migration-check|backend-check|backend|backend-rollback|worker|worker-rollback|enable|enable-rollback|status" ;;
esac

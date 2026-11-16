#!/usr/bin/env bash
# Clips of up to 120 seconds (PR #51): owner-gated, in separate steps, each with a way back.
# Built for what is live: HEAD at a frontend-only release, the images + video backend and the routing
# hotfix (a4c06b0) in the WORKING FILES, video enabled, the worker running.
#
#   scripts/video-length-release.sh check       read-only: live files, no render in progress, FP-Studio's own
#                                               maximum (through the existing loopback route), tests on a copy
#   VIDEO_LENGTH_CONFIRM=backend:<patch id> scripts/video-length-release.sh apply
#       6 backend files a4c06b0 -> 648e8d0. Restarts lumen-api and the worker. The limit stays 10 s.
#   VIDEO_LENGTH_CONFIRM=enable-120 scripts/video-length-release.sh enable
#       STOPs unless the database already allows 120 s (migration 20261116210000, read-only check through
#       the local Supabase database container). Sets VIDEO_MAX_SECONDS=120 in .env, restarts both.
#   scripts/video-length-release.sh migration-check   read-only: what the database and lumen-api allow now
#   VIDEO_LENGTH_CONFIRM=enable-rollback scripts/video-length-release.sh enable-rollback   (.env byte for byte)
#   VIDEO_LENGTH_CONFIRM=backend-rollback scripts/video-length-release.sh rollback
#   scripts/video-length-release.sh status
#
# Every step that restarts a service STOPs while any video job is queued or running: a render is never
# interrupted. Nothing here cancels, resubmits or touches Heavy, FP-Studio, the routes, Supabase or HEAD.
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
FROM="${VIDEO_LENGTH_FROM:-a4c06b0d3c3877da328ea5fa51f2f4206b0b0a29}"   # video backend + routing hotfix, live
TO="${VIDEO_LENGTH_TO:-648e8d0e37e48b3cc470e9f11df1f86c70c9d771}"       # + clips of up to 120 s
UNIT=lumen-media-worker.service
NEED_SECONDS=120
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

active_jobs() {  # how many video jobs are queued or running (read-only, service role; nothing is printed but the count)
  [ -z "${VIDEO_LENGTH_FAKE_ACTIVE:-}" ] || { echo "$VIDEO_LENGTH_FAKE_ACTIVE"; return; }  # offline tests only
  (cd "$(dirname "$(env_file)")" && PYTHONPATH="$LIVE_DIR/backend" "$PYTHON" -B -c '
import httpx
from lumen.config import get_settings
s = get_settings()
h = {"apikey": s.supabase_service_role_key, "Authorization": "Bearer " + s.supabase_service_role_key}
r = httpx.get(s.supabase_url.rstrip("/") + "/rest/v1/media_generation_jobs",
              params={"select": "id", "status": "in.(queued,running)"}, headers=h, timeout=10)
r.raise_for_status(); print(len(r.json()))')
}
no_render() { local n; n=$(active_jobs 2>/dev/null || echo unknown); [ "$n" = 0 ]; }
framepack_url() { sed -n 's/^\(export \)\{0,1\}FRAMEPACK_URL=//p' "$(env_file)" | tail -1 | tr -d "\"'"; }
fp_max_ok() {  # FP-Studio's own slider maximum, read-only, through the route lumen-api already uses
  local url; url=$(framepack_url); [[ "$url" =~ ^http://127\.0\.0\.1:[0-9]{2,5}/?$ ]] || return 1
  (cd "$REPO/backend" && ${VIDEO_LENGTH_FP_CHECK:-"$PYTHON" "$REPO/scripts/check-framepack-endpoint.py"} --url "$url" \
     --api-name /handle_start_button --need-seconds "$NEED_SECONDS" > /dev/null 2>&1)
}
db_limit() {  # the database's own limit on duration_seconds: a number, or "unknown". READ ONLY.
  [ -z "${VIDEO_LENGTH_FAKE_DB_LIMIT:-}" ] || { echo "$VIDEO_LENGTH_FAKE_DB_LIMIT"; return; }  # offline tests only
  local box="${VIDEO_LENGTH_DB_CONTAINER:-}" def
  if [ -z "$box" ]; then
    box=$(docker ps --format '{{.Names}}' 2>/dev/null | grep '^supabase_db_' || true)
    [ "$(grep -c . <<< "$box")" = 1 ] || { echo unknown; return; }   # none, or more than one: never guess
  fi
  def=$(docker exec "$box" psql -U postgres -d postgres -AtX -v ON_ERROR_STOP=1 -c "BEGIN TRANSACTION READ ONLY; select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.media_generation_jobs'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%duration_seconds <=%'; COMMIT;" 2>/dev/null || true)
  def=$(grep -oE 'duration_seconds <= \(?[0-9]+' <<< "$def" | grep -oE '[0-9]+$' | head -1 || true)
  echo "${def:-unknown}"
}
db_allows() { local limit; limit=$(db_limit); [[ "$limit" =~ ^[0-9]+$ ]] && [ "$limit" -ge "$NEED_SECONDS" ]; }
max_now() { (cd "$(dirname "$(env_file)")" && PYTHONPATH="$LIVE_DIR/backend" "$PYTHON" -B -c '
from lumen.config import get_settings
print("%g" % get_settings().video_max_seconds)'); }

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
  local run=(-m pytest -q -p no:cacheprovider tests/test_video_120s.py tests/test_media_generation.py
             tests/test_media_worker.py tests/test_framepack_studio.py tests/test_sdxl_image_workflow.py)
  "$PYTHON" -c 'import pytest' 2>/dev/null || run=(-c 'import sys, unittest, lumen.main, lumen.media_worker
r = unittest.TextTestRunner(verbosity=1).run(unittest.defaultTestLoader.loadTestsFromNames(
    ["tests.test_video_120s", "tests.test_media_generation", "tests.test_media_worker",
     "tests.test_framepack_studio", "tests.test_sdxl_image_workflow"]))
print(f"{r.testsRun} passed (unittest; app and worker import)" if r.wasSuccessful() else "unittest FAILED")
sys.exit(0 if r.wasSuccessful() else 1)')
  if (cd "$copy/backend" && env -i PATH="$PATH" HOME="$HOME" LANG=C.UTF-8 PYTHONPATH="$copy/backend" \
      SUPABASE_URL=http://127.0.0.1:9 SUPABASE_SERVICE_ROLE_KEY=fictional "$PYTHON" -B "${run[@]}" \
      > "$1/tests.log" 2>&1); then rm -rf "$copy"; return 0; fi
  rm -rf "$copy"; return 1
}

check() {
  echo "== Clips of up to 120 seconds: read-only check =="
  [ -z "$(repo status --porcelain)" ] && pass "this clone is clean" || bad "this clone has local changes"
  repo cat-file -e "$TO^{commit}" 2>/dev/null && repo merge-base --is-ancestor "$FROM" "$TO" \
    && pass "reviewed commit ${TO:0:12} is on top of the live backend ${FROM:0:12}" || bad "pinned commits not found"
  [ -d "$LIVE_DIR/.git" ] && pass "live checkout: $LIVE_DIR" || { bad "no live checkout at $LIVE_DIR"; return; }
  info "live HEAD $(git -C "$LIVE_DIR" rev-parse --short=12 HEAD) (never moved by this script)"
  [ -f "$STATE_DIR/hotfix" ] && pass "routing hotfix is recorded ($(cat "$STATE_DIR/hotfix"))" \
    || bad "no routing hotfix recorded in $STATE_DIR"
  local st; st=$(state)
  case "$st" in
    before) pass "all $(files | wc -l) target files equal the live backend ${FROM:0:12}, byte for byte (new files absent)" ;;
    applied) info "the 120-second backend is already applied" ;;
    *) bad "live target files differ from both ${FROM:0:12} and ${TO:0:12} (never overwritten):"
       local p; while read -r p; do info "  $p live $(live_blob "$p" | cut -c1-12) expected $(blob_of "$FROM" "$p" | cut -c1-12)"; done < <(files) ;;
  esac
  health_ok && pass "lumen-api is healthy" || bad "lumen-api /health does not answer"
  local n; n=$(active_jobs 2>/dev/null || echo unknown)
  [ "$n" = 0 ] && pass "no video job is queued or running" \
    || bad "video jobs queued or running: $n. Wait for them to finish; nothing is restarted during a render"
  fp_max_ok && pass "FramePack-Studio's own length slider allows ${NEED_SECONDS} s (read-only, through the existing route)" \
    || bad "FramePack-Studio's maximum could not be confirmed as ${NEED_SECONDS} s through the existing route"
  info "longest clip lumen-api allows now: $(max_now 2>/dev/null || echo unreadable) s; the database: $(db_limit) s"
  local record; record=$(mktemp -d); the_patch > "$record/patch"
  if [ "$st" = before ] && test_copy "$record"; then
    pass "backend tests on a patched copy of the live backend: $(tail -1 "$record/tests.log")"
  elif [ "$st" = before ]; then bad "backend tests on the patched copy failed (log: $record/tests.log)"; fi
  echo "Patch id: $(patch_id)  ($(files | wc -l) files: $(files | tr '\n' ' '))"
  [ "$problems" = 0 ] && echo "READY. Backend: VIDEO_LENGTH_CONFIRM=backend:$(patch_id) $0 apply" \
    || echo "NOT READY: $problems problem(s)."
}

restore_files() {
  local record="$1" sum p
  while read -r sum p; do
    if [ "$sum" = absent ]; then rm -f "$LIVE_DIR/$p"
    else cp -p "$record/files/$p" "$LIVE_DIR/$p"
      [ "$(sha256sum < "$LIVE_DIR/$p" | cut -c1-64)" = "$sum" ] || die "restore of $p did not verify"; fi
  done < "$record/before"
}
restart_both() { sudo systemctl restart lumen-api; wait_health; sudo systemctl restart "$UNIT"; sleep "${VIDEO_LENGTH_SETTLE:-3}"
  [ "$(systemctl show -p ActiveState --value "$UNIT")" = active ]; }

apply() {
  local id; id=$(patch_id)
  [ "${VIDEO_LENGTH_CONFIRM:-}" = "backend:$id" ] || die "Owner confirmation missing. After 'check', run: VIDEO_LENGTH_CONFIRM=backend:$id $0 apply"
  [ ! -f "$STATE_DIR/length" ] || die "Already applied ($(cat "$STATE_DIR/length")). Use status or rollback."
  [ "$(state)" = before ] || die "Live target files are not the live backend byte for byte. Nothing was changed."
  no_render || die "A video job is queued or running (or the job table could not be read). Nothing was changed; try again when it has finished."
  check > /dev/null || true; [ "$problems" = 0 ] || die "check reports $problems problem(s). Nothing was changed."
  local record p head envsum ef; record="$STATE_DIR/length-$(date +%Y%m%d-%H%M%S)"; mkdir -p "$record/files"; chmod 700 "$STATE_DIR" "$record"
  head=$(git -C "$LIVE_DIR" rev-parse HEAD); ef=$(env_file); envsum=$(sha256sum < "$ef" | cut -c1-64); the_patch > "$record/patch"
  while read -r p; do
    if [ -f "$LIVE_DIR/$p" ]; then mkdir -p "$record/files/$(dirname "$p")"; cp -p "$LIVE_DIR/$p" "$record/files/$p"
      echo "$(sha256sum < "$LIVE_DIR/$p" | cut -c1-64) $p" >> "$record/before"
    else echo "absent $p" >> "$record/before"; fi
  done < <(files)
  echo "Backup: $record"; echo "$record" > "$STATE_DIR/length"
  trap 'echo "Step failed; restoring the backup." >&2; trap - ERR; restore_files "$record"; sudo systemctl restart lumen-api; wait_health || true; sudo systemctl restart "$UNIT" || true; rm -f "$STATE_DIR/length"; exit 1' ERR
  git -C "$LIVE_DIR" apply - < "$record/patch"
  while read -r p; do [ "$(live_blob "$p")" = "$(blob_of "$TO" "$p")" ]; done < <(files)
  [ "$(git -C "$LIVE_DIR" rev-parse HEAD)" = "$head" ]
  [ "$(sha256sum < "$ef" | cut -c1-64)" = "$envsum" ]
  restart_both
  serves_media
  trap - ERR
  echo "Applied: the backend can make clips of up to 120 s once enabled. The limit is still $(max_now) s (.env unchanged)."
  echo "Next: apply migration 20261116210000 (docs/video-release.md), then: VIDEO_LENGTH_CONFIRM=enable-120 $0 enable"
  echo "Way back: VIDEO_LENGTH_CONFIRM=backend-rollback $0 rollback"
}

rollback() {
  [ "${VIDEO_LENGTH_CONFIRM:-}" = backend-rollback ] || die "Run: VIDEO_LENGTH_CONFIRM=backend-rollback $0 rollback"
  [ -f "$STATE_DIR/length" ] || die "Nothing recorded to roll back."
  [ ! -f "$STATE_DIR/length-enable" ] || die "120 s is enabled. First: VIDEO_LENGTH_CONFIRM=enable-rollback $0 enable-rollback"
  no_render || die "A video job is queued or running (or the job table could not be read). Nothing was changed."
  restore_files "$(cat "$STATE_DIR/length")"
  sudo systemctl restart lumen-api
  wait_health || die "lumen-api is not healthy after the restore. Backup: $(cat "$STATE_DIR/length")"
  sudo systemctl restart "$UNIT" || true
  rm -f "$STATE_DIR/length"
  echo "Restored: the backend files are exactly ${FROM:0:12} again; lumen-api and the worker restarted."
}

enable() {
  [ "${VIDEO_LENGTH_CONFIRM:-}" = enable-120 ] || die "Run, only after migration 20261116210000 is applied: VIDEO_LENGTH_CONFIRM=enable-120 $0 enable"
  [ -f "$STATE_DIR/length" ] && [ "$(state)" = applied ] || die "The 120-second backend is not applied. Run check and apply first."
  [ ! -f "$STATE_DIR/length-enable" ] || die "Already enabled. Use status or enable-rollback."
  no_render || die "A video job is queued or running (or the job table could not be read). Nothing was changed."
  fp_max_ok || die "FramePack-Studio's maximum could not be confirmed as ${NEED_SECONDS} s. Nothing was changed."
  db_allows || die "The database allows clips of up to $(db_limit) s, not ${NEED_SECONDS}: migration 20261116210000 is not applied (or could not be read; set VIDEO_LENGTH_DB_CONTAINER). Nothing was changed. See: $0 migration-check"
  local ef record; ef=$(env_file); record="$STATE_DIR/length-enable-$(date +%Y%m%d-%H%M%S)"; mkdir -p "$record"; chmod 700 "$STATE_DIR" "$record"
  cp -p "$ef" "$record/env"; echo "$ef" > "$record/env-path"; sha256sum < "$ef" | cut -c1-64 > "$record/env-sha256"
  awk -v n="$NEED_SECONDS" '
    /^(export )?VIDEO_MAX_SECONDS=/ { print "VIDEO_MAX_SECONDS=" n; a=1; next }
    { print }
    END { if (!a) print "VIDEO_MAX_SECONDS=" n }' "$ef" > "$record/env.new"
  local keys='^(export )?VIDEO_MAX_SECONDS='
  [ -z "$(diff <(grep -vE "$keys" "$ef") <(grep -vE "$keys" "$record/env.new"))" ] || die "unexpected .env difference; nothing changed"
  echo "$record" > "$STATE_DIR/length-enable"
  trap 'echo "Enable failed; restoring .env." >&2; trap - ERR; cat "$record/env" > "$ef"; sudo systemctl restart lumen-api; wait_health || true; sudo systemctl restart "$UNIT" || true; rm -f "$STATE_DIR/length-enable"; exit 1' ERR
  cat "$record/env.new" > "$ef"; rm -f "$record/env.new"
  [ "$(max_now)" = "$NEED_SECONDS" ]
  restart_both
  trap - ERR
  echo "Enabled: clips of 1 to ${NEED_SECONDS} s (default 5 s). A long clip may render for many hours (budget up to 24 h)."
  echo "Way back: VIDEO_LENGTH_CONFIRM=enable-rollback $0 enable-rollback"
}

enable_rollback() {
  [ "${VIDEO_LENGTH_CONFIRM:-}" = enable-rollback ] || die "Run: VIDEO_LENGTH_CONFIRM=enable-rollback $0 enable-rollback"
  [ -f "$STATE_DIR/length-enable" ] || die "Nothing recorded to roll back."
  no_render || die "A video job is queued or running (or the job table could not be read). Nothing was changed."
  local record; record=$(cat "$STATE_DIR/length-enable")
  cat "$record/env" > "$(cat "$record/env-path")"
  [ "$(sha256sum < "$(cat "$record/env-path")" | cut -c1-64)" = "$(cat "$record/env-sha256")" ] || die "restore of .env did not verify"
  sudo systemctl restart lumen-api
  wait_health || die "lumen-api is not healthy after the restore."
  sudo systemctl restart "$UNIT" || true
  rm -f "$STATE_DIR/length-enable"
  echo "The limit is $(max_now) s again (.env exactly as before). Finished videos and job rows are kept."
}

migration_check() {  # read-only
  echo "== Migration 20261116210000 (duration_seconds <= ${NEED_SECONDS}): read-only check =="
  local limit app; limit=$(db_limit); app=$(max_now 2>/dev/null || echo unreadable)
  info "database allows clips of up to: $limit s"
  info "lumen-api allows clips of up to: $app s"
  if [[ "$limit" =~ ^[0-9]+$ ]] && [ "$limit" -ge "$NEED_SECONDS" ]; then pass "the migration is applied"
  elif [ "$limit" = unknown ]; then bad "the database limit could not be read (docker and one supabase_db_* container are needed, or set VIDEO_LENGTH_DB_CONTAINER)"
  else bad "the migration is NOT applied: the database still refuses clips longer than $limit s"
    [ "$app" = "$limit" ] || info "until it is applied, a request for more than $limit s is answered with \"couldn't start the video\"; no GPU job is made"
    info "apply it (owner): supabase migration list --local must show only 20261116210000 pending, then supabase db push --local"
    info "do not run enable again and restart nothing: the migration needs no restart"
  fi
}

status() {
  info "120-second backend: $(state) $( [ -f "$STATE_DIR/length" ] && echo "(recorded $(cat "$STATE_DIR/length"))")"
  info "longest clip allowed now: $(max_now 2>/dev/null || echo unreadable) s $( [ -f "$STATE_DIR/length-enable" ] && echo "(enabled by this script)")"
  info "video jobs queued or running: $(active_jobs 2>/dev/null || echo unknown)"
  local limit app; limit=$(db_limit); app=$(max_now 2>/dev/null || echo 0)
  info "database allows clips of up to: $limit s"
  if [[ "$limit" =~ ^[0-9]+$ ]] && [ "${app%.*}" -gt "$limit" ] 2>/dev/null; then
    bad "WARNING: lumen-api allows $app s but the database only $limit s: migration 20261116210000 is missing. Run: $0 migration-check"; fi
  info "live HEAD $(git -C "$LIVE_DIR" rev-parse --short=12 HEAD 2>/dev/null || echo unknown)"
  health_ok && pass "lumen-api is healthy" || bad "lumen-api /health does not answer"
}

case "$MODE" in
  check) check; [ "$problems" = 0 ] ;;
  apply) apply ;;
  rollback) rollback ;;
  enable) enable ;;
  migration-check) migration_check; [ "$problems" = 0 ] ;;
  enable-rollback) enable_rollback ;;
  status) status ;;
  *) die "usage: $0 check|apply|rollback|migration-check|enable|enable-rollback|status" ;;
esac

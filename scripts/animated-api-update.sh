#!/usr/bin/env bash
# Incremental update of the normal Lumen installation for a change that touches the web app AND the animated
# companion's own backend routes (backend/lumen/avatar.py), such as the scene selector. And its way back.
# It is separate from scripts/animated-deploy.sh, whose cutover is done once and is not run again, and it is
# the only one of these scripts that restarts lumen-api.
# Run from the reviewed clone of the branch to deploy, as the lumen-api user, without sudo.
#
#   scripts/animated-api-update.sh check      read-only: is this step limited to the web app and the avatar routes
#   LUMEN_API_UPDATE_CONFIRM=update:<commit> scripts/animated-api-update.sh update
#   scripts/animated-api-update.sh status     read-only
#   LUMEN_API_UPDATE_CONFIRM=rollback scripts/animated-api-update.sh rollback   code and web app exactly as before
#
# Settings: LIVE_DIR (default /home/brett/lumen-push), LUMEN_API_URL (default http://127.0.0.1:8001).
#
# `update` runs scripts/animated-web-update.sh for the build, the swap of `dist` and the fast-forward of the
# live checkout (all with its own checks and its own undo), then restarts lumen-api only (sudo asks here),
# and requires: lumen-api healthy, the memory settings systemd gives it and every lumen-api drop-in exactly as
# before, and the new scene route asking for sign-in. If any of that fails it goes back by itself: earlier
# build, earlier commit, lumen-api restarted again.
# It refuses a commit that changes anything outside the web app and backend/lumen/avatar.py (with its tests).
# It never opens or changes a drop-in, RMC, the memory settings, the database, voice, lumen-web or the avatar
# bridge, and it installs nothing: the step has no new dependency and no migration.
# A conversation in progress loses its connection for the few seconds lumen-api restarts; pick a quiet moment.
set -euo pipefail
MODE="${1:-}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export LIVE_DIR="${LIVE_DIR:-/home/brett/lumen-push}"
API="${LUMEN_API_URL:-http://127.0.0.1:8001}"
DROPIN_DIR="${LUMEN_ANIMATED_DROPIN_DIR:-/etc/systemd/system/lumen-api.service.d}"   # override only for tests
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/lumen-animated/api-updates"
WEB="$REPO/scripts/animated-web-update.sh"
die()  { printf 'STOP  %s\n' "$1" >&2; exit 1; }
[ "$(id -u)" != 0 ] || die "Run as the Lumen service user, not root."

web() { LUMEN_WEB_UPDATE_WITH_AVATAR_API=1 bash "$WEB" "$@"; }
health_ok() { curl -fsS --max-time 5 "$API/health" >/dev/null 2>&1; }
wait_health() { for _ in $(seq 1 "${LUMEN_ANIMATED_WAIT:-60}"); do health_ok && return 0; sleep 1; done; return 1; }
memory_settings() {  # the names and values lumen-api gets from systemd for its memory store (no key is among them)
  systemctl show -p Environment --value lumen-api 2>/dev/null | tr ' ' '\n' | grep -E '^(LUMEN_MEMORY_BACKEND|RMC_[A-Z_]+)=' | sort || true
}
dropins() { find "$DROPIN_DIR" -maxdepth 1 -type f -exec sha256sum {} + 2>/dev/null | sort -k2 || true; }
route() { curl -sS -m 5 -o /dev/null -w '%{http_code}' "$API/v0.1/avatar/$1" 2>/dev/null || true; }

go_back() {  # earlier build and commit through the web script, then lumen-api on the earlier code
  LUMEN_WEB_UPDATE_CONFIRM=rollback web rollback
  sudo systemctl restart lumen-api
  wait_health && echo "lumen-api is healthy on the earlier code." \
    || die "the earlier code and build are back, but lumen-api does not report healthy. Look at: journalctl -u lumen-api -n 50"
  mv "$STATE_DIR/current" "$STATE_DIR/undone-$(date +%Y%m%d-%H%M%S)" 2>/dev/null || true
}

case "$MODE" in
check)
  out=$(web check) && ready=1 || ready=0
  grep -v '^\(READY\|NOT READY\)' <<< "$out" | sed '/^$/d'
  health_ok && echo "PASS  lumen-api is healthy at $API" || { echo "FAIL  lumen-api does not report healthy at $API"; ready=0; }
  [ "$(route status)" = 401 ] && echo "PASS  the avatar routes are live and ask for sign-in" \
    || { echo "FAIL  /v0.1/avatar/status does not answer 401; the animated companion is not the live baseline here"; ready=0; }
  echo "INFO  lumen-api drop-ins (not opened, only compared before and after): $(dropins | wc -l)"
  echo
  [ "$ready" = 1 ] && echo "READY. Nothing was changed. After owner review: LUMEN_API_UPDATE_CONFIRM=update:$(git -C "$REPO" rev-parse --short=7 HEAD) $0 update" \
    || { echo "NOT READY. Nothing was changed."; exit 1; }
  ;;
status)
  web status
  echo "INFO  lumen-api: $(health_ok && echo healthy || echo 'NOT healthy') at $API; scene route answers HTTP $(route scenes) without sign-in (401 expected after the update, 404 before)"
  [ -f "$STATE_DIR/current" ] && echo "INFO  last api update: $(cat "$STATE_DIR/current")" || echo "INFO  last api update: none recorded"
  ;;
update)
  target=$(git -C "$REPO" rev-parse HEAD)
  [ "${LUMEN_API_UPDATE_CONFIRM:-}" = "update:${target:0:7}" ] || die "Owner confirmation missing. After reviewing 'check', run: LUMEN_API_UPDATE_CONFIRM=update:${target:0:7} $0 update"
  "$0" check > /dev/null || die "check reports a problem. Nothing was changed. Run: $0 check"
  mkdir -p "$STATE_DIR"; chmod 700 "$STATE_DIR"
  record=$(mktemp -d "$STATE_DIR/$(date +%Y%m%d-%H%M%S)-XXXXXX")
  memory_settings > "$record/memory-settings"; dropins > "$record/dropins"
  git -C "$LIVE_DIR" rev-parse HEAD > "$record/previous-commit"; echo "$target" > "$record/target-commit"
  LUMEN_WEB_UPDATE_CONFIRM="update:${target:0:7}" web update || die "the web step did not complete and has undone itself. lumen-api was not restarted."
  echo "$record" > "$STATE_DIR/current"
  trap 'echo "Update failed; going back." >&2; trap - ERR; go_back; exit 1' ERR
  sudo systemctl restart lumen-api
  wait_health
  [ "$(memory_settings)" = "$(cat "$record/memory-settings")" ]   # memory backend and RMC settings exactly as before
  [ "$(dropins)" = "$(cat "$record/dropins")" ]                   # no drop-in added, removed or changed
  [ "$(route scenes)" = 401 ]                                     # the new route exists and asks for sign-in
  [ "$(route status)" = 401 ]
  trap - ERR
  echo "Updated: $LIVE_DIR @ ${target:0:12}; lumen-api restarted and healthy; memory settings and drop-ins unchanged."
  echo "Go back with: LUMEN_API_UPDATE_CONFIRM=rollback $0 rollback"
  ;;
rollback)
  [ "${LUMEN_API_UPDATE_CONFIRM:-}" = rollback ] || die "Owner confirmation missing. Run: LUMEN_API_UPDATE_CONFIRM=rollback $0 rollback"
  [ -f "$STATE_DIR/current" ] || die "No api update is recorded. Nothing to go back to."
  go_back
  ;;
*) sed -n '2,24p' "${BASH_SOURCE[0]}"; exit 2 ;;
esac

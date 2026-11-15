#!/usr/bin/env bash
# Incremental, frontend-only update of the normal Lumen installation, and its way back.
# For changes that touch only the web app (for example the animated companion's display size).
# It is separate from scripts/animated-deploy.sh, whose cutover is done once and is not run again.
# Run from the reviewed clone of the branch to deploy, as the lumen-api user, without sudo.
#
#   scripts/animated-web-update.sh check      read-only: is this a frontend-only step from what is live
#   LUMEN_WEB_UPDATE_CONFIRM=update:<commit> scripts/animated-web-update.sh update
#   scripts/animated-web-update.sh status     read-only
#   LUMEN_WEB_UPDATE_CONFIRM=rollback scripts/animated-web-update.sh rollback   the web app exactly as before the update
#
# Settings: LIVE_DIR (default /home/brett/lumen-push), WEB_URL (default http://127.0.0.1:8081).
#
# `update` does two things: it builds the web app in this clone and swaps the result in for the live
# `dist` (the old build is kept), and it fast-forwards the live checkout so the code matches what is
# served (local edits are kept; if one would be touched it refuses first).
# It restarts nothing and uses no sudo: lumen-web reads the build from disk for every request, so a
# browser reload shows the new version. lumen-api, its settings and drop-ins, RMC, the database, the
# avatar bridge and the cutover record of animated-deploy.sh are not touched or read.
# It refuses any commit that changes more than the web app's own source, tests, docs or these scripts.
set -euo pipefail
MODE="${1:-}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIVE_DIR="${LIVE_DIR:-/home/brett/lumen-push}"
WEB_URL="${WEB_URL:-http://127.0.0.1:8081}"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/lumen-animated/web-updates"
FRONTEND_ONLY='^(app/|components/|lib/|hooks/|types/|tests/|docs/|scripts/(test-)?animated[-_][A-Za-z0-9_.-]+$)'
# Set only by scripts/animated-api-update.sh, which restarts lumen-api itself and checks it afterwards:
# the animated companion's own backend routes and their tests may then be part of the step. Nothing else may.
[ "${LUMEN_WEB_UPDATE_WITH_AVATAR_API:-}" != 1 ] || FRONTEND_ONLY="${FRONTEND_ONLY%)}|backend/lumen/avatar\\.py\$|backend/tests/test_avatar\\.py\$)"
problems=0
pass() { printf 'PASS  %s\n' "$1"; }
bad()  { printf 'FAIL  %s\n' "$1"; problems=$((problems + 1)); }
info() { printf 'INFO  %s\n' "$1"; }
die()  { printf 'STOP  %s\n' "$1" >&2; exit 1; }
[ "$(id -u)" != 0 ] || die "Run as the Lumen service user, not root."

live() { git -C "$LIVE_DIR" "$@"; }
local_edits() { live status --porcelain --untracked-files=no | cut -c4-; }
web_is_static() { systemctl cat lumen-web.service 2>/dev/null | grep -q 'serve-web.cjs'; }
web_code() { curl -sS -m 5 -o /dev/null -w '%{http_code}' "$WEB_URL/" 2>/dev/null || true; }

export_problem() {  # prints why an exported build must not be served; succeeds when it is sound
  local dist="$1" page="$1/index.html" script found=0
  [ -s "$page" ] || { echo "no index.html"; return 1; }
  while read -r script; do
    found=1
    [ -s "$dist/${script#/}" ] || { echo "index.html names $script, which is missing or empty"; return 1; }
    # A bundle built from this clone must not carry module paths of any other checkout.
    if grep -qF "$(realpath "$LIVE_DIR")/" "$dist/${script#/}"; then echo "$script contains paths of the live checkout (stale bundler cache)"; return 1; fi
  done < <(grep -o 'src="[^"]*\.js"' "$page" | sed 's/^src="//; s/"$//')
  [ "$found" = 1 ] || { echo "index.html names no script"; return 1; }
}

check() {
  local target previous
  target=$(git -C "$REPO" rev-parse HEAD)
  info "to deploy: $REPO @ ${target:0:12}"
  [ -z "$(git -C "$REPO" status --porcelain --untracked-files=no)" ] && pass "this clone has no uncommitted changes" || bad "this clone has uncommitted changes; deploy a reviewed commit only"
  [ "$(realpath "$REPO")" != "$(realpath "$LIVE_DIR" 2>/dev/null)" ] && pass "separate from the live checkout" || bad "run this from the reviewed clone, not the live checkout"
  previous=$(live rev-parse HEAD 2>/dev/null) || { bad "$LIVE_DIR is not a git checkout"; return; }
  info "live:      $LIVE_DIR @ ${previous:0:12}"
  if [ "$previous" = "$target" ]; then
    bad "the live checkout is already at this commit; there is nothing to update"
  elif git -C "$REPO" merge-base --is-ancestor "$previous" "$target" 2>/dev/null; then
    pass "this commit only adds to what is live ($(git -C "$REPO" rev-list --count "$previous..$target") commit(s), fast-forward)"
    local changed other touched
    changed=$(git -C "$REPO" diff --name-only "$previous" "$target")
    other=$(grep -Ev "$FRONTEND_ONLY" <<< "$changed" || true)
    local scope="frontend only"; [ "${LUMEN_WEB_UPDATE_WITH_AVATAR_API:-}" != 1 ] || scope="web app and avatar routes only"
    [ -z "$other" ] && pass "$scope: $(wc -l <<< "$changed") file(s), none in the ${LUMEN_WEB_UPDATE_WITH_AVATAR_API:+rest of the }backend, database, dependencies or service scripts" \
      || bad "not a frontend-only change; this procedure does not apply. Outside the web app: $(tr '\n' ' ' <<< "$other")"
    touched=$(comm -12 <(sort <<< "$changed") <(local_edits | sort))
    [ -z "$touched" ] && pass "no locally edited file is touched ($(local_edits | wc -l) local edit(s) stay as they are)" \
      || bad "these locally edited files would be touched: $(tr '\n' ' ' <<< "$touched")"
  else
    bad "the live checkout is not an ancestor of this commit; a fast-forward is not possible"
  fi
  if web_is_static; then
    pass "lumen-web serves the exported build from disk (no restart needed)"
    [ -f "$LIVE_DIR/dist/index.html" ] && pass "live build present" || bad "no $LIVE_DIR/dist/index.html"
    [ -d "$REPO/node_modules" ] && command -v npx >/dev/null 2>&1 && pass "this clone can build the web app" || bad "node or node_modules missing here (run: npm ci)"
  else
    bad "lumen-web does not serve the exported build; this procedure covers that setup only"
  fi
  [ "$(web_code)" = 200 ] && pass "the web app answers at $WEB_URL" || bad "the web app does not answer 200 at $WEB_URL"
}

undo() {  # $1 = record directory
  local record="$1" previous; previous=$(cat "$record/previous-commit")
  if [ -d "$record/dist.previous" ]; then
    rm -rf "$LIVE_DIR/dist.incoming"
    [ ! -d "$LIVE_DIR/dist" ] || { rm -rf "$record/dist.updated"; mv "$LIVE_DIR/dist" "$record/dist.updated"; }
    mv "$record/dist.previous" "$LIVE_DIR/dist"
  fi
  if [ "$(live rev-parse HEAD)" != "$previous" ]; then
    # --keep moves the checkout back and leaves local edits alone; it refuses rather than overwrite one.
    live reset -q --keep "$previous" || die "the earlier web build is back, but $LIVE_DIR could not be moved to ${previous:0:12}. By hand: git -C $LIVE_DIR reset --keep $previous"
  fi
  mv "$STATE_DIR/current" "$STATE_DIR/undone-$(basename "$record")" 2>/dev/null || true
  echo "The web app is as before the update (${previous:0:12}). Reload the browser."
}

case "$MODE" in
check)
  check; echo
  [ "$problems" = 0 ] && echo "READY. Nothing was changed. After owner review: LUMEN_WEB_UPDATE_CONFIRM=update:$(git -C "$REPO" rev-parse --short=7 HEAD) $0 update" \
    || { echo "NOT READY: $problems problem(s). Nothing was changed."; exit 1; }
  ;;
status)
  info "live checkout: $LIVE_DIR @ $(live rev-parse --short=12 HEAD 2>/dev/null || echo '?')"
  info "web app: HTTP $(web_code) at $WEB_URL"
  [ -f "$STATE_DIR/current" ] && info "last web update: $(cat "$STATE_DIR/current") (rollback returns to $(cut -c1-12 "$(cat "$STATE_DIR/current")/previous-commit"))" || info "last web update: none recorded"
  ;;
update)
  target=$(git -C "$REPO" rev-parse HEAD)
  [ "${LUMEN_WEB_UPDATE_CONFIRM:-}" = "update:${target:0:7}" ] || die "Owner confirmation missing. After reviewing 'check', run: LUMEN_WEB_UPDATE_CONFIRM=update:${target:0:7} $0 update"
  check > /dev/null; [ "$problems" = 0 ] || die "check reports $problems problem(s). Nothing was changed. Run: $0 check"
  previous=$(live rev-parse HEAD)
  mkdir -p "$STATE_DIR"; chmod 700 "$STATE_DIR"
  record=$(mktemp -d "$STATE_DIR/$(date +%Y%m%d-%H%M%S)-XXXXXX")   # one directory per attempt, never reused
  echo "$previous" > "$record/previous-commit"; echo "$target" > "$record/target-commit"
  echo "Building the web app in $REPO ..."   # first, and here, so a failed build changes nothing that is live
  [ -e "$REPO/.env" ] || ln -s "$LIVE_DIR/.env" "$REPO/.env"
  [ "$(realpath "$REPO/.env")" = "$(realpath "$LIVE_DIR/.env")" ] || die "$REPO/.env is not the live .env; the build must use the live settings. Nothing was changed."
  # --clear: Metro's cache can hold absolute module paths from another checkout; a clean export never reuses them.
  (cd "$REPO" && rm -rf dist && env -u EXPO_PUBLIC_LUMEN_API_URL EXPO_NO_TELEMETRY=1 npx expo export --platform web --clear > "$record/build.log" 2>&1) \
    || die "the web build failed (see $record/build.log). Nothing was changed."
  problem=$(export_problem "$REPO/dist") || die "the web build is not usable: $problem (see $record/build.log). Nothing was changed."
  rm -rf "$LIVE_DIR/dist.incoming"; cp -a "$REPO/dist" "$LIVE_DIR/dist.incoming"
  echo "$record" > "$STATE_DIR/current"
  trap 'echo "Update failed; going back." >&2; trap - ERR; undo "$record"; exit 1' ERR
  mv "$LIVE_DIR/dist" "$record/dist.previous"; mv "$LIVE_DIR/dist.incoming" "$LIVE_DIR/dist"
  live fetch -q "$REPO" HEAD
  live merge -q --ff-only "$target"
  [ "$(web_code)" = 200 ]
  trap - ERR
  echo "Updated: $LIVE_DIR @ ${target:0:12}. No service was restarted. Reload the browser to see it."
  echo "Go back with: LUMEN_WEB_UPDATE_CONFIRM=rollback $0 rollback"
  ;;
rollback)
  [ "${LUMEN_WEB_UPDATE_CONFIRM:-}" = rollback ] || die "Owner confirmation missing. Run: LUMEN_WEB_UPDATE_CONFIRM=rollback $0 rollback"
  [ -f "$STATE_DIR/current" ] || die "No web update is recorded. Nothing to go back to."
  undo "$(cat "$STATE_DIR/current")"
  ;;
*) sed -n '2,20p' "${BASH_SOURCE[0]}"; exit 2 ;;
esac

#!/usr/bin/env bash
# Put Animated Companion mode into the normal Lumen installation, and take it out again.
# Run from the reviewed clone of this branch (for example ~/lumen-animated-preview), as the
# user the lumen-api service runs as, without sudo. sudo is asked for only where needed.
#
#   scripts/animated-deploy.sh check      read-only: is everything ready, and what would change
#   LUMEN_ANIMATED_CONFIRM=cutover:<commit> scripts/animated-deploy.sh cutover
#   scripts/animated-deploy.sh status     read-only
#   scripts/animated-deploy.sh disable    switch the mode off again; code and web build stay
#   AVATAR_URL=... scripts/animated-deploy.sh enable    switch it back on after a disable
#   LUMEN_ANIMATED_CONFIRM=rollback scripts/animated-deploy.sh rollback   back to exactly the state before cutover
#
# Settings (environment variables):
#   AVATAR_URL         check, cutover: the avatar bridge, e.g. http://100.x.y.z:8283
#   AVATAR_TLS_VERIFY  set to false if the bridge uses a self-signed certificate
#   LIVE_DIR           the live checkout (default /home/brett/lumen-push)
#   SECRET_FILE        shared secret copied from the GPU host (default ~/.config/lumen-avatar/secret)
#
# Cutover changes exactly four things, all undone by `rollback`:
#   1. the live checkout is fast-forwarded to this clone's commit (local edits are kept; if one
#      would be touched, cutover refuses before changing anything);
#   2. the web app is built in this clone and the result replaces the live `dist` (the old one is kept);
#   3. one systemd drop-in for lumen-api is added, naming a private settings file with the avatar
#      address and secret. Existing drop-ins, including the RMC one, are not opened or changed;
#   4. lumen-api and lumen-web are restarted.
# It never touches RMC, the memory settings, the database, Supabase, voice, or any other service.
# Without the drop-in the mode is off: that is the default, and what `disable` returns to.
set -euo pipefail
MODE="${1:-}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIVE_DIR="${LIVE_DIR:-/home/brett/lumen-push}"
SECRET_FILE="${SECRET_FILE:-$HOME/.config/lumen-avatar/secret}"
SETTINGS_FILE="$HOME/.config/lumen-avatar/lumen-api.env"
DROPIN_DIR="${LUMEN_ANIMATED_DROPIN_DIR:-/etc/systemd/system/lumen-api.service.d}"   # override only for tests
DROPIN="$DROPIN_DIR/70-lumen-avatar.conf"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/lumen-animated"
API="${LUMEN_API_URL:-http://127.0.0.1:8001}"
problems=0
pass() { printf 'PASS  %s\n' "$1"; }
bad()  { printf 'FAIL  %s\n' "$1"; problems=$((problems + 1)); }
info() { printf 'INFO  %s\n' "$1"; }
die()  { printf 'STOP  %s\n' "$1" >&2; exit 1; }
[ "$(id -u)" != 0 ] || die "Run as the Lumen service user, not root."

live() { git -C "$LIVE_DIR" "$@"; }
health_ok() { curl -fsS --max-time 5 "$API/health" >/dev/null 2>&1; }
wait_health() { for _ in $(seq 1 "${LUMEN_ANIMATED_WAIT:-60}"); do health_ok && return 0; sleep 1; done; return 1; }
memory_settings() {  # the names and values lumen-api gets from systemd for its memory store (no key is among them)
  systemctl show -p Environment --value lumen-api 2>/dev/null | tr ' ' '\n' | grep -E '^(LUMEN_MEMORY_BACKEND|RMC_[A-Z_]+)=' | sort || true
}
other_dropins() { find "$DROPIN_DIR" -maxdepth 1 -type f ! -name "$(basename "$DROPIN")" -exec sha256sum {} + 2>/dev/null | sort -k2 || true; }
web_is_static() { systemctl cat lumen-web.service 2>/dev/null | grep -q 'serve-web.cjs'; }
local_edits() { live status --porcelain --untracked-files=no | cut -c4-; }
bridge_code() { local k=(); [ "${AVATAR_TLS_VERIFY:-true}" = false ] && k=(-k); curl -sS -m 5 "${k[@]}" -o /dev/null -w '%{http_code}' "$@" "$AVATAR_URL/liveness" 2>/dev/null || true; }
avatar_route() { curl -sS -m 5 -o /dev/null -w '%{http_code}' "$API/v0.1/avatar/status" 2>/dev/null || true; }

check() {
  local target previous me
  target=$(git -C "$REPO" rev-parse HEAD); me=$(id -un)
  echo "== This clone (what would be deployed)"
  info "$REPO @ ${target:0:12}"
  [ -z "$(git -C "$REPO" status --porcelain --untracked-files=no)" ] && pass "no uncommitted changes" || bad "this clone has uncommitted changes; deploy a reviewed commit only"
  [ "$(realpath "$REPO")" != "$(realpath "$LIVE_DIR" 2>/dev/null)" ] && pass "separate from the live checkout" || bad "run this from the reviewed clone, not the live checkout"
  echo "== Live checkout"
  previous=$(live rev-parse HEAD 2>/dev/null) || { bad "$LIVE_DIR is not a git checkout"; return; }
  info "$LIVE_DIR @ ${previous:0:12}"
  if [ "$previous" = "$target" ]; then
    info "already at this commit"
  elif git -C "$REPO" merge-base --is-ancestor "$previous" "$target" 2>/dev/null; then
    pass "this commit only adds to what is live ($(git -C "$REPO" rev-list --count "$previous..$target") commits, fast-forward)"
    local touched; touched=$(comm -12 <(git -C "$REPO" diff --name-only "$previous" "$target" | sort) <(local_edits | sort))
    [ -z "$touched" ] && pass "no locally edited file is touched ($(local_edits | wc -l) local edits stay as they are)" \
      || bad "these locally edited files would be touched: $(echo "$touched" | tr '\n' ' ')"
    git -C "$REPO" diff --quiet "$previous" "$target" -- package.json package-lock.json backend/pyproject.toml backend/requirements.txt supabase 2>/dev/null \
      && pass "no dependency or database change" || bad "dependencies or database files differ; this procedure does not install or migrate"
  else
    bad "the live checkout is not an ancestor of this commit; a fast-forward is not possible"
  fi
  echo "== Services"
  [ "$(systemctl show -p User --value lumen-api 2>/dev/null)" = "$me" ] && pass "lumen-api runs as $me" || bad "lumen-api does not run as $me"
  health_ok && pass "lumen-api is healthy" || bad "lumen-api does not answer $API/health"
  info "memory settings from systemd: $(memory_settings | cut -d= -f1 | tr '\n' ' ')($(memory_settings | sed -n 's/^LUMEN_MEMORY_BACKEND=//p' | grep . || echo supabase))"
  info "existing lumen-api drop-ins: $(find "$DROPIN_DIR" -maxdepth 1 -type f -printf '%f ' 2>/dev/null || true)"
  if web_is_static; then
    pass "lumen-web serves the exported build"
    [ -f "$LIVE_DIR/dist/index.html" ] && pass "live dist present" || bad "no $LIVE_DIR/dist/index.html"
    [ -d "$REPO/node_modules" ] && command -v npx >/dev/null 2>&1 && pass "this clone can build the web app" || bad "node or node_modules missing here (run: npm ci)"
  else
    info "lumen-web runs the Expo development server; it picks up the code after its restart"
  fi
  echo "== Avatar bridge"
  [ -s "$SECRET_FILE" ] && [ "$(stat -c '%a' "$SECRET_FILE")" = 600 ] && pass "secret file present, mode 600" || bad "$SECRET_FILE missing or not mode 600"
  if [ -n "${AVATAR_URL:-}" ] && [ -s "$SECRET_FILE" ]; then
    [ "$(bridge_code -H "X-Lumen-Avatar-Key: $(tr -d '\n' < "$SECRET_FILE")")" = 200 ] && pass "bridge answers with the secret" || bad "bridge at $AVATAR_URL does not answer 200 with the secret"
    [ "$(bridge_code)" = 401 ] && pass "bridge refuses without the secret" || bad "bridge does not answer 401 without the secret"
  else
    bad "set AVATAR_URL to the bridge address"
  fi
  [ -f "$DROPIN" ] && info "animated mode: already configured ($DROPIN)" || info "animated mode: off (no drop-in)"
}

apply_settings() {
  mkdir -p "$(dirname "$SETTINGS_FILE")"; chmod 700 "$(dirname "$SETTINGS_FILE")"
  (umask 077; printf 'AVATAR_URL=%s\nAVATAR_TLS_VERIFY=%s\nAVATAR_SHARED_SECRET=%s\n' \
     "$AVATAR_URL" "${AVATAR_TLS_VERIFY:-true}" "$(tr -d '\n' < "$SECRET_FILE")" > "$SETTINGS_FILE")
  sudo install -d "$DROPIN_DIR"
  printf '# Animated Companion mode. Remove this file and restart lumen-api to switch it off.\n[Service]\nEnvironmentFile=%s\n' "$SETTINGS_FILE" \
    | sudo tee "$DROPIN" >/dev/null
  sudo systemctl daemon-reload
}
remove_settings() { sudo rm -f "$DROPIN"; rm -f "$SETTINGS_FILE"; sudo systemctl daemon-reload; }

undo() {  # $1 = record directory of the cutover
  local record="$1" previous; previous=$(cat "$record/previous-commit")
  remove_settings
  if [ "$(live rev-parse HEAD)" != "$previous" ]; then
    # --keep moves the checkout back and leaves local edits alone; it refuses rather than overwrite one.
    live reset -q --keep "$previous" || die "could not move $LIVE_DIR back to ${previous:0:12}; local edits are untouched. Do it by hand: git -C $LIVE_DIR reset --keep $previous"
  fi
  if [ -d "$record/dist.previous" ]; then
    rm -rf "$LIVE_DIR/dist.animated"; mv "$LIVE_DIR/dist" "$LIVE_DIR/dist.animated"; mv "$record/dist.previous" "$LIVE_DIR/dist"; rm -rf "$LIVE_DIR/dist.animated"
  fi
  sudo systemctl restart lumen-api lumen-web
  wait_health || die "lumen-api is not healthy after going back; check: systemctl status lumen-api"
  mv "$STATE_DIR/current" "$STATE_DIR/undone-$(basename "$record")" 2>/dev/null || true
  echo "Back at ${previous:0:12} with animated mode off."
}

case "$MODE" in
check)
  check; echo; [ "$problems" = 0 ] && echo "READY. Nothing was changed. After owner approval: LUMEN_ANIMATED_CONFIRM=cutover:$(git -C "$REPO" rev-parse --short=7 HEAD) $0 cutover" || echo "NOT READY: $problems problem(s). Nothing was changed."
  [ "$problems" = 0 ] || exit 1
  ;;
status)
  info "live checkout: $LIVE_DIR @ $(live rev-parse --short=12 HEAD 2>/dev/null || echo '?')"
  [ -f "$DROPIN" ] && info "animated mode: configured" || info "animated mode: off (no drop-in)"
  health_ok && info "lumen-api: healthy" || info "lumen-api: NOT healthy"
  info "avatar route: HTTP $(avatar_route) (401 or 403 = present and asking for sign-in; 404 = code not deployed)"
  info "memory settings from systemd: $(memory_settings | cut -d= -f1 | tr '\n' ' ')"
  [ -f "$STATE_DIR/current" ] && info "cutover record: $(cat "$STATE_DIR/current") (rollback returns to $(cut -c1-12 "$(cat "$STATE_DIR/current")/previous-commit"))" || info "cutover record: none"
  ;;
cutover)
  target=$(git -C "$REPO" rev-parse HEAD)
  [ "${LUMEN_ANIMATED_CONFIRM:-}" = "cutover:${target:0:7}" ] || die "Owner confirmation missing. After reviewing 'check', run: LUMEN_ANIMATED_CONFIRM=cutover:${target:0:7} $0 cutover"
  [ ! -f "$STATE_DIR/current" ] || die "A cutover is already recorded ($(cat "$STATE_DIR/current")). Use rollback first, or status."
  check > /dev/null; [ "$problems" = 0 ] || die "check reports $problems problem(s). Nothing was changed. Run: $0 check"
  previous=$(live rev-parse HEAD)
  record="$STATE_DIR/$(date +%Y%m%d-%H%M%S)"; mkdir -p "$record"; chmod 700 "$STATE_DIR" "$record"
  echo "$previous" > "$record/previous-commit"; echo "$target" > "$record/target-commit"
  memory_settings > "$record/memory-settings"; other_dropins > "$record/other-dropins"
  if web_is_static; then  # build first, here, so a failed build changes nothing that is live
    echo "Building the web app in $REPO ..."
    [ -e "$REPO/.env" ] || ln -s "$LIVE_DIR/.env" "$REPO/.env"
    [ "$(realpath "$REPO/.env")" = "$(realpath "$LIVE_DIR/.env")" ] || die "$REPO/.env is not the live .env; the build must use the live settings. Nothing was changed."
    (cd "$REPO" && rm -rf dist && env -u EXPO_PUBLIC_LUMEN_API_URL EXPO_NO_TELEMETRY=1 npx expo export --platform web > "$record/build.log" 2>&1) \
      || die "the web build failed (see $record/build.log). Nothing was changed."
    [ -f "$REPO/dist/index.html" ] || die "the web build produced no index.html. Nothing was changed."
  fi
  echo "$record" > "$STATE_DIR/current"
  trap 'echo "Cutover failed; going back." >&2; trap - ERR; undo "$record"; exit 1' ERR
  if [ "$previous" != "$target" ]; then
    live fetch -q "$REPO" HEAD
    live merge -q --ff-only "$target"
  fi
  if web_is_static; then
    cp -a "$REPO/dist" "$LIVE_DIR/dist.animated"
    mv "$LIVE_DIR/dist" "$record/dist.previous"; mv "$LIVE_DIR/dist.animated" "$LIVE_DIR/dist"
  fi
  apply_settings
  sudo systemctl restart lumen-api lumen-web
  wait_health
  [ "$(memory_settings)" = "$(cat "$record/memory-settings")" ]   # the memory store settings must be exactly as before
  [ "$(other_dropins)" = "$(cat "$record/other-dropins")" ]       # and no other drop-in may have changed
  code=$(avatar_route); [ "$code" = 401 ] || [ "$code" = 403 ]    # the new route is there and asks for sign-in
  trap - ERR
  echo "Cutover done: $LIVE_DIR @ ${target:0:12}, animated mode configured, memory settings unchanged."
  echo "Go back with: LUMEN_ANIMATED_CONFIRM=rollback $0 rollback"
  ;;
disable)
  [ -f "$DROPIN" ] || { echo "Animated mode is already off. Nothing to do."; exit 0; }
  remove_settings; sudo systemctl restart lumen-api
  wait_health || die "lumen-api is not healthy; check: systemctl status lumen-api"
  echo "Animated mode is off. The Animated switch no longer appears; replies play as ordinary audio."
  echo "Switch it on again with: AVATAR_URL=... $0 enable"
  ;;
enable)
  : "${AVATAR_URL:?Set AVATAR_URL to the bridge address}"
  [ -f "$STATE_DIR/current" ] || die "No cutover is recorded; use cutover."
  [ -s "$SECRET_FILE" ] || die "$SECRET_FILE not found."
  apply_settings; sudo systemctl restart lumen-api
  wait_health || die "lumen-api is not healthy; check: systemctl status lumen-api"
  echo "Animated mode is configured again."
  ;;
rollback)
  [ "${LUMEN_ANIMATED_CONFIRM:-}" = rollback ] || die "Owner confirmation missing. Run: LUMEN_ANIMATED_CONFIRM=rollback $0 rollback"
  [ -f "$STATE_DIR/current" ] || die "No cutover is recorded. Nothing to go back to."
  undo "$(cat "$STATE_DIR/current")"
  ;;
*) sed -n '2,27p' "${BASH_SOURCE[0]}"; exit 2 ;;
esac

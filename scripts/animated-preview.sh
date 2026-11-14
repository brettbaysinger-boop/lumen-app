#!/usr/bin/env bash
# Development preview of Animated Companion mode, run from a SEPARATE clone of
# this branch on the Lumen host. It never touches the live checkout, its
# services, systemd, the database schema or RMC. Everything runs in the
# foreground on its own ports and stops with Ctrl-C.
#
#   scripts/animated-preview.sh check   read-only: show what the preview would use
#   scripts/animated-preview.sh api     preview API on PREVIEW_API_PORT (default 8011)
#   scripts/animated-preview.sh web     preview web app on PREVIEW_WEB_PORT (default 8091)
#
# Settings (environment variables):
#   AVATAR_URL         required for api: the avatar bridge, e.g. http://aiLumen-llm-heavy:8283
#   AVATAR_TLS_VERIFY  set to false if the bridge uses a self-signed certificate
#   PREVIEW_HOST       name or address browsers use for this host (default: hostname)
#   LIVE_DIR           live checkout, read only (default /home/brett/lumen-push)
#   SECRET_FILE        shared secret copied from the GPU host (default ~/.config/lumen-avatar/secret)
#
# The live checkout is used read-only for three things: its backend/.env and
# root .env (linked, not copied or edited) and its backend virtualenv's Python.
set -euo pipefail
MODE="${1:-}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIVE_DIR="${LIVE_DIR:-/home/brett/lumen-push}"
SECRET_FILE="${SECRET_FILE:-$HOME/.config/lumen-avatar/secret}"
PREVIEW_HOST="${PREVIEW_HOST:-$(hostname)}"
API_PORT="${PREVIEW_API_PORT:-8011}"
WEB_PORT="${PREVIEW_WEB_PORT:-8091}"
PYTHON="${PREVIEW_PYTHON:-$LIVE_DIR/backend/.venv/bin/python}"
fail() { echo "Cannot continue: $*" >&2; exit 2; }
case "$MODE" in check|api|web) ;; *) sed -n '2,19p' "${BASH_SOURCE[0]}"; exit 2 ;; esac
[ "$(realpath "$REPO")" != "$(realpath "$LIVE_DIR" 2>/dev/null || echo "$LIVE_DIR")" ] || fail "run this from a separate clone, not the live checkout."
link() {  # link a live env file into this clone; never overwrite a real file
  [ -f "$1" ] || fail "$1 not found (set LIVE_DIR)."
  if [ -L "$2" ] || [ ! -e "$2" ]; then ln -sfn "$1" "$2"; else echo "Keeping existing $2"; fi
}
port_free() { ! (ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$1\$"); }

if [ "$MODE" = check ]; then
  echo "Preview clone:   $REPO @ $(git -C "$REPO" rev-parse --short HEAD) ($(git -C "$REPO" rev-parse --abbrev-ref HEAD))"
  echo "Live checkout:   $LIVE_DIR @ $(git -C "$LIVE_DIR" rev-parse --short HEAD 2>/dev/null || echo '?') (read only)"
  for file in "$LIVE_DIR/backend/.env" "$LIVE_DIR/.env" "$PYTHON" "$SECRET_FILE"; do
    [ -e "$file" ] && echo "found:           $file" || echo "MISSING:         $file"
  done
  for port in "$API_PORT" "$WEB_PORT"; do port_free "$port" && echo "port $port:       free" || echo "port $port:       IN USE"; done
  insecure=(); [ "${AVATAR_TLS_VERIFY:-true}" = false ] && insecure=(-k)
  if [ -n "${AVATAR_URL:-}" ] && [ -s "$SECRET_FILE" ]; then
    code=$(curl -sS -m 5 "${insecure[@]}" -o /dev/null -w '%{http_code}' -H "X-Lumen-Avatar-Key: $(tr -d '\n' < "$SECRET_FILE")" "$AVATAR_URL/liveness" 2>/dev/null || true)
    echo "avatar bridge:   $AVATAR_URL -> HTTP ${code:-unreachable} (200 expected)"
    code=$(curl -sS -m 5 "${insecure[@]}" -o /dev/null -w '%{http_code}' "$AVATAR_URL/liveness" 2>/dev/null || true)
    echo "without secret:  HTTP ${code:-unreachable} (401 expected)"
  else
    echo "avatar bridge:   not checked (set AVATAR_URL and copy the secret file first)"
  fi
  echo "Nothing was changed."
  exit 0
fi

if [ "$MODE" = api ]; then
  : "${AVATAR_URL:?Set AVATAR_URL to the avatar bridge address}"
  [ -s "$SECRET_FILE" ] || fail "$SECRET_FILE not found. Copy it from the GPU host."
  [ -x "$PYTHON" ] || fail "$PYTHON not found (set PREVIEW_PYTHON)."
  port_free "$API_PORT" || fail "port $API_PORT is in use."
  link "$LIVE_DIR/backend/.env" "$REPO/backend/.env"
  cd "$REPO/backend"
  export PYTHONDONTWRITEBYTECODE=1 AVATAR_URL AVATAR_TLS_VERIFY="${AVATAR_TLS_VERIFY:-true}"
  export LUMEN_CORS_ORIGINS="${PREVIEW_CORS_ORIGINS:-http://$PREVIEW_HOST:$WEB_PORT,http://localhost:$WEB_PORT}"
  loaded=$("$PYTHON" -c 'import lumen, os; print(os.path.dirname(os.path.realpath(lumen.__file__)))')
  [ "$loaded" = "$(realpath "$REPO/backend/lumen")" ] || fail "Python loaded Lumen from $loaded, not from this clone."
  echo "Preview API on http://$PREVIEW_HOST:$API_PORT (code from $REPO, settings from the live .env, avatar at $AVATAR_URL)"
  AVATAR_SHARED_SECRET="$(tr -d '\n' < "$SECRET_FILE")" exec "$PYTHON" -m uvicorn lumen.main:app --host 0.0.0.0 --port "$API_PORT"
fi

port_free "$WEB_PORT" || fail "port $WEB_PORT is in use."
link "$LIVE_DIR/.env" "$REPO/.env"
cd "$REPO"
[ -d node_modules ] || npm ci --no-audit --no-fund
export EXPO_PUBLIC_LUMEN_API_URL="${PREVIEW_API_URL:-http://$PREVIEW_HOST:$API_PORT}" EXPO_NO_TELEMETRY=1
echo "Preview web app on http://$PREVIEW_HOST:$WEB_PORT using API $EXPO_PUBLIC_LUMEN_API_URL"
exec npx expo start --web --port "$WEB_PORT"

#!/usr/bin/env bash
# Lumen <-> its own RMC installation: read-only preflight, owner-gated
# activation, and rollback. See docs/rmc-integration.md §5.
#
#   scripts/lumen-rmc.sh preflight --rmc-dir DIR --installation-id ID   (read-only)
#   scripts/lumen-rmc.sh status                                         (read-only)
#   LUMEN_RMC_CONFIRM=activate:ID scripts/lumen-rmc.sh activate --rmc-dir DIR --installation-id ID
#   LUMEN_RMC_CONFIRM=rollback:ID scripts/lumen-rmc.sh rollback --installation-id ID
#
# Activation changes exactly three things, all reversible by `rollback`:
#   1. applies supabase/rmc/memory_store_guard.sql and sets its row to 'rmc'
#      (Supabase memory rows become read-only; none are changed or moved);
#   2. adds a systemd drop-in with the RMC settings for lumen-api;
#   3. restarts lumen-api.
# It never touches the RMC installation, Hindsight, PostgreSQL ports,
# existing memories, voice, avatars or any other service.
set -euo pipefail

PROJECT=$(cd "$(dirname "$0")/.." && pwd)
UNIT=lumen-api
DROPIN_DIR=${LUMEN_RMC_DROPIN_DIR:-/etc/systemd/system/$UNIT.service.d}  # override only for tests
DROPIN=$DROPIN_DIR/60-lumen-rmc.conf
GUARD_SQL=$PROJECT/supabase/rmc/memory_store_guard.sql
STATE_DIR=${XDG_STATE_HOME:-$HOME/.local/state}/lumen-rmc
API=${LUMEN_API_URL:-http://127.0.0.1:8001}

cmd=${1:-}; shift || true
RMC_DIR=""; INSTALL_ID=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --rmc-dir) RMC_DIR=${2:?}; shift 2 ;;
    --installation-id) INSTALL_ID=${2:?}; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

failures=0
pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; failures=$((failures + 1)); }
info() { printf 'INFO  %s\n' "$1"; }
die()  { printf 'STOP  %s\n' "$1" >&2; exit 1; }

[[ $(id -u) != 0 ]] || die "Run as the Lumen service user, not root (sudo is used only where needed)."
[[ -z $INSTALL_ID || $INSTALL_ID =~ ^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$ ]] || die "Invalid installation id."

docker_cmd() { if docker info >/dev/null 2>&1; then docker "$@"; else sudo -n docker "$@"; fi; }
db_container() {
  local id; id=$(sed -n 's/^project_id *= *"\(.*\)"/\1/p' "$PROJECT/supabase/config.toml" | head -1)
  [[ -n $id ]] || die "No project_id in supabase/config.toml."
  echo "supabase_db_$id"
}
psql_lumen() { docker_cmd exec -i "$(db_container)" psql -X -q -A -t -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
guard_backend() {
  psql_lumen -c "SELECT CASE WHEN to_regclass('public.lumen_memory_store') IS NULL THEN 'absent'
                 ELSE (SELECT backend FROM public.lumen_memory_store WHERE singleton) END" 2>/dev/null || echo unknown
}
memory_counts() {
  # Counts only; no memory content is read.
  psql_lumen -c "SELECT (SELECT count(*) FROM public.memories) || ' ' ||
                        (SELECT count(*) FROM public.memory_suggestions) || ' ' ||
                        (SELECT count(*) FROM public.memory_revisions)"
}
health_ok() { curl -fsS --max-time 5 "$API/health" >/dev/null 2>&1; }
wait_health() { for _ in $(seq 1 60); do health_ok && return 0; sleep 1; done; return 1; }
mode_of() { stat -c '%a' "$1" 2>/dev/null || echo none; }
owner_of() { stat -c '%U' "$1" 2>/dev/null || echo none; }

preflight() {
  [[ -n $RMC_DIR && -n $INSTALL_ID ]] || die "preflight needs --rmc-dir and --installation-id."
  local given=$RMC_DIR
  RMC_DIR=$(realpath -e "$RMC_DIR" 2>/dev/null) || die "RMC directory not found."
  local me sock key sockdir keydir; me=$(id -un)
  sock=$RMC_DIR/run/gateway/gateway.sock; sockdir=$(dirname "$sock")
  key=$RMC_DIR/keys/gateway-hosts/lumen-host.key; keydir=$(dirname "$key")

  echo "== Lumen"
  [[ $(systemctl show -p User --value $UNIT 2>/dev/null) == "$me" ]] \
    && pass "$UNIT runs as $me (same uid/gid the gateway admits)" || fail "$UNIT does not run as $me"
  grep -q '_DENIED_STATUSES' "$PROJECT/backend/lumen/rmc/client.py" 2>/dev/null \
    && pass "checkout has the gateway-compatible adapter ($(git -C "$PROJECT" rev-parse --short HEAD 2>/dev/null || echo "not a git checkout"))" \
    || fail "checkout lacks the RMC adapter (check out PR #10)"
  if grep -Eq '^\s*(LUMEN_MEMORY_BACKEND|RMC_[A-Z_]+)\s*=' "$PROJECT/backend/.env" 2>/dev/null; then
    fail "backend/.env sets LUMEN_MEMORY_BACKEND or RMC_*; remove them so rollback stays one step"
  else pass "backend/.env does not set the memory backend"; fi
  health_ok && pass "Lumen API healthy" || fail "Lumen API not healthy at $API"
  [[ -f $DROPIN ]] && info "RMC drop-in already present: $DROPIN" || pass "no RMC drop-in yet (Supabase mode)"
  info "Supabase memory guard: $(guard_backend)"

  echo "== RMC installation $INSTALL_ID at $RMC_DIR"
  [[ $RMC_DIR != */rmc-lumen-rmc01 && ${given%/} != */rmc-lumen-rmc01 ]] || fail "lumen-rmc01 is the frozen certified install without a gateway; use the new installation"
  [[ $(owner_of "$RMC_DIR") == "$me" && $(mode_of "$RMC_DIR") == 700 ]] \
    && pass "install dir owner $me, 0700" || fail "install dir must be owned by $me with mode 0700"
  if [[ -x $RMC_DIR/.venv/bin/python && -f $RMC_DIR/app/scripts/rmc_installer.py ]]; then
    if "$RMC_DIR/.venv/bin/python" -I -B "$RMC_DIR/app/scripts/rmc_installer.py" status --install-dir "$RMC_DIR" \
         > "${TMPDIR:-/tmp}/lumen-rmc-status.$$" 2>&1; then
      pass "rmc_installer status (read-only) succeeded"
      grep -Ei 'gateway|socket|host' "${TMPDIR:-/tmp}/lumen-rmc-status.$$" | sed 's/^/      /' | head -12 || true
    else fail "rmc_installer status failed"; sed 's/^/      /' "${TMPDIR:-/tmp}/lumen-rmc-status.$$" | tail -5; fi
    rm -f "${TMPDIR:-/tmp}/lumen-rmc-status.$$"
  else fail "installed RMC venv or installer not found"; fi
  [[ $(owner_of "$sockdir") == "$me" && $(mode_of "$sockdir") == 700 ]] \
    && pass "gateway socket dir $me 0700" || fail "gateway socket dir must be $me 0700"
  [[ -S $sock && ! -L $sock && $(owner_of "$sock") == "$me" && $(mode_of "$sock") == 600 ]] \
    && pass "gateway socket $me 0600" || fail "gateway socket missing or not $me 0600"
  [[ -f $key && ! -L $key && $(owner_of "$key") == "$me" && $(mode_of "$key") == 600 ]] \
    && pass "lumen host key $me 0600 (enrolled with: gateway-host --host lumen)" || fail "lumen host key missing or unsafe: $key"
  [[ $(mode_of "$keydir") =~ ^7[0-5][0-5]$ && $(( 8#$(mode_of "$keydir") & 8#022 )) == 0 ]] \
    && pass "host key dir not group/world writable" || fail "host key dir is writable by others"
  local ports
  if ports=$(docker_cmd ps --filter "label=rmc.installation=$INSTALL_ID" --format '{{.Names}}|{{.Ports}}' 2>/dev/null); then
    grep -q -- '-gw|' <<<"$ports" && pass "gateway container running" || fail "no running gateway container for $INSTALL_ID"
    if awk -F'|' '$2 != "" {bad=1} END {exit !bad}' <<<"$ports"; then fail "an RMC container publishes a port"
    else pass "no RMC container publishes a port"; fi
  else fail "cannot list Docker containers (docker or sudo -n docker)"; fi
  # Liveness without admission: the gateway answers anything but POST with 405.
  if python3 -I - "$sock" <<'PY'
import socket, sys
s = socket.socket(socket.AF_UNIX); s.settimeout(5); s.connect(sys.argv[1])
s.sendall(b"GET / HTTP/1.1\r\nHost: rmc\r\nConnection: close\r\n\r\n")
sys.exit(0 if s.recv(64).split(b" ")[1:2] == [b"405"] else 1)
PY
  then pass "gateway answers on the socket (405 liveness, nothing admitted)"; else fail "gateway did not answer on the socket"; fi
  if (cd "$PROJECT/backend" && LUMEN_RMC_SOCK=$sock LUMEN_RMC_KEY=$key LUMEN_RMC_ID=$INSTALL_ID \
      .venv/bin/python - <<'PY'
import os, types
from lumen.rmc.client import load_config, validate_socket
cfg = load_config(types.SimpleNamespace(rmc_installation_id=os.environ["LUMEN_RMC_ID"],
    rmc_gateway_socket=os.environ["LUMEN_RMC_SOCK"], rmc_host_key_file=os.environ["LUMEN_RMC_KEY"],
    rmc_timeout_seconds=10))
validate_socket(cfg.socket_path)
PY
  ); then pass "Lumen adapter accepts this socket and key"; else fail "Lumen adapter refuses this socket or key"; fi

  echo
  if (( failures )); then echo "PREFLIGHT=FAIL ($failures)"; return 1; fi
  echo "PREFLIGHT=PASS"
}

status() {
  echo "lumen-api backend setting: $(systemctl show -p Environment --value $UNIT 2>/dev/null | tr ' ' '\n' | grep '^LUMEN_MEMORY_BACKEND=' || echo 'LUMEN_MEMORY_BACKEND unset (supabase)')"
  [[ -f $DROPIN ]] && echo "drop-in: $DROPIN" || echo "drop-in: none"
  echo "Supabase memory guard: $(guard_backend)"
  health_ok && echo "API: healthy" || echo "API: not healthy"
}

restart_api() {
  sudo systemctl daemon-reload
  sudo systemctl restart $UNIT
  wait_health
}

remove_dropin_and_restart() {
  if [[ -f $DROPIN ]]; then sudo rm -f -- "$DROPIN"; fi
  restart_api
}

set_guard() {
  psql_lumen -c "UPDATE public.lumen_memory_store SET backend = '$1', changed_at = now() WHERE singleton" >/dev/null
  [[ $(guard_backend) == "$1" ]]
}

activate() {
  [[ ${LUMEN_RMC_CONFIRM:-} == "activate:$INSTALL_ID" ]] || die "Owner confirmation required: LUMEN_RMC_CONFIRM=activate:$INSTALL_ID"
  preflight || die "Preflight failed; nothing was changed."
  local stamp backup before after
  stamp=$(date -u +%Y%m%dT%H%M%SZ); backup=$STATE_DIR/$stamp; mkdir -p -m 700 "$backup"
  systemctl show -p Environment --value $UNIT > "$backup/lumen-api.environment" 2>/dev/null || true
  [[ -f $DROPIN ]] && cp -p "$DROPIN" "$backup/" || true
  before=$(memory_counts); echo "$before" > "$backup/memory-counts.before"
  echo "Saved rollback evidence in $backup"

  abort() {
    echo "ACTIVATION_ABORTED: $1. Restoring Supabase mode." >&2
    remove_dropin_and_restart || echo "WARNING: lumen-api did not come back healthy; check: systemctl status $UNIT" >&2
    [[ $(guard_backend) == absent ]] || set_guard supabase || echo "WARNING: could not reset the memory guard" >&2
    exit 1
  }

  psql_lumen < "$GUARD_SQL" >/dev/null || abort "memory guard could not be applied"
  set_guard rmc || abort "memory guard row not set"

  local tmp; tmp=$(mktemp)
  cat > "$tmp" <<EOF
# Lumen memory backend: RMC ($INSTALL_ID). Remove with: scripts/lumen-rmc.sh rollback
[Service]
Environment="LUMEN_MEMORY_BACKEND=rmc"
Environment="RMC_INSTALLATION_ID=$INSTALL_ID"
Environment="RMC_GATEWAY_SOCKET=$RMC_DIR/run/gateway/gateway.sock"
Environment="RMC_HOST_KEY_FILE=$RMC_DIR/keys/gateway-hosts/lumen-host.key"
Environment="RMC_TIMEOUT_SECONDS=10"
EOF
  sudo install -d -m 755 "$DROPIN_DIR" && sudo install -m 644 "$tmp" "$DROPIN" || { rm -f "$tmp"; abort "drop-in not written"; }
  rm -f "$tmp"
  restart_api || abort "lumen-api not healthy after restart"
  systemctl show -p Environment --value $UNIT | tr ' ' '\n' | grep -qx 'LUMEN_MEMORY_BACKEND=rmc' || abort "lumen-api did not pick up the setting"
  after=$(memory_counts)
  [[ $after == "$before" ]] || abort "Supabase memory row counts changed during activation"
  echo "ACTIVATED: Lumen memory now uses RMC $INSTALL_ID. Supabase memories untouched ($after rows: memories suggestions revisions)."
  echo "Next: with a FICTIONAL test account, say 'Remember: Fictional Ada keeps a teal kayak named Pebble', then ask in a new chat."
}

rollback() {
  [[ -n $INSTALL_ID ]] || die "rollback needs --installation-id."
  [[ ${LUMEN_RMC_CONFIRM:-} == "rollback:$INSTALL_ID" ]] || die "Owner confirmation required: LUMEN_RMC_CONFIRM=rollback:$INSTALL_ID"
  # API first, so no Lumen process is still serving RMC mode when Supabase
  # writes are allowed again.
  remove_dropin_and_restart || die "lumen-api not healthy after removing the drop-in; guard left as is."
  if [[ $(guard_backend) == absent ]]; then echo "No memory guard present."
  else set_guard supabase || die "Could not reset the memory guard."; fi
  echo "ROLLED_BACK: Lumen memory uses Supabase again. RMC $INSTALL_ID and its memories are untouched."
}

case $cmd in
  preflight) preflight ;;
  status) status ;;
  activate) activate ;;
  rollback) rollback ;;
  *) sed -n '2,16p' "$0"; exit 2 ;;
esac

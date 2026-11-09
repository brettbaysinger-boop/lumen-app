#!/usr/bin/env bash
# Offline test of scripts/lumen-rmc.sh with stubbed systemctl/docker/sudo/curl,
# a real Unix socket that answers like the RMC gateway's liveness probe, and
# the real Lumen adapter checks. Touches no service, database or RMC install.
# Run as an ordinary (non-root) user: scripts/test-lumen-rmc-script.sh
set -euo pipefail
SRC=$(cd "$(dirname "$0")/.." && pwd)
PY=${LUMEN_TEST_PYTHON:-$(command -v python3)}
T=$(mktemp -d); chmod 700 "$T"; T=$(realpath "$T")
SERVER_PID=""
cleanup() { [[ -n $SERVER_PID ]] && kill "$SERVER_PID" 2>/dev/null || true; rm -rf "$T"; }
trap cleanup EXIT
fail=0; ok() { echo "PASS $1"; }; bad() { echo "FAIL $1"; fail=1; }

# --- fake Lumen checkout --------------------------------------------------
P=$T/project; mkdir -p "$P/scripts" "$P/supabase/rmc" "$P/backend/.venv/bin"
cp "$SRC/scripts/lumen-rmc.sh" "$P/scripts/"; cp "$SRC/supabase/config.toml" "$P/supabase/"
cp "$SRC/supabase/rmc/memory_store_guard.sql" "$P/supabase/rmc/"
ln -s "$SRC/backend/lumen" "$P/backend/lumen"; ln -s "$PY" "$P/backend/.venv/bin/python"; : > "$P/backend/.env"

# --- fake RMC installation (layout of the D01-16 installer) ----------------
R=$T/rmc-lumen-rmc02; ID=lumen-rmc02
mkdir -p -m 700 "$R" "$R/run" "$R/run/gateway" "$R/keys" "$R/keys/gateway-hosts" "$R/.venv/bin" "$R/app/scripts"
ln -s "$PY" "$R/.venv/bin/python"
printf 'print("gateway: running, socket ok, hosts: lumen")\n' > "$R/app/scripts/rmc_installer.py"
"$PY" -c 'import secrets;print(secrets.token_hex(32),end="")' > "$R/keys/gateway-hosts/lumen-host.key"
chmod 600 "$R/keys/gateway-hosts/lumen-host.key"
SOCK=$R/run/gateway/gateway.sock
"$PY" - "$SOCK" <<'PY' &
import os, socket, sys
s = socket.socket(socket.AF_UNIX); s.bind(sys.argv[1]); os.chmod(sys.argv[1], 0o600); s.listen(8)
while True:
    c, _ = s.accept(); c.recv(4096)
    c.sendall(b'HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 20\r\n\r\n{"outcome":"denied"}'); c.close()
PY
SERVER_PID=$!
for _ in $(seq 50); do [[ -S $SOCK ]] && break; sleep 0.1; done

# --- stubs ----------------------------------------------------------------
S=$T/state; B=$T/bin; mkdir -p "$S" "$B" "$T/dropin"; : > "$S/env"; echo "3 1 0" > "$S/counts"
printf '%s\n' "$ID-g1-db|" "$ID-g1-hs|" "$ID-g1-gw|" > "$S/ps"
cat > "$B/systemctl" <<EOF
#!/usr/bin/env bash
echo "systemctl \$*" >> "$S/calls"
case "\$*" in
  "show -p User --value lumen-api") id -un ;;
  "show -p Environment --value lumen-api") cat "$S/env" ;;
  "restart lumen-api") f=$T/dropin/60-lumen-rmc.conf
     if [[ -f \$f ]]; then sed -n 's/^Environment="\(.*\)"$/\1/p' "\$f" | tr '\n' ' ' > "$S/env"; else : > "$S/env"; fi ;;
esac
EOF
cat > "$B/sudo" <<'EOF'
#!/usr/bin/env bash
[[ ${1:-} == -n ]] && shift
exec "$@"
EOF
cat > "$B/curl" <<EOF
#!/usr/bin/env bash
[[ -f "$S/health_fail" ]] && grep -q LUMEN_MEMORY_BACKEND=rmc "$S/env" && exit 22
exit 0
EOF
cat > "$B/docker" <<EOF
#!/usr/bin/env bash
case "\$1" in
  info) exit 0 ;;
  ps) cat "$S/ps"; exit 0 ;;
  exec) ;;
  *) exit 1 ;;
esac
sql=""; while [[ \$# -gt 0 ]]; do [[ \$1 == -c ]] && { sql=\$2; break; }; shift; done
if [[ -z \$sql ]]; then cat > /dev/null; [[ -f "$S/guard" ]] || echo supabase > "$S/guard"; exit 0; fi
case "\$sql" in
  *to_regclass*) [[ -f "$S/guard" ]] && cat "$S/guard" || echo absent ;;
  *"SET backend = 'rmc'"*) echo rmc > "$S/guard" ;;
  *"SET backend = 'supabase'"*) echo supabase > "$S/guard" ;;
  *"count(*)"*) cat "$S/counts" ;;
esac
EOF
chmod +x "$B"/*
run() { env PATH="$B:$PATH" HOME="$T/home" LUMEN_RMC_DROPIN_DIR="$T/dropin" "$P/scripts/lumen-rmc.sh" "$@"; }
mkdir -p "$T/home"
guard() { cat "$S/guard" 2>/dev/null || echo absent; }

# --- scenarios ------------------------------------------------------------
out=$(run preflight --rmc-dir "$R" --installation-id $ID 2>&1) && grep -q PREFLIGHT=PASS <<<"$out" && { [[ -z ${VERBOSE:-} ]] || echo "$out"; } \
  && ok "preflight passes on a correct installation" || { bad "preflight should pass"; echo "$out"; }

out=$(run activate --rmc-dir "$R" --installation-id $ID 2>&1) && bad "activate ran without confirmation" \
  || { [[ ! -f $T/dropin/60-lumen-rmc.conf && $(guard) == absent ]] && ok "activate refuses without LUMEN_RMC_CONFIRM; nothing changed" || bad "changed without confirmation"; }

out=$(LUMEN_RMC_CONFIRM=activate:other run activate --rmc-dir "$R" --installation-id $ID 2>&1) \
  && bad "activate accepted confirmation for another id" || ok "activate refuses a confirmation for another installation"

out=$(LUMEN_RMC_CONFIRM=activate:$ID run activate --rmc-dir "$R" --installation-id $ID 2>&1) && grep -q ACTIVATED <<<"$out" \
  && grep -q "RMC_GATEWAY_SOCKET=$SOCK" "$T/dropin/60-lumen-rmc.conf" && grep -q "LUMEN_MEMORY_BACKEND=rmc" "$S/env" && [[ $(guard) == rmc ]] \
  && ok "activate: guard=rmc, drop-in written, lumen-api restarted with RMC settings" || { bad "activate"; echo "$out"; }
grep -q "RMC_HOST_KEY_FILE=$R/keys/gateway-hosts/lumen-host.key" "$T/dropin/60-lumen-rmc.conf" \
  && ! grep -q "$(cat "$R/keys/gateway-hosts/lumen-host.key")" "$T/dropin/60-lumen-rmc.conf" \
  && ok "drop-in names the key file and never contains the key" || bad "drop-in key handling"
ls "$T/home/.local/state/lumen-rmc/"*/memory-counts.before >/dev/null 2>&1 && ok "rollback evidence saved" || bad "no rollback evidence"

out=$(run status 2>&1); grep -q "LUMEN_MEMORY_BACKEND=rmc" <<<"$out" && grep -q "guard: rmc" <<<"$out" && ok "status reports RMC mode" || bad "status"

out=$(run rollback --installation-id $ID 2>&1) && bad "rollback ran without confirmation" || ok "rollback refuses without confirmation"
out=$(LUMEN_RMC_CONFIRM=rollback:$ID run rollback --installation-id $ID 2>&1) && grep -q ROLLED_BACK <<<"$out" \
  && [[ ! -f $T/dropin/60-lumen-rmc.conf && $(guard) == supabase && ! -s $S/env ]] \
  && ok "rollback: drop-in removed, lumen-api restarted in Supabase mode, guard=supabase" || { bad "rollback"; echo "$out"; }
[[ $(grep -n 'restart lumen-api' "$S/calls" | tail -1 | cut -d: -f1) -gt 0 ]] && ok "rollback restarted the API" || bad "no restart"

touch "$S/health_fail"
out=$(LUMEN_RMC_CONFIRM=activate:$ID run activate --rmc-dir "$R" --installation-id $ID 2>&1) && bad "activation succeeded with an unhealthy API" \
  || { grep -q ACTIVATION_ABORTED <<<"$out" && [[ ! -f $T/dropin/60-lumen-rmc.conf && $(guard) == supabase ]] \
       && ok "unhealthy API after restart: activation aborted and Supabase mode restored" || { bad "abort path"; echo "$out"; }; }
rm -f "$S/health_fail"

echo "4 1 0" > "$S/counts.next"
# Counts change between before/after: the stub flips counts on the first restart.
sed -i "s|  \"restart lumen-api\") f=|  \"restart lumen-api\") [[ -f $S/counts.next ]] \&\& mv $S/counts.next $S/counts; f=|" "$B/systemctl"
out=$(LUMEN_RMC_CONFIRM=activate:$ID run activate --rmc-dir "$R" --installation-id $ID 2>&1) && bad "activation ignored a Supabase row-count change" \
  || { grep -q "row counts changed" <<<"$out" && [[ $(guard) == supabase ]] && ok "Supabase row-count change aborts activation" || { bad "count check"; echo "$out"; }; }

expect_preflight_fail() {
  local what=$1; local out
  out=$(run preflight --rmc-dir "${2:-$R}" --installation-id $ID 2>&1) && { bad "preflight passed with $what"; return; }
  grep -q PREFLIGHT=FAIL <<<"$out" && ok "preflight fails: $what" || { bad "preflight $what"; echo "$out"; }
}
chmod 666 "$SOCK"; expect_preflight_fail "socket mode 0666"; chmod 600 "$SOCK"
chmod 750 "$R/run/gateway"; expect_preflight_fail "socket dir 0750"; chmod 700 "$R/run/gateway"
chmod 640 "$R/keys/gateway-hosts/lumen-host.key"; expect_preflight_fail "host key 0640"; chmod 600 "$R/keys/gateway-hosts/lumen-host.key"
echo "$ID-g1-hs|0.0.0.0:8888->8888/tcp" >> "$S/ps"; expect_preflight_fail "a published Hindsight port"; sed -i '$d' "$S/ps"
sed -i "/-gw|/d" "$S/ps"; expect_preflight_fail "no gateway container"; echo "$ID-g1-gw|" >> "$S/ps"
echo "LUMEN_MEMORY_BACKEND=rmc" > "$P/backend/.env"; expect_preflight_fail "backend/.env setting the backend"; : > "$P/backend/.env"
ln -s "$R" "$T/rmc-lumen-rmc01"; expect_preflight_fail "the frozen lumen-rmc01 path" "$T/rmc-lumen-rmc01"
kill "$SERVER_PID"; SERVER_PID=""; expect_preflight_fail "gateway not answering"
out=$(run preflight --rmc-dir "$R" --installation-id 'bad id;rm' 2>&1) && bad "accepted a bad id" || ok "rejects a malformed installation id"
exit $fail

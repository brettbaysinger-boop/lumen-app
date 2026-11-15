#!/usr/bin/env bash
# Offline test of scripts/animated-deploy.sh: two real git checkouts made here, and stand-ins
# for systemctl, sudo, curl, npx and id. Touches no service and no real checkout.
set -euo pipefail
SRC=$(cd "$(dirname "$0")/.." && pwd)
T=$(mktemp -d); T=$(realpath "$T"); trap 'rm -rf "$T"' EXIT
fail=0; ok() { echo "PASS $1"; }; bad() { echo "FAIL $1"; fail=1; }
g() { git -c user.name=t -c user.email=t@example.invalid -c commit.gpgsign=false "$@"; }

# --- a fictional "live" checkout with local edits, and a reviewed clone one commit ahead -----
L=$T/live; C=$T/clone; mkdir -p "$L/scripts" "$L/supabase" "$L/backend"
echo "v1" > "$L/scripts/lumen-rmc.sh"; echo 'project_id = "fictional"' > "$L/supabase/config.toml"; echo a > "$L/backend/app.py"
printf 'dist\n.env\nnode_modules\n' > "$L/.gitignore"
g -C "$L" init -q; g -C "$L" add -A; g -C "$L" commit -q -m live
g clone -q "$L" "$C"; mkdir -p "$C/scripts" "$C/node_modules"; cp "$SRC/scripts/animated-deploy.sh" "$C/scripts/"
echo b > "$C/backend/avatar.py"; g -C "$C" add -A; g -C "$C" commit -q -m animated
echo "local edit" >> "$L/scripts/lumen-rmc.sh"; echo "# local" >> "$L/supabase/config.toml"   # must survive everything
echo "EXPO_PUBLIC_X=fictional" > "$L/.env"; mkdir "$L/dist"; echo old > "$L/dist/index.html"
PREV=$(git -C "$L" rev-parse HEAD); TARGET=$(git -C "$C" rev-parse HEAD)
edits() { cat "$L/scripts/lumen-rmc.sh" "$L/supabase/config.toml" | sha256sum; }; EDITS=$(edits)

# --- stand-ins ------------------------------------------------------------------------------
S=$T/state; B=$T/bin; D=$T/dropins; H=$T/home; mkdir -p "$S" "$B" "$D" "$H/.config/lumen-avatar"
printf '[Service]\nEnvironment="LUMEN_MEMORY_BACKEND=rmc"\n' > "$D/60-lumen-rmc.conf"
echo 'LUMEN_MEMORY_BACKEND=rmc RMC_INSTALLATION_ID=lumen-rmc02 RMC_GATEWAY_SOCKET=/fictional/gateway.sock' > "$S/env"
(umask 077; printf '%064d\n' 0 > "$H/.config/lumen-avatar/secret")
cat > "$B/systemctl" <<STUB
#!/usr/bin/env bash
echo "systemctl \$*" >> "$S/calls"
case "\$*" in
  "show -p User --value lumen-api") echo fictional ;;
  "show -p Environment --value lumen-api") cat "$S/env" ;;
  "cat lumen-web.service") [[ -f "$S/expo" ]] && echo "ExecStart=node expo start" || echo "ExecStart=node $L/scripts/serve-web.cjs" ;;
  restart*) [[ -f "$D/70-lumen-avatar.conf" ]] && touch "$S/avatar_on" || rm -f "$S/avatar_on"; [[ -f "$L/backend/avatar.py" ]] && touch "$S/code_new" || rm -f "$S/code_new" ;;
esac
STUB
printf '#!/usr/bin/env bash\n[[ ${1:-} == -n ]] && shift\nexec "$@"\n' > "$B/sudo"
printf '#!/usr/bin/env bash\ncase "$1" in -u) echo 1000 ;; *) echo fictional ;; esac\n' > "$B/id"
cat > "$B/curl" <<STUB
#!/usr/bin/env bash
case "\$*" in
  */health*) [[ -f "$S/unhealthy" && -f "$S/avatar_on" ]] && exit 22; exit 0 ;;
  */v0.1/avatar/status*) [[ -f "$S/code_new" ]] && printf 401 || printf 404 ;;
  *X-Lumen-Avatar-Key*) [[ -f "$S/bridge_down" ]] && exit 7; printf 200 ;;
  */liveness*) printf 401 ;;
esac
STUB
cat > "$B/npx" <<STUB
#!/usr/bin/env bash
[[ -f "$S/build_fails" ]] && exit 1
mkdir -p dist; echo "new \$(cat .env)" > dist/index.html
STUB
chmod +x "$B"/*
run() { env PATH="$B:$PATH" HOME="$H" XDG_STATE_HOME="$H/state" LIVE_DIR="$L" LUMEN_ANIMATED_DROPIN_DIR="$D" LUMEN_ANIMATED_WAIT=1 \
        AVATAR_URL=http://100.64.0.9:8283 "$@" bash "$C/scripts/animated-deploy.sh" "${MODE[@]}" 2>&1; }
restarts() { grep -c '^systemctl restart' "$S/calls" 2>/dev/null || true; }
unchanged() { [[ $(git -C "$L" rev-parse HEAD) == "$PREV" && $(cat "$L/dist/index.html") == old && ! -e "$D/70-lumen-avatar.conf" && $(edits) == "$EDITS" ]]; }

MODE=(check); out=$(run env) && grep -q '^READY' <<<"$out" && ! grep -q FAIL <<<"$out" && unchanged && [[ $(restarts) == 0 ]] \
  && ok "check: ready, read-only" || { bad "check"; echo "$out"; }
MODE=(cutover); out=$(run env) || true; grep -q 'Owner confirmation missing' <<<"$out" && unchanged && ok "cutover refuses without confirmation" || bad "confirmation"
touch "$S/bridge_down"; out=$(run env LUMEN_ANIMATED_CONFIRM=cutover:${TARGET:0:7}) || true; rm "$S/bridge_down"
grep -q 'Nothing was changed' <<<"$out" && unchanged && ok "cutover refuses when the bridge is down" || { bad "bridge down"; echo "$out"; }
touch "$S/build_fails"; out=$(run env LUMEN_ANIMATED_CONFIRM=cutover:${TARGET:0:7}) || true; rm "$S/build_fails"
grep -q 'web build failed' <<<"$out" && unchanged && [[ $(restarts) == 0 ]] && ok "a failed web build changes nothing live" || { bad "build failure"; echo "$out"; }
touch "$S/unhealthy"; out=$(run env LUMEN_ANIMATED_CONFIRM=cutover:${TARGET:0:7}) || true; rm "$S/unhealthy"
grep -q 'going back' <<<"$out" && unchanged && [[ ! -e $H/.config/lumen-avatar/lumen-api.env ]] && ok "an unhealthy API after cutover is rolled back by itself" || { bad "auto rollback"; echo "$out"; }

out=$(run env LUMEN_ANIMATED_CONFIRM=cutover:${TARGET:0:7}) || { bad "cutover run"; echo "$out"; }
[[ $(git -C "$L" rev-parse HEAD) == "$TARGET" && $(edits) == "$EDITS" ]] && ok "cutover: live checkout fast-forwarded, local edits intact" || bad "cutover code"
[[ $(cat "$L/dist/index.html") == "new EXPO_PUBLIC_X=fictional" ]] && ok "cutover: web build made with the live settings" || bad "cutover web"
F=$H/.config/lumen-avatar/lumen-api.env
grep -q "EnvironmentFile=$F" "$D/70-lumen-avatar.conf" && ! grep -q 0000000000 "$D/70-lumen-avatar.conf" && [[ $(stat -c %a "$F") == 600 ]] \
  && grep -q '^AVATAR_URL=http://100.64.0.9:8283$' "$F" && ok "cutover: drop-in names a private settings file; the secret is not in the drop-in" || bad "cutover settings"
grep -q 'LUMEN_MEMORY_BACKEND=rmc' "$D/60-lumen-rmc.conf" && [[ $(ls "$D" | wc -l) == 2 ]] && ! grep -q 0000000000 <<<"$out" \
  && ok "cutover: RMC drop-in untouched, secret not printed" || bad "cutover rmc"
out=$(run env LUMEN_ANIMATED_CONFIRM=cutover:${TARGET:0:7}) || true; grep -q 'already recorded' <<<"$out" && ok "a second cutover is refused" || bad "second cutover"
MODE=(status); out=$(run env); grep -q 'animated mode: configured' <<<"$out" && grep -q 'HTTP 401' <<<"$out" && ok "status" || { bad "status"; echo "$out"; }
MODE=(disable); out=$(run env); [[ ! -e "$D/70-lumen-avatar.conf" && ! -e $F && $(git -C "$L" rev-parse HEAD) == "$TARGET" ]] && ok "disable: mode off, code stays" || bad "disable"
MODE=(enable); out=$(run env); [[ -e "$D/70-lumen-avatar.conf" ]] && ok "enable" || bad "enable"
MODE=(rollback); out=$(run env) || true; grep -q 'Owner confirmation missing' <<<"$out" && ok "rollback refuses without confirmation" || bad "rollback confirmation"
out=$(run env LUMEN_ANIMATED_CONFIRM=rollback) || { bad "rollback run"; echo "$out"; }
unchanged && grep -q 'LUMEN_MEMORY_BACKEND=rmc' "$D/60-lumen-rmc.conf" && ok "rollback: commit, web build, settings and local edits exactly as before" || { bad "rollback"; echo "$out"; }

# memory settings changing during cutover must undo it
sed -i 's|restart\*)|restart*) [[ -f "'"$S"'/drift" ]] \&\& echo LUMEN_MEMORY_BACKEND=supabase > "'"$S"'/env";|' "$B/systemctl"
touch "$S/drift"; MODE=(cutover); out=$(run env LUMEN_ANIMATED_CONFIRM=cutover:${TARGET:0:7}) || true; rm "$S/drift"
grep -q 'going back' <<<"$out" && unchanged && ok "a change in the memory settings undoes the cutover" || { bad "memory drift"; echo "$out"; }
echo 'LUMEN_MEMORY_BACKEND=rmc RMC_INSTALLATION_ID=lumen-rmc02 RMC_GATEWAY_SOCKET=/fictional/gateway.sock' > "$S/env"

# a local edit that the new commit would touch is refused up front
echo "local" >> "$L/backend/app.py"; echo c >> "$C/backend/app.py"; g -C "$C" commit -q -am touch; MODE=(check)
out=$(run env) || true; grep -q 'locally edited files would be touched: backend/app.py' <<<"$out" && ok "check refuses when a local edit would be touched" || { bad "local edit"; echo "$out"; }
[[ $fail == 0 ]] && echo "ALL PASS" || { echo "SOME FAILED"; exit 1; }

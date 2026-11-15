#!/usr/bin/env bash
# Offline test of scripts/animated-api-update.sh: two git checkouts made here and stand-ins for
# systemctl, sudo, curl, npx and id. Touches no service and no real checkout.
set -euo pipefail
SRC=$(cd "$(dirname "$0")/.." && pwd)
T=$(mktemp -d); T=$(realpath "$T"); trap 'rm -rf "$T"' EXIT
fail=0; ok() { echo "PASS $1"; }; bad() { echo "FAIL $1"; fail=1; }
g() { git -c user.name=t -c user.email=t@example.invalid -c commit.gpgsign=false "$@"; }

L=$T/live; C=$T/clone; mkdir -p "$L/scripts" "$L/backend/lumen" "$L/components"
echo v1 > "$L/scripts/lumen-rmc.sh"; echo routes-v1 > "$L/backend/lumen/avatar.py"; echo memory > "$L/backend/lumen/memory.py"; echo small > "$L/components/AnimatedCompanion.tsx"
printf 'dist\n.env\nnode_modules\n' > "$L/.gitignore"
g -C "$L" init -q; g -C "$L" add -A; g -C "$L" commit -q -m live
g clone -q "$L" "$C"; mkdir -p "$C/node_modules"; cp "$SRC/scripts/animated-web-update.sh" "$SRC/scripts/animated-api-update.sh" "$C/scripts/"
echo scenes > "$C/components/AnimatedScenes.tsx"; echo routes-v2 > "$C/backend/lumen/avatar.py"; g -C "$C" add -A; g -C "$C" commit -q -m "scene selector"
echo "local edit" >> "$L/scripts/lumen-rmc.sh"
echo "EXPO_PUBLIC_X=fictional" > "$L/.env"; mkdir "$L/dist"; echo old > "$L/dist/index.html"
PREV=$(git -C "$L" rev-parse HEAD); TARGET=$(git -C "$C" rev-parse HEAD); EDITS=$(sha256sum < "$L/scripts/lumen-rmc.sh")

S=$T/state; B=$T/bin; H=$T/home; D=$T/dropins; mkdir -p "$S" "$B" "$H" "$D"
echo "[Service] fictional rmc" > "$D/60-lumen-rmc.conf"; echo "[Service] fictional avatar" > "$D/70-lumen-avatar.conf"
DROPINS=$(cat "$D"/* | sha256sum)
cat > "$B/systemctl" <<STUB
#!/usr/bin/env bash
echo "systemctl \$*" >> "$S/calls"
[[ "\$*" == "cat lumen-web.service" ]] && echo "ExecStart=node $L/scripts/serve-web.cjs"
[[ "\$*" == "show -p Environment --value lumen-api" ]] && { [[ -f "$S/memory_changed" && \$(cat "$L/backend/lumen/avatar.py") == routes-v2 ]] && echo "LUMEN_MEMORY_BACKEND=other" || echo "LUMEN_MEMORY_BACKEND=rmc RMC_SOCKET=/run/fictional"; }
[[ "\$1" == restart ]] && cp "$L/backend/lumen/avatar.py" "$S/running"   # the code lumen-api now runs
exit 0
STUB
printf '#!/usr/bin/env bash\necho "sudo $*" >> "%s/calls"\nexec "$@"\n' "$S" > "$B/sudo"
printf '#!/usr/bin/env bash\ncase "$1" in -u) echo 1000 ;; *) echo fictional ;; esac\n' > "$B/id"
cat > "$B/curl" <<STUB
#!/usr/bin/env bash
case "\$*" in
  */health*) [[ -f "$S/unhealthy" && \$(cat "$S/running") == routes-v2 ]] && exit 22; exit 0 ;;
  */v0.1/avatar/scenes*) [[ \$(cat "$S/running") == routes-v2 ]] && printf 401 || printf 404 ;;
  */v0.1/avatar/status*) printf 401 ;;
  *) [[ -f "$L/dist/index.html" ]] && printf 200 || printf 404 ;;
esac
STUB
cat > "$B/npx" <<'STUB'
#!/usr/bin/env bash
mkdir -p dist/_expo/static/js/web
echo "new <script src=\"/_expo/static/js/web/entry-abc.js\" defer></script>" > dist/index.html; echo bundle > dist/_expo/static/js/web/entry-abc.js
STUB
chmod +x "$B"/*; cp "$L/backend/lumen/avatar.py" "$S/running"
run() { env PATH="$B:$PATH" HOME="$H" XDG_STATE_HOME="$H/state" LIVE_DIR="$L" LUMEN_ANIMATED_DROPIN_DIR="$D" LUMEN_ANIMATED_WAIT=1 "$@" bash "$C/scripts/animated-api-update.sh" "${MODE[@]}" 2>&1; }
before() { [[ $(git -C "$L" rev-parse HEAD) == "$PREV" && $(cat "$L/dist/index.html") == old && $(sha256sum < "$L/scripts/lumen-rmc.sh") == "$EDITS" && $(cat "$S/running") == routes-v1 && $(cat "$D"/* | sha256sum) == "$DROPINS" ]]; }
restarts() { grep -c '^sudo systemctl restart' "$S/calls" 2>/dev/null || true; }
only_api() { ! grep -E '^sudo ' "$S/calls" | grep -qv '^sudo systemctl restart lumen-api$'; }
CONFIRM=LUMEN_API_UPDATE_CONFIRM=update:${TARGET:0:7}

MODE=(check); out=$(run env) && grep -q '^READY' <<<"$out" && grep -q 'web app and avatar routes only' <<<"$out" && before && [[ $(restarts) == 0 ]] && ok "check: ready, read-only" || { bad "check"; echo "$out"; }
MODE=(update); out=$(run env) || true; grep -q 'Owner confirmation missing' <<<"$out" && before && ok "update refuses without confirmation" || bad "confirmation"
touch "$S/unhealthy"; out=$(run env $CONFIRM) || true; rm "$S/unhealthy"
grep -q 'going back' <<<"$out" && before && [[ $(restarts) == 2 ]] && ok "an unhealthy lumen-api after the restart: code, build and service go back by themselves" || { bad "auto undo"; echo "$out"; }
touch "$S/memory_changed"; out=$(run env $CONFIRM) || true; rm "$S/memory_changed"
grep -q 'going back' <<<"$out" && before && ok "changed memory settings after the restart: everything goes back" || { bad "memory guard"; echo "$out"; }
: > "$S/calls"; out=$(run env $CONFIRM) || { bad "update run"; echo "$out"; }
[[ $(git -C "$L" rev-parse HEAD) == "$TARGET" && $(cat "$L/dist/index.html") == new* && $(cat "$S/running") == routes-v2 && $(sha256sum < "$L/scripts/lumen-rmc.sh") == "$EDITS" ]] && ok "update: new code and build live, lumen-api running it, local edits intact" || { bad "update"; echo "$out"; }
[[ $(restarts) == 1 ]] && only_api && [[ $(cat "$D"/* | sha256sum) == "$DROPINS" ]] && ok "update: exactly one restart, of lumen-api only; drop-ins untouched" || { bad "restart scope"; cat "$S/calls"; }
MODE=(status); out=$(run env); grep -q 'HTTP 401' <<<"$out" && ok "status" || { bad "status"; echo "$out"; }
MODE=(rollback); out=$(run env) || true; grep -q 'Owner confirmation missing' <<<"$out" && ok "rollback refuses without confirmation" || bad "rollback confirmation"
out=$(run env LUMEN_API_UPDATE_CONFIRM=rollback) || { bad "rollback run"; echo "$out"; }
before && only_api && ok "rollback: earlier code and build back, lumen-api running them" || { bad "rollback"; echo "$out"; }

# anything beyond the web app and the avatar routes is refused, here and by the plain web updater
MODE=(check); echo changed > "$C/backend/lumen/memory.py"; g -C "$C" commit -q -am memory
out=$(run env) || true; grep -q '^NOT READY' <<<"$out" && grep -q 'backend/lumen/memory.py' <<<"$out" && ok "refuses a commit that changes any other backend file" || { bad "other backend"; echo "$out"; }
g -C "$C" reset -q --hard HEAD~1
out=$(env PATH="$B:$PATH" HOME="$H" XDG_STATE_HOME="$H/state" LIVE_DIR="$L" bash "$C/scripts/animated-web-update.sh" check 2>&1) || true
grep -q 'not a frontend-only change' <<<"$out" && grep -q 'backend/lumen/avatar.py' <<<"$out" && ok "the frontend-only updater still refuses this step" || { bad "web updater"; echo "$out"; }
[[ $fail == 0 ]] && echo "ALL PASS" || { echo "SOME FAILED"; exit 1; }

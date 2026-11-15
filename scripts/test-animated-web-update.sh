#!/usr/bin/env bash
# Offline test of scripts/animated-web-update.sh: two git checkouts made here and stand-ins for
# systemctl, curl, npx, id and sudo. Touches no service and no real checkout.
set -euo pipefail
SRC=$(cd "$(dirname "$0")/.." && pwd)
T=$(mktemp -d); T=$(realpath "$T"); trap 'rm -rf "$T"' EXIT
fail=0; ok() { echo "PASS $1"; }; bad() { echo "FAIL $1"; fail=1; }
g() { git -c user.name=t -c user.email=t@example.invalid -c commit.gpgsign=false "$@"; }

L=$T/live; C=$T/clone; mkdir -p "$L/scripts" "$L/supabase" "$L/backend" "$L/components"
echo v1 > "$L/scripts/lumen-rmc.sh"; echo 'project_id = "fictional"' > "$L/supabase/config.toml"; echo a > "$L/backend/app.py"; echo small > "$L/components/AnimatedCompanion.tsx"
printf 'dist\n.env\nnode_modules\n' > "$L/.gitignore"
g -C "$L" init -q; g -C "$L" add -A; g -C "$L" commit -q -m live
g clone -q "$L" "$C"; mkdir -p "$C/node_modules"; cp "$SRC/scripts/animated-web-update.sh" "$C/scripts/"
echo large > "$C/components/AnimatedCompanion.tsx"; g -C "$C" add -A; g -C "$C" commit -q -m "display size"
echo "local edit" >> "$L/scripts/lumen-rmc.sh"; echo "# local" >> "$L/supabase/config.toml"
echo "EXPO_PUBLIC_X=fictional" > "$L/.env"; mkdir "$L/dist"; echo old > "$L/dist/index.html"
PREV=$(git -C "$L" rev-parse HEAD); TARGET=$(git -C "$C" rev-parse HEAD)
edits() { cat "$L/scripts/lumen-rmc.sh" "$L/supabase/config.toml" | sha256sum; }; EDITS=$(edits)

S=$T/state; B=$T/bin; H=$T/home; mkdir -p "$S" "$B" "$H"
cat > "$B/systemctl" <<STUB
#!/usr/bin/env bash
echo "systemctl \$*" >> "$S/calls"
[[ "\$*" == "cat lumen-web.service" ]] && { [[ -f "$S/expo" ]] && echo "ExecStart=node expo start" || echo "ExecStart=node $L/scripts/serve-web.cjs"; }
exit 0
STUB
printf '#!/usr/bin/env bash\necho "sudo $*" >> "%s/calls"\n' "$S" > "$B/sudo"
printf '#!/usr/bin/env bash\ncase "$1" in -u) echo 1000 ;; *) echo fictional ;; esac\n' > "$B/id"
cat > "$B/curl" <<STUB
#!/usr/bin/env bash
[[ -f "$S/web_broken" && \$(cat "$L/dist/index.html" 2>/dev/null) == new* ]] && { printf 500; exit 0; }
[[ -f "$L/dist/index.html" ]] && printf 200 || printf 404
STUB
cat > "$B/npx" <<STUB
#!/usr/bin/env bash
[[ -f "$S/build_fails" ]] && exit 1
echo "npx \$*" >> "$S/calls"
mkdir -p dist/_expo/static/js/web
echo "new \$(cat components/AnimatedCompanion.tsx) \$(cat .env) <script src=\"/_expo/static/js/web/entry-abc.js\" defer></script>" > dist/index.html
if [[ -f "$S/stale_cache" ]]; then echo "require('$L/components/AnimatedCompanion.tsx')" > dist/_expo/static/js/web/entry-abc.js
elif [[ ! -f "$S/no_bundle" ]]; then echo "bundle" > dist/_expo/static/js/web/entry-abc.js; fi
STUB
chmod +x "$B"/*
run() { env PATH="$B:$PATH" HOME="$H" XDG_STATE_HOME="$H/state" LIVE_DIR="$L" "$@" bash "$C/scripts/animated-web-update.sh" "${MODE[@]}" 2>&1; }
unchanged() { [[ $(git -C "$L" rev-parse HEAD) == "$PREV" && $(cat "$L/dist/index.html") == old && $(edits) == "$EDITS" && ! -e "$L/dist.incoming" ]]; }
quiet() { ! grep -Eq 'restart|reload|sudo|stop|start ' "$S/calls" 2>/dev/null; }
CONFIRM=LUMEN_WEB_UPDATE_CONFIRM=update:${TARGET:0:7}

MODE=(check); out=$(run env) && grep -q '^READY' <<<"$out" && unchanged && ok "check: ready, read-only" || { bad "check"; echo "$out"; }
MODE=(update); out=$(run env) || true; grep -q 'Owner confirmation missing' <<<"$out" && unchanged && ok "update refuses without confirmation" || bad "confirmation"
touch "$S/build_fails"; out=$(run env $CONFIRM) || true; rm "$S/build_fails"
grep -q 'web build failed' <<<"$out" && unchanged && ok "a failed build changes nothing live" || { bad "build failure"; echo "$out"; }
touch "$S/stale_cache"; out=$(run env $CONFIRM) || true; rm "$S/stale_cache"
grep -q 'stale bundler cache' <<<"$out" && unchanged && ok "a build carrying another checkout's module paths is refused" || { bad "stale cache"; echo "$out"; }
touch "$S/no_bundle"; out=$(run env $CONFIRM) || true; rm "$S/no_bundle"
grep -q 'missing or empty' <<<"$out" && unchanged && ok "a build whose script is missing is refused" || { bad "missing bundle"; echo "$out"; }
grep -q 'npx expo export --platform web --clear' "$S/calls" && ok "the export always starts from a cleared bundler cache" || bad "clear"
touch "$S/web_broken"; out=$(run env $CONFIRM) || true; rm "$S/web_broken"
grep -q 'going back' <<<"$out" && unchanged && ok "a web app that does not answer after the swap is put back by itself" || { bad "auto undo"; echo "$out"; }
touch "$S/expo"; out=$(run env $CONFIRM) || true; rm "$S/expo"
grep -q 'Nothing was changed' <<<"$out" && unchanged && ok "refuses when lumen-web does not serve the exported build" || { bad "expo"; echo "$out"; }

out=$(run env $CONFIRM) || { bad "update run"; echo "$out"; }
[[ $(git -C "$L" rev-parse HEAD) == "$TARGET" && $(edits) == "$EDITS" ]] && ok "update: live checkout fast-forwarded, local edits intact" || bad "update code"
[[ $(cat "$L/dist/index.html") == "new large EXPO_PUBLIC_X=fictional "* && -s "$L/dist/_expo/static/js/web/entry-abc.js" ]] && ok "update: new build made with the live settings is served" || bad "update web"
quiet && ok "update: no service restarted, no sudo used" || { bad "quiet"; cat "$S/calls"; }
MODE=(status); out=$(run env); grep -q "rollback returns to ${PREV:0:12}" <<<"$out" && ok "status" || { bad "status"; echo "$out"; }
MODE=(check); out=$(run env) || true; grep -q 'nothing to update' <<<"$out" && ok "check after the update: nothing to do" || bad "repeat check"
MODE=(rollback); out=$(run env) || true; grep -q 'Owner confirmation missing' <<<"$out" && ok "rollback refuses without confirmation" || bad "rollback confirmation"
out=$(run env LUMEN_WEB_UPDATE_CONFIRM=rollback) || { bad "rollback run"; echo "$out"; }
unchanged && quiet && ok "rollback: earlier build and commit back, local edits intact, nothing restarted" || { bad "rollback"; echo "$out"; }
MODE=(update); out=$(run env $CONFIRM) || true; MODE=(rollback)
[[ $(cat "$L/dist/index.html") == new* ]] && out=$(run env LUMEN_WEB_UPDATE_CONFIRM=rollback) && unchanged && ok "update and rollback can be repeated" || { bad "repeat"; echo "$out"; }

# anything beyond the web app is refused
echo b >> "$C/backend/app.py"; g -C "$C" commit -q -am backend; MODE=(check)
out=$(run env) || true; grep -q 'not a frontend-only change' <<<"$out" && grep -q 'backend/app.py' <<<"$out" && ok "refuses a commit that changes the backend" || { bad "backend"; echo "$out"; }
g -C "$C" reset -q --hard HEAD~1; echo x > "$C/package.json"; g -C "$C" add -A; g -C "$C" commit -q -m deps
out=$(run env) || true; grep -q 'package.json' <<<"$out" && ok "refuses a commit that changes dependencies" || { bad "deps"; echo "$out"; }
g -C "$C" reset -q --hard HEAD~1; echo "local" >> "$L/components/AnimatedCompanion.tsx"
out=$(run env) || true; grep -q 'locally edited files would be touched: components/AnimatedCompanion.tsx' <<<"$out" && ok "refuses when a local edit would be touched" || { bad "local edit"; echo "$out"; }
[[ $fail == 0 ]] && echo "ALL PASS" || { echo "SOME FAILED"; exit 1; }

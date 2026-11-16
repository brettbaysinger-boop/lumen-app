#!/usr/bin/env bash
# Offline test of scripts/biglust-images-release.sh against a fake live checkout of the S22 release.
# Nothing real is touched: sudo, systemctl and curl are stubs, LIVE_DIR and the state dir are temporary.
#   PYTHON=/path/to/venv/python scripts/test-biglust-images-release.sh
# PYTHON must have the backend's dependencies (it runs the backend tests on the patched copy).
set -Eeuo pipefail
export LC_ALL=C
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY="${PYTHON:-python3}"
T=$(mktemp -d); trap '[ -n "${KEEP:-}" ] || rm -rf "$T"' EXIT
fails=0
ok()   { printf 'ok    %s\n' "$1"; }
no()   { printf 'FAIL  %s\n' "$1"; fails=$((fails + 1)); }
expect() { if eval "$2"; then ok "$1"; else no "$1"; fi; }

# A clean clone of this branch, with the release script as it is in the working tree.
git clone -q "$SRC" "$T/release"
cp "$SRC/scripts/biglust-images-release.sh" "$T/release/scripts/"
git -C "$T/release" add scripts/biglust-images-release.sh
git -C "$T/release" -c user.name=t -c user.email=t@t commit -qm "script under test" --allow-empty
BASE=$(git -C "$T/release" rev-parse 7f63d520f56133f09dc7e2bdd2b92c31d0e484b7)
CODE=$(git -C "$T/release" rev-parse 27fa0bcc1a5101f283b6e53afa8116e1f35473d6)

# The fake live checkout: the S22 release with a .env that already has an older ComfyUI workflow.
git clone -q "$SRC" "$T/live"; git -C "$T/live" checkout -q --detach "$BASE"
cat > "$T/live/backend/.env" <<'ENV'
# live settings (fictional)
SUPABASE_URL=http://127.0.0.1:9
SUPABASE_SERVICE_ROLE_KEY=fictional
COMFYUI_URL=http://comfy.invalid:8188
export COMFYUI_WORKFLOW=/old/flux2-klein.json
LUMEN_MEMORY_BACKEND=rmc
ENV
chmod 600 "$T/live/backend/.env"

mkdir -p "$T/bin" "$T/state"
cat > "$T/bin/sudo" <<'S'
#!/usr/bin/env bash
exec "$@"
S
cat > "$T/bin/id" <<'S'
#!/usr/bin/env bash
[ "$*" = "-u" ] && { echo 1000; exit 0; }; exec /usr/bin/id "$@"
S
cat > "$T/bin/systemctl" <<'S'
#!/usr/bin/env bash
case "$*" in
  *"-p WorkingDirectory"*) echo "$FAKE_LIVE/backend" ;;
  *"-p Environment --value"*) echo "${FAKE_SYSTEMD_ENV:-}" ;;
  *"-p EnvironmentFiles"*) echo "" ;;
  "restart lumen-api") echo restart >> "$FAKE_LOG" ;;
  *) echo "unexpected systemctl $*" >&2; exit 9 ;;
esac
S
cat > "$T/bin/curl" <<'S'
#!/usr/bin/env bash
url="${*: -1}"
restarts=$(grep -c restart "$FAKE_LOG" 2>/dev/null || true)
case "$url" in
  */health) [ -n "${FAKE_FAIL_ON_RESTART:-}" ] && [ "$restarts" = "$FAKE_FAIL_ON_RESTART" ] && exit 7; echo '{"status":"ok"}' ;;
  */openapi.json) echo '{"components":{"schemas":{"X":{"properties":{"privacy_mode":{}}}}}}' ;;
  *) exit 7 ;;
esac
S
chmod +x "$T/bin/"*
export PATH="$T/bin:$PATH" LIVE_DIR="$T/live" XDG_STATE_HOME="$T/state" BIGLUST_RELEASE_PYTHON="$PY" \
  FAKE_LIVE="$T/live" FAKE_LOG="$T/systemctl.log" BIGLUST_RELEASE_WAIT=2 LUMEN_API_URL=http://127.0.0.1:8001
: > "$FAKE_LOG"
R="$T/release/scripts/biglust-images-release.sh"
tree_sum() { (cd "$T/live" && find . -path ./.git -prune -o -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum); }
BEFORE=$(tree_sum); ENV_BEFORE=$(sha256sum < "$T/live/backend/.env")

echo "== check =="
out=$("$R" check 2>&1) && rc=0 || rc=$?
expect "check passes on the untouched S22 release" '[ $rc = 0 ] && grep -q "^READY" <<<"$out"'
expect "check runs the backend tests on a patched copy" 'grep -q "PASS  backend tests on a patched copy.* passed" <<<"$out"'
expect "check never prints COMFYUI_URL" '! grep -q comfy.invalid <<<"$out"'
expect "check changes nothing" '[ "$(tree_sum)" = "$BEFORE" ] && [ ! -s "$FAKE_LOG" ]'
ID=$(sed -n 's/^Patch id: \([0-9a-f]\{12\}\).*/\1/p' <<<"$out")
expect "check prints a 12-hex patch id" '[ ${#ID} = 12 ]'

echo "== check with a production venv that has no pytest =="
NOPY="$T/nopytest"; "$PY" -m venv --without-pip "$NOPY" >/dev/null
SP=$("$PY" -c 'import sysconfig; print(sysconfig.get_paths()["purelib"])')
mkdir -p "$T/sp"; for d in "$SP"/*; do case "$(basename "$d")" in pytest*|_pytest*|py.py) ;; *) ln -s "$d" "$T/sp/";; esac; done
echo "$T/sp" > "$("$NOPY/bin/python" -c 'import sysconfig; print(sysconfig.get_paths()["purelib"])')/live.pth"
out=$(BIGLUST_RELEASE_PYTHON="$NOPY/bin/python" "$R" check 2>&1) && rc=0 || rc=$?
expect "check passes without pytest (unittest of the new tests + app import)" '[ $rc = 0 ] && grep -q "passed (unittest; app imports)" <<<"$out"'

echo "== refusals =="
out=$("$R" apply 2>&1) && rc=0 || rc=$?
expect "apply without confirmation refuses" '[ $rc != 0 ] && grep -q "Owner confirmation missing" <<<"$out"'
out=$(BIGLUST_RELEASE_CONFIRM=images:000000000000 "$R" apply 2>&1) && rc=0 || rc=$?
expect "apply with a wrong patch id refuses" '[ $rc != 0 ]'
out=$("$R" rollback 2>&1) && rc=0 || rc=$?
expect "rollback without confirmation refuses" '[ $rc != 0 ]'
expect "refusals changed nothing" '[ "$(tree_sum)" = "$BEFORE" ] && [ "$(sha256sum < "$T/live/backend/.env")" = "$ENV_BEFORE" ] && [ ! -s "$FAKE_LOG" ]'

echo "== live file differs from the release =="
cp "$T/live/backend/lumen/images.py" "$T/images.py.keep"; echo "# hotfix" >> "$T/live/backend/lumen/images.py"
out=$("$R" check 2>&1) && rc=0 || rc=$?
expect "check reports NOT READY for a hand-edited live file" '[ $rc != 0 ] && grep -q "NOT READY" <<<"$out"'
out=$(BIGLUST_RELEASE_CONFIRM=images:$ID "$R" apply 2>&1) && rc=0 || rc=$?
expect "apply refuses and leaves the edited file alone" '[ $rc != 0 ] && tail -1 "$T/live/backend/lumen/images.py" | grep -q hotfix && [ ! -s "$FAKE_LOG" ]'
cp "$T/images.py.keep" "$T/live/backend/lumen/images.py"
expect "fixture restored" '[ "$(tree_sum)" = "$BEFORE" ]'

echo "== systemd sets the ComfyUI keys =="
out=$(FAKE_SYSTEMD_ENV="COMFYUI_CHECKPOINT=x" "$R" check 2>&1) && rc=0 || rc=$?
expect "check refuses when systemd would override the .env" '[ $rc != 0 ] && grep -q "systemd sets COMFYUI_CHECKPOINT" <<<"$out"'

echo "== apply =="
out=$(BIGLUST_RELEASE_CONFIRM=images:$ID "$R" apply 2>&1) && rc=0 || rc=$?
expect "apply succeeds" '[ $rc = 0 ] && grep -q "^Applied" <<<"$out"'
expect "live HEAD never moves" '[ "$(git -C "$T/live" rev-parse HEAD)" = "$BASE" ]'
changed=$(git -C "$T/live" status --porcelain --untracked-files=all | sed "s/^...//" | grep -v "^backend/.env$" | sort)
want=$(git -C "$T/release" diff --name-only "$BASE" "$CODE" -- backend | sort)
expect "only the reviewed backend files changed" '[ "$changed" = "$want" ]'
expect "each changed file equals the reviewed commit" 'for p in $want; do [ "$(git hash-object "$T/live/$p")" = "$(git -C "$T/release" rev-parse "$CODE:$p")" ] || exit 1; done'
envdiff=$(diff <(git -C "$T/live" show HEAD:backend/.env 2>/dev/null || cat "$(ls -d "$T"/state/lumen-biglust-release/2*/env)") "$T/live/backend/.env" | grep '^[<>]' || true)
expect ".env: only COMFYUI_WORKFLOW and COMFYUI_CHECKPOINT change" '! grep -vqE "^[<>] (export )?COMFYUI_(WORKFLOW|CHECKPOINT)=" <<<"$envdiff"'
expect ".env: workflow points at the SDXL file in the live checkout" 'grep -qx "COMFYUI_WORKFLOW=$T/live/backend/workflows/biglust-sdxl-v16-api.json" "$T/live/backend/.env"'
expect ".env: checkpoint is bigLust_v16.safetensors" 'grep -qx "COMFYUI_CHECKPOINT=bigLust_v16.safetensors" "$T/live/backend/.env"'
expect ".env: COMFYUI_URL and RMC lines untouched" 'grep -qx "COMFYUI_URL=http://comfy.invalid:8188" "$T/live/backend/.env" && grep -qx "LUMEN_MEMORY_BACKEND=rmc" "$T/live/backend/.env"'
expect ".env keeps mode 600" '[ "$(stat -c %a "$T/live/backend/.env")" = 600 ]'
expect "lumen-api restarted exactly once" '[ "$(grep -c restart "$FAKE_LOG")" = 1 ]'
st=$("$R" status 2>&1)
expect "status: applied, BigLust, video off" 'grep -q "state: applied" <<<"$st" && grep -q "effective: bigLust_v16.safetensors biglust-sdxl-v16-api.json url-set video-off" <<<"$st"'
out=$(BIGLUST_RELEASE_CONFIRM=images:$ID "$R" apply 2>&1) && rc=0 || rc=$?
expect "a second apply refuses" '[ $rc != 0 ]'

echo "== rollback =="
out=$(BIGLUST_RELEASE_CONFIRM=images-rollback "$R" rollback 2>&1) && rc=0 || rc=$?
expect "rollback succeeds" '[ $rc = 0 ] && grep -q "^Restored" <<<"$out"'
expect "rollback is byte for byte (every file, .env included)" '[ "$(tree_sum)" = "$BEFORE" ] && [ "$(sha256sum < "$T/live/backend/.env")" = "$ENV_BEFORE" ]'
expect "rollback leaves git clean" '[ -z "$(git -C "$T/live" status --porcelain --untracked-files=all | grep -v "^?? backend/.env$")" ]'

echo "== health fails after the restart: automatic restore =="
: > "$FAKE_LOG"
out=$(FAKE_FAIL_ON_RESTART=1 BIGLUST_RELEASE_CONFIRM=images:$ID "$R" apply 2>&1) && rc=0 || rc=$?
expect "apply reports failure" '[ $rc != 0 ] && grep -q "restoring the backup" <<<"$out"'
expect "everything restored byte for byte" '[ "$(tree_sum)" = "$BEFORE" ] && [ "$(sha256sum < "$T/live/backend/.env")" = "$ENV_BEFORE" ]'
expect "lumen-api restarted again on the restored files" '[ "$(grep -c restart "$FAKE_LOG")" = 2 ]'
expect "nothing left recorded as applied" '[ ! -f "$T/state/lumen-biglust-release/current" ]'

echo
[ "$fails" = 0 ] && echo "ALL PASS" || { echo "$fails FAILED"; exit 1; }

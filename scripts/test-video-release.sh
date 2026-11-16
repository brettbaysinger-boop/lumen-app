#!/usr/bin/env bash
# Offline test of scripts/video-release.sh on a fake Lumen: a live checkout at the S22 release with the
# BigLust images patch in its working files, stubbed systemctl/sudo/curl/ss/ps, the real backend tests on
# the patched copy and the real worker for the unit lifecycle. Nothing outside a temp folder is touched.
#   PYTHON=<python with the backend's deps> scripts/test-video-release.sh
set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY="${PYTHON:-python3}"
BASE=7f63d520f56133f09dc7e2bdd2b92c31d0e484b7
IMAGES=27fa0bcc1a5101f283b6e53afa8116e1f35473d6
WEB=$(git -C "$SRC" rev-parse release/video-frontend-20261116 2>/dev/null || git -C "$SRC" rev-parse origin/release/video-frontend-20261116)
T=$(mktemp -d); trap 'git -C "$SRC" worktree remove --force "$T/repo" >/dev/null 2>&1 || true; rm -rf "$T"' EXIT
n=0; ok() { n=$((n + 1)); printf 'ok %d - %s\n' "$n" "$1"; }
fail() { printf 'not ok - %s\n' "$1"; exit 1; }

git -C "$SRC" worktree add -q --detach "$T/repo" HEAD
git clone -q --no-local "$SRC" "$T/live" && git -C "$T/live" checkout -q --detach "$BASE"
git -C "$SRC" diff --binary "$BASE" "$IMAGES" -- backend | git -C "$T/live" apply -
printf 'SUPABASE_URL=http://127.0.0.1:9\nSUPABASE_SERVICE_ROLE_KEY=fictional\nCOMFYUI_URL=http://127.0.0.1:18188\nKEEP_ME=1\n' > "$T/live/backend/.env"
mkdir -p "$T/bin" "$T/units" "$T/sys"
cat > "$T/bin/id" <<EOF
#!/bin/sh
case "\$1" in -u) echo 1000 ;; -un) echo lumen ;; *) /usr/bin/id "\$@" ;; esac
EOF
cat > "$T/bin/sudo" <<'EOF'
#!/bin/sh
exec "$@"
EOF
cat > "$T/bin/systemctl" <<EOF
#!/bin/bash
# Fake systemd: lumen-api always healthy; the worker unit is really started (its real main()).
S="$T/sys"; unit=""; for a in "\$@"; do case "\$a" in *.service|lumen-api) unit="\$a" ;; esac; done
case "\$1" in
  show) prop="\$3"
    if [ "\$unit" = lumen-api ]; then
      case "\$prop" in WorkingDirectory) echo "$T/live/backend" ;; User) echo lumen ;; *) echo "" ;; esac
    else cat "\$S/\$prop" 2>/dev/null || echo ""; fi ;;
  restart|start)
    [ "\$unit" = lumen-api ] && { echo restart >> "\$S/api-restarts"; exit 0; }
    [ -f "$T/units/lumen-media-worker.service" ] || exit 5
    if grep -q '^VIDEO_GENERATION_ENABLED=true' "$T/live/backend/.env"; then
      (cd "$T/live/backend" && "$PY" -c "import lumen.media_worker") && { echo active > "\$S/ActiveState"; echo success > "\$S/Result"; }
    else
      if (cd "$T/live/backend" && "$PY" -m lumen.media_worker > "\$S/worker.log" 2>&1); then
        echo inactive > "\$S/ActiveState"; echo success > "\$S/Result"; else echo failed > "\$S/Result"; fi
    fi ;;
  disable) rm -f "\$S/ActiveState" "\$S/Result" ;;
  *) exit 0 ;;
esac
EOF
cat > "$T/bin/curl" <<EOF
#!/bin/sh
for a in "\$@"; do case "\$a" in
  */health) exit 0 ;;
  */openapi.json) [ -f "$T/live/backend/lumen/media_jobs.py" ] && echo '{"paths":{"/v0.3/media/jobs/{job_id}":{}}}'; exit 0 ;;
esac; done; exit 7
EOF
cat > "$T/bin/ss" <<'EOF'
#!/bin/sh
case "$*" in *18188*) echo 'LISTEN 0 128 127.0.0.1:18188 0.0.0.0:* users:(("ssh",pid=4242,fd=4))' ;; esac
EOF
cat > "$T/bin/ps" <<'EOF'
#!/bin/sh
case "$*" in *unit=*) echo comfy-tunnel.service ;; *user=,comm=*) echo "lumen ssh" ;; *args=*) echo "ssh -N -L 127.0.0.1:18188:127.0.0.1:8188 heavy" ;; esac
EOF
chmod +x "$T/bin/"*
export PATH="$T/bin:$PATH" LIVE_DIR="$T/live" XDG_STATE_HOME="$T/state" VIDEO_RELEASE_PYTHON="$PY" UNIT_DIR="$T/units" VIDEO_RELEASE_WAIT=2
R="$T/repo/scripts/video-release.sh"
blob() { git hash-object --no-filters -- "$T/live/$1"; }
snapshot() { (cd "$T/live" && git ls-files -m -o --exclude-standard backend | sort | while read -r f; do echo "$(git hash-object --no-filters -- "$f") $f"; done; sha256sum backend/.env); }

before=$(snapshot); head=$(git -C "$T/live" rev-parse HEAD)
out=$("$R" route 2>&1) && echo "$out" | grep -q '17863 is free' && echo "$out" | grep -q 'comfy-tunnel.service' || fail "route: $out"
ok "route is read-only and names the unit behind 18188"
VIDEO_RELEASE_FAKE_DB='{"table": "absent (404)", "bucket_limit": 10485760, "bucket_types": ["image/png", "image/jpeg"]}' "$R" migration-check > "$T/m.log" 2>&1
grep -q "file_size_limit = 10485760, allowed_mime_types = ARRAY\['image/png', 'image/jpeg'\]::text\[\]" "$T/state/lumen-video-release/migration-undo.sql" || fail "undo SQL: $(cat "$T/m.log")"
ok "migration-check writes undo SQL with the recorded bucket values"
out=$("$R" backend-check 2>&1) || fail "backend-check: $out"
echo "$out" | grep -q 'backend tests on a patched copy of the live backend' || fail "no tests ran: $out"
id=$(echo "$out" | sed -n 's/^Patch id: \([0-9a-f]*\).*/\1/p')
[ "$(snapshot)" = "$before" ] || fail "backend-check changed files"
ok "backend-check passes on the images-applied live tree, runs the backend tests, changes nothing"
VIDEO_RELEASE_CONFIRM=backend:wrong "$R" backend > /dev/null 2>&1 && fail "backend ran without the right id"
[ "$(snapshot)" = "$before" ] || fail "refused backend changed files"
ok "backend refuses without the exact patch id"

cp "$T/live/backend/lumen/config.py" "$T/config.keep"; echo "# local edit" >> "$T/live/backend/lumen/config.py"
VIDEO_RELEASE_CONFIRM=backend:$id "$R" backend > /dev/null 2>&1 && fail "backend overwrote a locally edited file"
cp "$T/config.keep" "$T/live/backend/lumen/config.py"
ok "backend STOPs when a live file differs from the images release (never overwritten)"

VIDEO_RELEASE_CONFIRM=backend:$id "$R" backend > "$T/b.log" 2>&1 || fail "backend: $(cat "$T/b.log")"
[ "$(git -C "$T/live" rev-parse HEAD)" = "$head" ] || fail "HEAD moved"
[ "$(blob backend/lumen/media_worker.py)" = "$(git -C "$SRC" rev-parse 0b370fb:backend/lumen/media_worker.py)" ] || fail "worker missing"
[ "$(blob backend/lumen/images.py)" = "$(git -C "$SRC" rev-parse $IMAGES:backend/lumen/images.py)" ] || fail "BigLust images.py changed"
[ "$(blob backend/workflows/biglust-sdxl-v16-api.json)" = "$(git -C "$SRC" rev-parse $IMAGES:backend/workflows/biglust-sdxl-v16-api.json)" ] || fail "BigLust workflow changed"
sha256sum "$T/live/backend/.env" | grep -q "$(echo "$before" | tail -1 | cut -c1-64)" || fail ".env changed by backend"
ok "backend applies, keeps HEAD, BigLust files and .env, video off, lumen-api restarted"

VIDEO_RELEASE_CONFIRM=worker "$R" worker > "$T/w.log" 2>&1 || fail "worker: $(cat "$T/w.log") $(cat "$T/sys/worker.log" 2>/dev/null)"
grep -q "^User=lumen$" "$T/units/lumen-media-worker.service" && grep -q "^WorkingDirectory=$T/live/backend$" "$T/units/lumen-media-worker.service" \
  && grep -q "^ExecStart=$PY -m lumen.media_worker$" "$T/units/lumen-media-worker.service" && grep -q '^Restart=on-failure$' "$T/units/lumen-media-worker.service" || fail "unit text"
grep -q 'VIDEO_GENERATION_ENABLED is false: nothing to do' "$T/sys/worker.log" || fail "worker did not idle: $(cat "$T/sys/worker.log")"
ok "worker unit installed with lumen-api's user and directory; the real worker exits cleanly with video off"
VIDEO_RELEASE_CONFIRM=backend-rollback "$R" backend-rollback > /dev/null 2>&1 && fail "backend rolled back under the worker"
ok "backend-rollback refuses while the worker unit is installed"

VIDEO_RELEASE_FAKE_DB='{"table": "present", "bucket_types": ["video/mp4"]}' VIDEO_RELEASE_FP_CHECK=true \
  VIDEO_FRAMEPACK_URL=http://127.0.0.1:17863 VIDEO_RELEASE_CONFIRM=enable "$R" enable > /dev/null 2>&1 && fail "enabled without the web app"
ok "enable STOPs until the web app with the Gallery Public lock is live"
git -C "$T/live" fetch -q "$SRC" "$WEB" && git -C "$T/live" merge -q --ff-only "$WEB"
ok "web app step simulated: live HEAD fast-forwarded to the frontend-only commit; backend edits kept"
VIDEO_RELEASE_FAKE_DB='{"table": "absent (404)"}' VIDEO_RELEASE_FP_CHECK=true VIDEO_FRAMEPACK_URL=http://127.0.0.1:17863 \
  VIDEO_RELEASE_CONFIRM=enable "$R" enable > /dev/null 2>&1 && fail "enabled without the migration"
VIDEO_RELEASE_FAKE_DB='{"table": "present", "bucket_types": ["video/mp4"]}' VIDEO_RELEASE_FP_CHECK=false VIDEO_FRAMEPACK_URL=http://127.0.0.1:17863 \
  VIDEO_RELEASE_CONFIRM=enable "$R" enable > /dev/null 2>&1 && fail "enabled with FP-Studio unreachable"
VIDEO_RELEASE_FAKE_DB='{"table": "present", "bucket_types": ["video/mp4"]}' VIDEO_RELEASE_FP_CHECK=true VIDEO_FRAMEPACK_URL=http://10.0.0.5:7863 \
  VIDEO_RELEASE_CONFIRM=enable "$R" enable > /dev/null 2>&1 && fail "enabled with a non-loopback URL"
env_before=$(sha256sum < "$T/live/backend/.env")
[ "$(sha256sum < "$T/live/backend/.env")" = "$env_before" ] || fail ".env changed by refused enable"
ok "enable STOPs without the migration, with FP-Studio unreachable, or with a non-loopback URL"

VIDEO_RELEASE_FAKE_DB='{"table": "present", "bucket_types": ["video/mp4"]}' VIDEO_RELEASE_FP_CHECK=true VIDEO_FRAMEPACK_URL=http://127.0.0.1:17863 \
  VIDEO_RELEASE_CONFIRM=enable "$R" enable > "$T/e.log" 2>&1 || fail "enable: $(cat "$T/e.log")"
diff <(grep -vE '^(VIDEO_GENERATION_ENABLED|FRAMEPACK_URL|FRAMEPACK_API_NAME)=' "$T/live/backend/.env") \
     <(printf 'SUPABASE_URL=http://127.0.0.1:9\nSUPABASE_SERVICE_ROLE_KEY=fictional\nCOMFYUI_URL=http://127.0.0.1:18188\nKEEP_ME=1\n') > /dev/null || fail "other .env lines changed"
grep -qx 'VIDEO_GENERATION_ENABLED=true' "$T/live/backend/.env" && grep -qx 'FRAMEPACK_URL=http://127.0.0.1:17863' "$T/live/backend/.env" || fail "keys not set"
grep -q 'budget=14400s' "$T/e.log" && [ "$(cat "$T/sys/ActiveState")" = active ] || fail "enable output: $(cat "$T/e.log")"
ok "enable sets exactly three .env keys, 4 h budget, 10 s clips unchanged, worker running"
VIDEO_RELEASE_CONFIRM=worker-rollback "$R" worker-rollback > /dev/null 2>&1 && fail "worker removed while enabled"
ok "worker-rollback refuses while video is enabled"

VIDEO_RELEASE_CONFIRM=enable-rollback "$R" enable-rollback > /dev/null 2>&1 || fail "enable-rollback"
[ "$(sha256sum < "$T/live/backend/.env")" = "$env_before" ] || fail ".env not restored byte for byte"
ok "enable-rollback restores .env byte for byte; worker idles again"
VIDEO_RELEASE_CONFIRM=worker-rollback "$R" worker-rollback > /dev/null 2>&1 || fail "worker-rollback"
[ ! -e "$T/units/lumen-media-worker.service" ] || fail "unit left behind"
VIDEO_RELEASE_CONFIRM=backend-rollback "$R" backend-rollback > /dev/null 2>&1 || fail "backend-rollback"
after=$(cd "$T/live" && git ls-files -m -o --exclude-standard backend | sort | while read -r f; do echo "$(git hash-object --no-filters -- "$f") $f"; done; sha256sum backend/.env)
[ "$after" = "$before" ] || fail "rollback did not restore the images release exactly: $(diff <(echo "$before") <(echo "$after"))"
out=$("$R" backend-check 2>&1) || fail "after rollback: $out"
ok "worker-rollback and backend-rollback: live backend and .env exactly the images release again"
echo "1..$n  all passed"

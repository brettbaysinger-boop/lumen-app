#!/usr/bin/env bash
# Offline test of scripts/video-length-release.sh on a fake Lumen: the images + video backend and the
# routing hotfix in the WORKING FILES, video enabled, stubbed systemctl/sudo/curl, a stubbed job count and
# FP-Studio check, and the real backend tests on the patched copy. Nothing outside a temp folder is touched.
#   PYTHON=<python with the backend's deps> scripts/test-video-length-release.sh
set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY="${PYTHON:-python3}"
BASE=7f63d520f56133f09dc7e2bdd2b92c31d0e484b7
FROM=a4c06b0d3c3877da328ea5fa51f2f4206b0b0a29
TO=648e8d0e37e48b3cc470e9f11df1f86c70c9d771
T=$(mktemp -d); trap 'git -C "$SRC" worktree remove --force "$T/repo" >/dev/null 2>&1 || true; rm -rf "$T"' EXIT
n=0; ok() { n=$((n + 1)); printf 'ok %d - %s\n' "$n" "$1"; }
fail() { printf 'not ok - %s\n' "$1"; exit 1; }

git -C "$SRC" worktree add -q --detach "$T/repo" HEAD
git clone -q --no-local "$SRC" "$T/live" && git -C "$T/live" checkout -q --detach "$BASE"
git -C "$SRC" diff --binary "$BASE" "$FROM" -- backend | git -C "$T/live" apply -
ENV='SUPABASE_URL=http://127.0.0.1:9\nSUPABASE_SERVICE_ROLE_KEY=fictional\nVIDEO_GENERATION_ENABLED=true\nFRAMEPACK_URL=http://127.0.0.1:17863\nKEEP_ME=1\n'
printf "$ENV" > "$T/live/backend/.env"
mkdir -p "$T/bin" "$T/sys" "$T/state/lumen-video-release"; S="$T/state/lumen-video-release"
echo "$S/hotfix-fake" > "$S/hotfix"
printf '#!/bin/sh\ncase "$1" in -u) echo 1000 ;; -un) echo lumen ;; *) /usr/bin/id "$@" ;; esac\n' > "$T/bin/id"
printf '#!/bin/sh\nexec "$@"\n' > "$T/bin/sudo"
cat > "$T/bin/systemctl" <<EOF
#!/bin/bash
case "\$1" in
  show) case "\$3" in WorkingDirectory) echo "$T/live/backend" ;; ActiveState) echo active ;; *) echo "" ;; esac ;;
  restart) echo "\$2" >> "$T/sys/restarts"; [ -f "$T/sys/fail-after-restart" ] && touch "$T/sys/unhealthy" ;;
esac; exit 0
EOF
cat > "$T/bin/curl" <<EOF
#!/bin/sh
[ -f "$T/sys/unhealthy" ] && exit 7
for a in "\$@"; do case "\$a" in
  */health) exit 0 ;;
  */openapi.json) echo '{"paths":{"/v0.3/media/jobs/{job_id}":{}}}'; exit 0 ;;
esac; done; exit 7
EOF
printf '#!/bin/sh\n[ -f "%s/sys/fp-short" ] && exit 1; exit 0\n' "$T" > "$T/bin/fpcheck"
chmod +x "$T/bin/"*
export PATH="$T/bin:$PATH" LIVE_DIR="$T/live" XDG_STATE_HOME="$T/state" VIDEO_RELEASE_PYTHON="$PY" VIDEO_RELEASE_WAIT=2
export VIDEO_LENGTH_FAKE_DB_LIMIT=10 VIDEO_LENGTH_FAKE_ACTIVE=0 VIDEO_LENGTH_FP_CHECK="$T/bin/fpcheck" VIDEO_LENGTH_SETTLE=0
L="$T/repo/scripts/video-length-release.sh"
FILES=$(git -C "$SRC" diff --name-only "$FROM" "$TO" -- backend)
blobs() { for f in $FILES; do git hash-object --no-filters "$T/live/$f" 2>/dev/null || echo absent; done; }
blobs_of() { for f in $FILES; do git -C "$SRC" rev-parse -q --verify "$1:$f" 2>/dev/null || echo absent; done; }
envsum() { sha256sum < "$T/live/backend/.env"; }
before_env=$(envsum)

out=$("$L" check) || { echo "$out"; fail "check is READY on the fake live state"; }
grep -q "backend tests on a patched copy of the live backend: .*passed" <<< "$out" || { echo "$out"; fail "tests ran"; }
ok "check: READY ($(grep -o '[0-9]* passed[^)]*)\{0,1\}' <<< "$out" | head -1)); longest now $(sed -n 's/.*allows now: //p' <<< "$out")"
ID=$(sed -n 's/^Patch id: \([0-9a-f]*\).*/\1/p' <<< "$out")
[ "$(blobs)" = "$(blobs_of "$FROM")" ] || fail "check changed something"; ok "check changed nothing"

! "$L" apply 2>/dev/null && ! VIDEO_LENGTH_CONFIRM=backend:000000000000 "$L" apply 2>/dev/null || fail "apply without the right token"
ok "apply refuses without the exact patch-id token"

! VIDEO_LENGTH_FAKE_ACTIVE=1 "$L" check > /dev/null 2>&1 || fail "check READY during a render"
! VIDEO_LENGTH_FAKE_ACTIVE=1 VIDEO_LENGTH_CONFIRM=backend:$ID "$L" apply 2>/dev/null || fail "applied during a render"
! VIDEO_LENGTH_FAKE_ACTIVE=unknown VIDEO_LENGTH_CONFIRM=backend:$ID "$L" apply 2>/dev/null || fail "applied with an unreadable job table"
[ "$(blobs)" = "$(blobs_of "$FROM")" ] && [ ! -f "$T/sys/restarts" ] || fail "something changed during a render"
ok "a queued or running video job (or an unreadable job table): NOT READY, apply refuses, nothing restarted"

touch "$T/sys/fp-short"; ! "$L" check > /dev/null 2>&1 || fail "check READY although FP-Studio's maximum is unconfirmed"
rm -f "$T/sys/fp-short"; ok "FramePack-Studio maximum not confirmed as 120 s: NOT READY"

cp "$T/live/backend/lumen/config.py" "$T/config.bak"; echo "# local edit" >> "$T/live/backend/lumen/config.py"
! VIDEO_LENGTH_CONFIRM=backend:$ID "$L" apply 2>/dev/null || fail "apply over an edited live file"
grep -q "# local edit" "$T/live/backend/lumen/config.py" || fail "edited file overwritten"
cp "$T/config.bak" "$T/live/backend/lumen/config.py"; ok "an edited live file: apply refuses, edit kept"

touch "$T/sys/fail-after-restart"
! VIDEO_LENGTH_CONFIRM=backend:$ID "$L" apply > /dev/null 2>&1 || fail "apply succeeded although lumen-api failed after restart"
rm -f "$T/sys/fail-after-restart" "$T/sys/unhealthy" "$T/sys/restarts"
[ "$(blobs)" = "$(blobs_of "$FROM")" ] && [ ! -f "$S/length" ] || fail "no automatic restore"
[ ! -f "$T/live/backend/tests/test_video_120s.py" ] || fail "new file left behind after restore"
ok "lumen-api unhealthy after the restart: backup restored automatically, the new file removed"

VIDEO_LENGTH_CONFIRM=backend:$ID "$L" apply > "$T/apply.log" 2>&1 || { cat "$T/apply.log"; fail "apply"; }
[ "$(blobs)" = "$(blobs_of "$TO")" ] || fail "files are not the 120-second backend"
[ "$(git -C "$T/live" rev-parse HEAD)" = "$BASE" ] || fail "HEAD moved"
[ "$(envsum)" = "$before_env" ] || fail ".env changed by apply"
[ "$(tr '\n' ' ' < "$T/sys/restarts")" = "lumen-api lumen-media-worker.service " ] || fail "restarts: $(cat "$T/sys/restarts")"
grep -q "limit is still 10 s" "$T/apply.log" || { cat "$T/apply.log"; fail "limit changed by apply"; }
for f in $(git -C "$SRC" diff --name-only "$BASE" "$FROM" -- backend); do
  case " $(echo $FILES) " in *" $f "*) ;; *) [ "$(git hash-object --no-filters "$T/live/$f")" = "$(git -C "$SRC" rev-parse "$FROM:$f")" ] || fail "$f changed" ;; esac
done
ok "apply: $(echo "$FILES" | wc -l) files = ${TO:0:7}; HEAD, .env and the other files unchanged; limit still 10 s; api then worker restarted"

! VIDEO_LENGTH_CONFIRM=hotfix-rollback VIDEO_HOTFIX_CONFIRM=hotfix-rollback "$T/repo/scripts/video-routing-hotfix.sh" rollback 2>/dev/null || fail "hotfix rollback ran under the 120-second backend"
ok "video-routing-hotfix.sh rollback refuses while the 120-second backend is applied"

! "$L" enable 2>/dev/null || fail "enable without its word"
! VIDEO_LENGTH_FAKE_ACTIVE=2 VIDEO_LENGTH_CONFIRM=enable-120 "$L" enable 2>/dev/null || fail "enabled during a render"
[ "$(envsum)" = "$before_env" ] || fail ".env changed by a refused enable"; ok "enable refuses without its word and during a render"

for limit in 10 unknown; do
  ! VIDEO_LENGTH_FAKE_DB_LIMIT=$limit VIDEO_LENGTH_CONFIRM=enable-120 "$L" enable 2>/dev/null || fail "enabled with database limit $limit"
done
[ "$(envsum)" = "$before_env" ] && [ ! -f "$S/length-enable" ] || fail "a refused enable changed something"
! VIDEO_LENGTH_FAKE_DB_LIMIT=10 "$L" migration-check > "$T/mig.log" 2>&1 || fail "migration-check passes at 10"
grep -q "NOT applied" "$T/mig.log" || fail "migration-check does not say NOT applied"
ok "enable STOPs while the database still limits clips to 10 s, or the limit cannot be read; migration-check says so"
export VIDEO_LENGTH_FAKE_DB_LIMIT=120

VIDEO_LENGTH_CONFIRM=enable-120 "$L" enable > "$T/enable.log" 2>&1 || { cat "$T/enable.log"; fail "enable"; }
grep -qx 'VIDEO_MAX_SECONDS=120' "$T/live/backend/.env" || fail "VIDEO_MAX_SECONDS not set"
diff <(printf "$ENV") <(grep -v '^VIDEO_MAX_SECONDS=' "$T/live/backend/.env") > /dev/null || fail "other .env lines changed"
shown=$("$L" status); grep -q "longest clip allowed now: 120 s" <<< "$shown" || fail "status does not show 120"
ok "enable: only VIDEO_MAX_SECONDS=120 added to .env; lumen-api now allows 120 s"
shown=$(VIDEO_LENGTH_FAKE_DB_LIMIT=10 "$L" status || true)
grep -q "WARNING: lumen-api allows 120 s but the database only 10 s" <<< "$shown" || { echo "$shown"; fail "status does not warn about a missing migration"; }
"$L" migration-check > /dev/null || fail "migration-check fails at 120"
ok "status warns when 120 s is enabled but the migration is missing; migration-check passes at 120"

! VIDEO_LENGTH_CONFIRM=backend-rollback "$L" rollback 2>/dev/null || fail "backend rollback while enabled"
ok "backend rollback refuses while 120 s is enabled"
VIDEO_LENGTH_CONFIRM=enable-rollback "$L" enable-rollback > /dev/null || fail "enable-rollback"
[ "$(envsum)" = "$before_env" ] || fail ".env not restored byte for byte"; ok "enable-rollback: .env byte for byte as before"
VIDEO_LENGTH_CONFIRM=backend-rollback "$L" rollback > /dev/null || fail "rollback"
[ "$(blobs)" = "$(blobs_of "$FROM")" ] && [ ! -f "$S/length" ] || fail "rollback did not restore"
ok "rollback: the backend files are ${FROM:0:7} again, the new test file removed"
echo "All $n length-release checks passed."

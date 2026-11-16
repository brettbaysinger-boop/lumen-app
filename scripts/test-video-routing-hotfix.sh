#!/usr/bin/env bash
# Offline test of scripts/video-routing-hotfix.sh on a fake Lumen: live HEAD at the video web release
# (9ed4737) with the images + video backend in its WORKING FILES, stubbed systemctl/sudo/curl, and the real
# backend tests on the patched copy. Nothing outside a temp folder is touched.
#   PYTHON=<python with the backend's deps> scripts/test-video-routing-hotfix.sh
set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY="${PYTHON:-python3}"
BASE=7f63d520f56133f09dc7e2bdd2b92c31d0e484b7
FROM=0b370fb92884c82227ceb61202007c8f8f5884a6
TO=a4c06b0d3c3877da328ea5fa51f2f4206b0b0a29
WEB_FROM=9ed47374874068c9ccd61f0c61ab0701bfb0b26e
WEB_TO=49b4a36e9cfecd3de44489ce1523ba5850c0c7f4
T=$(mktemp -d); trap 'git -C "$SRC" worktree remove --force "$T/repo" >/dev/null 2>&1 || true; rm -rf "$T"' EXIT
n=0; ok() { n=$((n + 1)); printf 'ok %d - %s\n' "$n" "$1"; }
fail() { printf 'not ok - %s\n' "$1"; exit 1; }

git -C "$SRC" worktree add -q --detach "$T/repo" HEAD
git clone -q --no-local "$SRC" "$T/live" && git -C "$T/live" checkout -q --detach "$WEB_FROM"
git -C "$SRC" diff --binary "$BASE" "$FROM" -- backend | git -C "$T/live" apply -
printf 'SUPABASE_URL=http://127.0.0.1:9\nSUPABASE_SERVICE_ROLE_KEY=fictional\nVIDEO_GENERATION_ENABLED=true\n' > "$T/live/backend/.env"
mkdir -p "$T/bin" "$T/sys" "$T/state/lumen-video-release"
echo "$T/state/lumen-video-release/backend-fake" > "$T/state/lumen-video-release/backend"
printf '#!/bin/sh\ncase "$1" in -u) echo 1000 ;; -un) echo lumen ;; *) /usr/bin/id "$@" ;; esac\n' > "$T/bin/id"
printf '#!/bin/sh\nexec "$@"\n' > "$T/bin/sudo"
cat > "$T/bin/systemctl" <<EOF
#!/bin/bash
case "\$1" in
  show) [ "\$3" = WorkingDirectory ] && echo "$T/live/backend" || echo "" ;;
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
chmod +x "$T/bin/"*
export PATH="$T/bin:$PATH" LIVE_DIR="$T/live" XDG_STATE_HOME="$T/state" VIDEO_RELEASE_PYTHON="$PY" VIDEO_RELEASE_WAIT=2
H="$T/repo/scripts/video-routing-hotfix.sh"
FILES="backend/lumen/main.py backend/lumen/runtime.py backend/tests/test_media_generation.py"
blobs() { for f in $FILES; do git hash-object --no-filters "$T/live/$f"; done; }
blobs_of() { for f in $FILES; do git -C "$SRC" rev-parse "$1:$f"; done; }
envsum=$(sha256sum < "$T/live/backend/.env")

out=$("$H" check) || { echo "$out"; fail "check is READY on the fake live state"; }
grep -q "backend tests on a patched copy of the live backend: .*passed" <<< "$out" || { echo "$out"; fail "tests ran"; }
ok "check: READY, backend tests pass on a patched copy ($(grep -o '[0-9]* passed[^)]*)\{0,1\}' <<< "$out" | head -1))"
ID=$(sed -n 's/^Patch id: \([0-9a-f]*\).*/\1/p' <<< "$out")
[ "$(blobs)" = "$(blobs_of "$FROM")" ] || fail "check changed nothing"; ok "check changed nothing"

! "$H" apply 2>/dev/null && ! VIDEO_HOTFIX_CONFIRM=hotfix:000000000000 "$H" apply 2>/dev/null || fail "apply without the right token"
[ "$(blobs)" = "$(blobs_of "$FROM")" ] || fail "refused apply changed files"; ok "apply refuses without the exact patch-id token"

cp "$T/live/backend/lumen/runtime.py" "$T/runtime.bak"; echo "# local edit" >> "$T/live/backend/lumen/runtime.py"
! "$H" check > /dev/null 2>&1 || fail "check accepts an edited live file"
! VIDEO_HOTFIX_CONFIRM=hotfix:$ID "$H" apply 2>/dev/null || fail "apply over an edited live file"
grep -q "# local edit" "$T/live/backend/lumen/runtime.py" || fail "edited file overwritten"
cp "$T/runtime.bak" "$T/live/backend/lumen/runtime.py"; ok "an edited live file: NOT READY, apply refuses, edit kept"

touch "$T/sys/unhealthy"
! VIDEO_HOTFIX_CONFIRM=hotfix:$ID "$H" apply > /dev/null 2>&1 || fail "apply succeeded although lumen-api is down"
rm -f "$T/sys/unhealthy"
[ "$(blobs)" = "$(blobs_of "$FROM")" ] && [ ! -f "$T/state/lumen-video-release/hotfix" ] || fail "no restore"
ok "lumen-api unhealthy: refused before any change"

touch "$T/sys/fail-after-restart"
! VIDEO_HOTFIX_CONFIRM=hotfix:$ID "$H" apply > /dev/null 2>&1 || fail "apply succeeded although lumen-api failed after restart"
rm -f "$T/sys/fail-after-restart" "$T/sys/unhealthy"
[ "$(blobs)" = "$(blobs_of "$FROM")" ] && [ ! -f "$T/state/lumen-video-release/hotfix" ] || fail "no automatic restore"
ok "lumen-api unhealthy after the restart: the backup is restored automatically"

rm -f "$T/sys/restarts"
VIDEO_HOTFIX_CONFIRM=hotfix:$ID "$H" apply > "$T/apply.log" 2>&1 || { cat "$T/apply.log"; fail "apply"; }
[ "$(blobs)" = "$(blobs_of "$TO")" ] || fail "files are not the hotfix"
[ "$(git -C "$T/live" rev-parse HEAD)" = "$WEB_FROM" ] || fail "HEAD moved"
[ "$(sha256sum < "$T/live/backend/.env")" = "$envsum" ] || fail ".env changed"
[ "$(cat "$T/sys/restarts")" = lumen-api ] || fail "restarted something other than lumen-api once"
for f in $(git -C "$SRC" diff --name-only "$BASE" "$FROM" -- backend); do
  case " $FILES " in *" $f "*) ;; *) [ "$(git hash-object --no-filters "$T/live/$f" 2>/dev/null || echo absent)" = "$(git -C "$SRC" rev-parse "$FROM:$f")" ] || fail "$f changed" ;; esac
done
ok "apply: 3 files = ${TO:0:7}; HEAD, .env and the other images/video files unchanged; lumen-api restarted once"

! VIDEO_HOTFIX_CONFIRM=hotfix:$ID "$H" apply 2>/dev/null || fail "applied twice"; ok "apply refuses a second time"
! VIDEO_RELEASE_CONFIRM=backend-rollback "$T/repo/scripts/video-release.sh" backend-rollback 2>/dev/null || fail "video backend-rollback ran under the hotfix"
ok "video-release.sh backend-rollback refuses while the hotfix is applied"

VIDEO_HOTFIX_CONFIRM=hotfix-rollback "$H" rollback > /dev/null || fail "rollback"
[ "$(blobs)" = "$(blobs_of "$FROM")" ] && [ ! -f "$T/state/lumen-video-release/hotfix" ] || fail "rollback did not restore"
ok "rollback: the 3 files are the video backend ${FROM:0:7} again"

git -C "$T/live" merge-base --is-ancestor "$WEB_FROM" "$WEB_TO" || fail "web hotfix is not a fast-forward"
other=$(git -C "$SRC" diff --name-only "$WEB_FROM" "$WEB_TO" | grep -Ev '^(app/|components/|lib/|hooks/|types/|tests/|docs/|scripts/(test-)?animated[-_][A-Za-z0-9_.-]+$)' || true)
[ -z "$other" ] || fail "web hotfix touches non-frontend files: $other"
[ "$(git -C "$SRC" diff --name-only "$WEB_FROM" "$WEB_TO" -- backend)" = "" ] || fail "web hotfix touches backend"
ok "web: ${WEB_TO:0:7} is a frontend-only fast-forward from ${WEB_FROM:0:7}"
echo "All $n hotfix checks passed."

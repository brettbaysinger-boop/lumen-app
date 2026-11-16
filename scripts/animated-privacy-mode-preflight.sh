#!/usr/bin/env bash
# Public / Private mode (Issue #39, PR #43): READ-ONLY integration preflight.
#
# Compares the live Lumen checkout with this candidate and reports, file by file, whether the PR's
# changes would apply cleanly, are already there, or need a hand merge. It writes nothing: no file,
# no git state, no service. It never prints secrets: from the backend .env it prints only the two
# memory flag values.
#
#   scripts/animated-privacy-mode-preflight.sh /path/to/live/lumen-checkout
#
# Run it from a clone of this candidate (PR #43 head). Exit 0 = every file is "clean" or "applied";
# exit 1 = at least one file needs review; exit 2 = usage or missing input.
set -u
LIVE="${1:-}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# The live automatic-learning source this candidate is built on: PR #38 head (runtime.py as of 05232f7).
RMC_BASE="${PRIVACY_PREFLIGHT_BASE:-8b182cfe46fae3480e90b9db64787544e25541f6}"
if [ -z "$LIVE" ] || [ ! -d "$LIVE" ]; then sed -n '2,13p' "${BASH_SOURCE[0]}"; exit 2; fi
if ! git -C "$HERE" cat-file -e "$RMC_BASE^{commit}" 2>/dev/null; then
  echo "Missing base commit $RMC_BASE in $HERE (fetch PR #38's branch read-only first)."; exit 2
fi

BACKEND=(backend/lumen/main.py backend/lumen/rmc_auto_ingest.py backend/lumen/schemas.py backend/lumen/voice.py backend/lumen/privacy_mode.py backend/lumen/runtime.py)
FRONTEND=("app/(tabs)/index.tsx" app/live-video.tsx components/LiveRoom.tsx components/PrivacyToggle.tsx lib/privacy-mode.ts lib/cognition.ts lib/voice.ts lib/reply-audio.native.ts lib/live-room.ts)
PROTECTED=(components/RmcMemoriesPanel.tsx "app/(tabs)/memories.tsx" backend/lumen/rmc/memory_routes.py)

sum() { sha256sum | cut -c1-16; }
review=0
row() {  # path
  local path="$1" live base head
  live=$( [ -f "$LIVE/$path" ] && sum < "$LIVE/$path" || echo "absent" )
  base=$( git -C "$HERE" show "$RMC_BASE:$path" 2>/dev/null | sum ); git -C "$HERE" cat-file -e "$RMC_BASE:$path" 2>/dev/null || base="absent"
  head=$( [ -f "$HERE/$path" ] && sum < "$HERE/$path" || echo "absent" )
  local verdict
  if [ "$live" = "$head" ]; then verdict="applied"
  elif [ "$live" = "$base" ]; then verdict="clean"
  else verdict="REVIEW"; review=1; fi
  printf '%-8s %-44s live=%s pr38=%s candidate=%s\n' "$verdict" "$path" "$live" "$base" "$head"
}

echo "== Live checkout (read-only) =="
git -C "$LIVE" rev-parse --short HEAD 2>/dev/null | sed 's/^/HEAD /' || echo "not a git checkout"
echo "Uncommitted files in live checkout: $(git -C "$LIVE" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
for env in "$LIVE/backend/.env" "$LIVE/.env"; do
  [ -f "$env" ] || continue
  grep -E '^(LUMEN_MEMORY_BACKEND|RMC_AUTO_INGEST_ENABLED)=' "$env" | sed "s|^|$env: |"
done

echo; echo "== Backend (owner-gated backend procedure; the web updater refuses these) =="
for f in "${BACKEND[@]}"; do row "$f"; done
echo; echo "== Frontend (frontend-only release candidate) =="
for f in "${FRONTEND[@]}"; do row "$f"; done
echo; echo "== Live files this PR must not replace (expect 'applied' = live equals PR #38's copy) =="
for f in "${PROTECTED[@]}"; do row "$f"; done

echo; echo "== Can the backend patch apply to the live files? (git apply --check, writes nothing) =="
patch="$(git -C "$HERE" diff "$RMC_BASE" HEAD -- backend/lumen)"
if [ -z "$patch" ]; then echo "no backend changes"
elif printf '%s\n' "$patch" | git -C "$LIVE" apply --check - 2>&1; then echo "backend patch: applies cleanly"
else echo "backend patch: DOES NOT apply cleanly (hand merge needed; do not copy files over live)"; review=1; fi

echo
[ "$review" = 0 ] && echo "PREFLIGHT: no file needs review." || echo "PREFLIGHT: review needed before any step. Nothing was changed."
exit "$review"

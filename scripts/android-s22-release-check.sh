#!/usr/bin/env bash
# Read-only checks for the pinned Galaxy S22 APK release (docs/android-s22-apk-release.md).
# Changes nothing: no build, no device, no service. Run from the reviewed clone of this branch.
#
#   scripts/android-s22-release-check.sh source         this clone's app source is exactly the pinned frontend
#   scripts/android-s22-release-check.sh apk NEW.apk    the APK's bundle carries this release and not an older one
#
# Each run ends with "RESULT <mode>: OK" or "RESULT <mode>: FAILED". Go on only after OK.
set -euo pipefail
MODE="${1:-}"; APK="${2:-}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# The frontend this APK must carry: release/discreet-privacy-20261116 (S22 repair 7f63d52 + video UI + discreet Public).
PINNED="7e7ec20520e424f8574850b4475f37b2ed5cec96"
SOURCE_DIRS="app components lib hooks types"
# Text only this release's JavaScript contains, one per change it brings to the phone. ASCII only:
# Hermes stores a string with an emoji in it as UTF-16, which a byte search cannot find.
MARKERS=(
  "__lumenRoomAppearance|S22 repair: the app hands its colours to Live Video (PR #50)"
  "Video from Lumen|chat video playback and job progress (9ed4737)"
  "cinemagraph|video requests go to chat, not the image shortcut (672cfba/49b4a36)"
  "What Public mode covers|discreet Public chip (7e7ec20)"
)
# Text that an older bundle has and this one must not.
ABSENT=("Hidden while|the old Public placeholder rows (removed in 7e7ec20)")
problems=0
pass() { printf 'PASS  %s\n' "$1"; }
bad()  { printf 'FAIL  %s\n' "$1"; problems=$((problems + 1)); }
bundle=""
trap 'code=$?; [ -n "$bundle" ] && rm -f "$bundle"; case "$MODE" in source|apk) [ "$code" = 0 ] && [ "$problems" = 0 ] && echo "RESULT $MODE: OK" || echo "RESULT $MODE: FAILED" ;; esac' EXIT

case "$MODE" in
  source)
    git -C "$REPO" cat-file -e "$PINNED^{commit}" 2>/dev/null || { bad "pinned commit ${PINNED:0:12} is not in this clone (fetch release/discreet-privacy-20261116)"; exit 1; }
    [ -z "$(git -C "$REPO" status --porcelain --untracked-files=no)" ] && pass "no uncommitted changes" || bad "this clone has uncommitted changes"
    # shellcheck disable=SC2086
    git -C "$REPO" diff --quiet "$PINNED" HEAD -- $SOURCE_DIRS && pass "app/ components/ lib/ hooks/ types/ are exactly ${PINNED:0:12}" || bad "app source differs from ${PINNED:0:12}"
    git -C "$REPO" diff --quiet "$PINNED" HEAD -- package.json package-lock.json app.json && pass "package.json, package-lock.json and app.json unchanged: no native change" || bad "package or app config differs from ${PINNED:0:12}"
    git -C "$REPO" merge-base --is-ancestor 7f63d52 HEAD && pass "contains the S22 repair 7f63d52" || bad "does not contain the S22 repair 7f63d52"
    ;;
  apk)
    [ -s "$APK" ] || { bad "no APK at '$APK'"; exit 1; }
    bundle=$(mktemp)
    unzip -p "$APK" assets/index.android.bundle > "$bundle" 2>/dev/null || true
    [ -s "$bundle" ] && pass "APK contains assets/index.android.bundle" || { bad "APK has no JavaScript bundle"; exit 1; }
    for item in "${MARKERS[@]}"; do grep -qaF -- "${item%%|*}" "$bundle" && pass "carries: ${item#*|}" || bad "missing: ${item#*|}"; done
    for item in "${ABSENT[@]}"; do grep -qaF -- "${item%%|*}" "$bundle" && bad "still has ${item#*|}: older bundle" || pass "free of ${item#*|}"; done
    ;;
  *) echo "usage: $0 source | apk NEW.apk" >&2; exit 2 ;;
esac
[ "$problems" = 0 ]

#!/usr/bin/env bash
# Update of the existing Raialume Preview app on the owner's phone over ADB, and its way back.
# Run on the Android build host, as the normal user, without sudo. It builds nothing.
#
#   scripts/android-refresh.sh inventory           read-only: tools, build trees, known APKs, the phone, the installed app
#   scripts/android-refresh.sh backup              copies the installed APK off the phone (the phone is not changed)
#   scripts/android-refresh.sh verify NEW.apk      read-only: is NEW.apk a safe update of what is installed
#   ANDROID_REFRESH_CONFIRM=install:<first 12 of NEW.apk's sha256> scripts/android-refresh.sh install NEW.apk
#   ANDROID_REFRESH_CONFIRM=rollback scripts/android-refresh.sh rollback    the APK that was installed before
#
# Settings: PACKAGE (default com.raialume.preview), BUILD_ROOT (default /home/brett/lumen-android-builds),
# LIVE_DIR (default /home/brett/lumen-push; only its .env is read, to check the new APK's public settings),
# ANDROID_SERIAL when more than one device is attached.
#
# The only command that changes the phone is `adb install -r`, which replaces the app and keeps its data.
# This script never uninstalls, never clears app data, never signs or re-signs an APK, and never prints a
# setting's value, a key or a password. It touches no Lumen service.
set -euo pipefail
MODE="${1:-}"; NEW="${2:-}"
PACKAGE="${PACKAGE:-com.raialume.preview}"
BUILD_ROOT="${BUILD_ROOT:-/home/brett/lumen-android-builds}"
LIVE_DIR="${LIVE_DIR:-/home/brett/lumen-push}"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/lumen-android-refresh"
PUBLIC_SETTINGS="EXPO_PUBLIC_SUPABASE_URL EXPO_PUBLIC_SUPABASE_ANON_KEY EXPO_PUBLIC_LUMEN_API_URL"
problems=0
pass() { printf 'PASS  %s\n' "$1"; }
bad()  { printf 'FAIL  %s\n' "$1"; problems=$((problems + 1)); }
info() { printf 'INFO  %s\n' "$1"; }
die()  { printf 'STOP  %s\n' "$1" >&2; exit 1; }
[ "$(id -u)" != 0 ] || die "Run as the normal user, not root."

sdk_tool() {  # the tool on PATH, or the newest one in the Android SDK's build-tools
  local name="$1" root found
  command -v "$name" 2>/dev/null && return 0
  for root in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" "$HOME/Android/Sdk" "$HOME/android-sdk"; do
    [ -n "$root" ] && [ -d "$root/build-tools" ] || continue
    found=$(ls -1d "$root"/build-tools/*/"$name" 2>/dev/null | sort -V | tail -1)
    [ -n "$found" ] && { echo "$found"; return 0; }
  done
  return 1
}
AAPT=$(sdk_tool aapt2 || sdk_tool aapt || true); APKSIGNER=$(sdk_tool apksigner || true)
sha() { sha256sum "$1" | cut -d' ' -f1; }
badging() { [ -n "$AAPT" ] && "$AAPT" dump badging "$1" 2>/dev/null | head -1; }
apk_field() { badging "$1" | sed -n "s/.*[ :]$2='\([^']*\)'.*/\1/p"; }
# The signing certificate's SHA-256 digest: public, identifies the signer, not a secret.
apk_cert() { [ -n "$APKSIGNER" ] && "$APKSIGNER" verify --print-certs "$1" 2>/dev/null | sed -n 's/^Signer #1 certificate SHA-256 digest: //p' | head -1; }
describe_apk() { info "  $1"; info "    sha256 $(sha "$1")  package $(apk_field "$1" name)  versionCode $(apk_field "$1" versionCode)  versionName $(apk_field "$1" versionName)  signer ${2:-$(apk_cert "$1")}"; }

device() {  # one authorised device, or stop
  command -v adb >/dev/null || die "adb is not installed or not on PATH."
  local count
  count=$(adb devices | awk 'NR>1 && $2=="device"' | wc -l)
  if [ -n "${ANDROID_SERIAL:-}" ]; then adb get-state >/dev/null 2>&1 || die "Device $ANDROID_SERIAL is not attached and authorised."
  elif [ "$count" != 1 ]; then die "Expected one attached, authorised device and found $count. Attach the phone, accept the USB debugging prompt, or set ANDROID_SERIAL."; fi
}
installed_field() { adb shell dumpsys package "$PACKAGE" 2>/dev/null | tr -d '\r' | sed -n "s/^ *$1=\([^ ]*\).*/\1/p" | head -1; }
installed_path() { adb shell pm path "$PACKAGE" 2>/dev/null | tr -d '\r' | sed -n 's/^package://p' | { grep '/base\.apk$' || true; } | head -1; }
pull_installed() {  # copies the installed APK to $1; reading it does not change the phone
  local remote; remote=$(installed_path)
  [ -n "$remote" ] || die "$PACKAGE is not installed on the attached device. Nothing to update; this script does not do first installs."
  adb pull "$remote" "$1" >/dev/null 2>&1 || die "Could not copy the installed APK off the phone."
}
latest_backup() { { ls -1d "$STATE_DIR"/backup-* 2>/dev/null || true; } | sort | tail -1; }

inventory() {
  info "host $(hostname), user $(id -un), $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  local tool
  for tool in java adb node npx; do command -v "$tool" >/dev/null && info "$tool: $(command -v "$tool")" || info "$tool: not on PATH"; done
  command -v java >/dev/null && info "java version: $(java -version 2>&1 | head -1)"
  info "aapt: ${AAPT:-not found}"; info "apksigner: ${APKSIGNER:-not found}"
  info "ANDROID_HOME=${ANDROID_HOME:-unset} ANDROID_SDK_ROOT=${ANDROID_SDK_ROOT:-unset}"
  if [ -d "$LIVE_DIR/.git" ]; then
    info "live checkout: $LIVE_DIR @ $(git -C "$LIVE_DIR" rev-parse --short=12 HEAD) ($(git -C "$LIVE_DIR" rev-parse --abbrev-ref HEAD))"
    for tool in $PUBLIC_SETTINGS EXPO_PUBLIC_LUMEN_WEB_URL; do grep -q "^$tool=." "$LIVE_DIR/.env" 2>/dev/null && info "  .env has $tool (value not shown)" || info "  .env has no $tool"; done
    # Only the shape of the API address is reported, not the address.
    sed -n 's/^EXPO_PUBLIC_LUMEN_API_URL=//p' "$LIVE_DIR/.env" 2>/dev/null | head -1 | grep -qE '^"?https://[^/:@]+:8444/?"?$' && info "  API address is https on port 8444: the app can work out the web address for Live video by itself" || info "  API address is not https on port 8444: Live video needs EXPO_PUBLIC_LUMEN_WEB_URL at build time, or stays hidden"
  else info "live checkout: $LIVE_DIR not found"; fi
  if [ -d "$BUILD_ROOT" ]; then
    info "build root $BUILD_ROOT, newest first:"
    { ls -1dt "$BUILD_ROOT"/* 2>/dev/null || true; } | head -20 | while read -r tree; do
      info "  $(date -u -r "$tree" +%Y-%m-%d) $tree$([ -d "$tree/android" ] && echo '  [native project]')$([ -d "$tree/.git" ] && echo "  [git $(git -C "$tree" rev-parse --short=12 HEAD 2>/dev/null)]")"
    done
    local tree; tree=$({ ls -1dt "$BUILD_ROOT"/*/android 2>/dev/null || true; } | head -1); tree=${tree%/android}
    if [ -n "$tree" ]; then
      info "newest native project: $tree"
      [ -d "$tree/.git" ] && info "  uncommitted files there: $(git -C "$tree" status --porcelain 2>/dev/null | wc -l)"
      info "  applicationId: $(sed -n "s/.*applicationId[ =]*['\"]\([^'\"]*\)['\"].*/\1/p" "$tree/android/app/build.gradle" 2>/dev/null | head -1)"
      info "  versionCode/versionName: $(grep -E '^\s*version(Code|Name)\b' "$tree/android/app/build.gradle" 2>/dev/null | tr -s ' ' | tr '\n' ';')"
      info "  app.json scheme/package: $(grep -E '"(scheme|package)"' "$tree/app.json" 2>/dev/null | tr -s ' ' | tr '\n' ' ')"
      [ -f "$tree/android/app/google-services.json" ] && info "  google-services.json: present (not read)" || info "  google-services.json: NOT in android/app"
      info "  release signing lines in build.gradle: $(grep -cE 'signingConfig|storeFile' "$tree/android/app/build.gradle" 2>/dev/null || true); keystore files (names only): $(find "$tree/android" -maxdepth 3 \( -name '*.keystore' -o -name '*.jks' \) -printf '%f ' 2>/dev/null)"
      info "  signing property names in gradle.properties (values not shown): $(grep -oE '^[A-Za-z_.]*(STORE|KEY|store|key)[A-Za-z_.]*' "$tree/android/gradle.properties" 2>/dev/null | tr '\n' ' ')"
      for tool in $PUBLIC_SETTINGS; do grep -q "^$tool=." "$tree/.env" 2>/dev/null && info "  build tree .env has $tool (value not shown)" || info "  build tree .env has no $tool"; done
      info "  source that differs from this clone (app components lib hooks types app.json package.json):"
      local repo; repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
      diff -rq "$repo/app" "$tree/app" 2>/dev/null | head -40 | sed 's/^/INFO      /' || true
      for tool in components lib hooks types app.json package.json; do diff -rq "$repo/$tool" "$tree/$tool" 2>/dev/null | head -40 | sed 's/^/INFO      /' || true; done
    fi
    info "APKs under the build root, newest first:"
    find "$BUILD_ROOT" -maxdepth 8 -name '*.apk' -not -path '*/intermediates/*' -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -12 | cut -d' ' -f2- | { while read -r apk; do describe_apk "$apk"; done; } || true
  else info "build root: $BUILD_ROOT not found"; fi
  command -v adb >/dev/null || { info "adb missing: the phone was not inspected"; return 0; }
  adb devices -l | sed 's/^/INFO  /'
  [ "$(adb devices | awk 'NR>1 && $2=="device"' | wc -l)" = 1 ] || [ -n "${ANDROID_SERIAL:-}" ] || { info "no single authorised device: the installed app was not inspected"; return 0; }
  info "phone: $(adb shell getprop ro.product.model | tr -d '\r'), Android $(adb shell getprop ro.build.version.release | tr -d '\r')"
  if [ -z "$(installed_path)" ]; then info "$PACKAGE is not installed on this device"; return 0; fi
  info "installed $PACKAGE: versionName $(installed_field versionName) versionCode $(installed_field versionCode) firstInstall $(installed_field firstInstallTime) lastUpdate $(installed_field lastUpdateTime)"
  local tmp; tmp=$(mktemp -d); pull_installed "$tmp/installed.apk"
  info "installed APK (copied to read it, then removed):"; describe_apk "$tmp/installed.apk"
  info "  Compare its sha256 with the accepted APKs in docs/android-preview.md to see which build the phone runs."
  rm -rf "$tmp"
}

backup() {
  device
  local dir="$STATE_DIR/backup-$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "$dir"; chmod 700 "$STATE_DIR" "$dir"
  pull_installed "$dir/installed.apk"
  { echo "package=$PACKAGE"; echo "sha256=$(sha "$dir/installed.apk")"; echo "versionCode=$(installed_field versionCode)"; echo "versionName=$(installed_field versionName)"; echo "signer=$(apk_cert "$dir/installed.apk")"; } > "$dir/record"
  pass "installed APK kept at $dir/installed.apk"
  sed 's/^/INFO  /' "$dir/record"
  info "This keeps the app itself. Chats and sign-in stay on the phone and the server; an update does not remove them."
}

verify() {  # $1 = new APK, $2 = the APK it replaces
  local new="$1" old="$2" name value
  [ -s "$new" ] || die "No APK at '$new'."
  [ -n "$AAPT" ] || die "aapt/aapt2 not found; cannot read the APK's package."
  [ -n "$APKSIGNER" ] || die "apksigner not found; cannot check the APK's signature."
  "$APKSIGNER" verify "$new" >/dev/null 2>&1 && pass "new APK's signature is valid" || bad "new APK's signature does not verify"
  [ "$(apk_field "$new" name)" = "$PACKAGE" ] && pass "package is $PACKAGE" || bad "package is '$(apk_field "$new" name)', not $PACKAGE: it would install as a different app"
  local new_cert old_cert; new_cert=$(apk_cert "$new"); old_cert=$(apk_cert "$old")
  [ -n "$new_cert" ] && [ "$new_cert" = "$old_cert" ] && pass "signed by the same certificate as the installed app" || bad "signing certificate differs from the installed app's: Android would refuse the update"
  local new_code old_code; new_code=$(apk_field "$new" versionCode); old_code=$(apk_field "$old" versionCode)
  [ -n "$new_code" ] && [ -n "$old_code" ] && [ "$new_code" -ge "$old_code" ] && pass "versionCode $new_code is not below the installed $old_code" || bad "versionCode '$new_code' is below the installed '$old_code': Android would refuse it as a downgrade"
  [ "$new_code" = "$old_code" ] && info "same versionCode: the previous APK can be put back with a plain update install" || info "versionCode rises: after this update Android refuses the previous APK as a downgrade unless the app is removed, which loses its data. Keep versionCode $old_code to keep rollback simple."
  [ "$(sha "$new")" != "$(sha "$old")" ] && pass "differs from the installed APK" || bad "this is the APK that is already installed"
  # The crash of October 11: an APK built without the public settings. Each must be in the new bundle,
  # with the value the installed app carries. Values are compared, never printed.
  local new_bundle old_bundle; new_bundle=$(mktemp); old_bundle=$(mktemp)
  unzip -p "$new" assets/index.android.bundle > "$new_bundle" 2>/dev/null || true
  unzip -p "$old" assets/index.android.bundle > "$old_bundle" 2>/dev/null || true
  [ -s "$new_bundle" ] && pass "new APK contains the app bundle" || bad "new APK has no assets/index.android.bundle"
  for name in $PUBLIC_SETTINGS; do
    value=$(sed -n "s/^$name=//p" "$LIVE_DIR/.env" 2>/dev/null | head -1 | sed 's/^"\(.*\)"$/\1/')
    if [ -z "$value" ]; then bad "$name is not set in $LIVE_DIR/.env, so the new APK cannot be checked for it"; continue; fi
    grep -qaF -- "$value" "$new_bundle" && pass "new APK carries $name" || bad "new APK does not carry $name: it would fail at startup"
    grep -qaF -- "$value" "$old_bundle" && pass "installed APK carries the same $name" || bad "installed APK carries a different $name than $LIVE_DIR/.env: the new APK would point somewhere else"
  done
  rm -f "$new_bundle" "$old_bundle"
}

case "$MODE" in
  inventory) inventory ;;
  backup) backup ;;
  verify)
    device; tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT; pull_installed "$tmp/installed.apk"
    verify "$NEW" "$tmp/installed.apk"
    [ "$problems" = 0 ] || die "$problems problem(s). Do not install this APK."
    info "Safe to install. To install: ANDROID_REFRESH_CONFIRM=install:$(sha "$NEW" | cut -c1-12) $0 install $NEW" ;;
  install)
    device; [ -s "$NEW" ] || die "No APK at '$NEW'."
    [ "${ANDROID_REFRESH_CONFIRM:-}" = "install:$(sha "$NEW" | cut -c1-12)" ] || die "Set ANDROID_REFRESH_CONFIRM=install:$(sha "$NEW" | cut -c1-12) to install exactly this APK."
    backup
    kept=$(latest_backup)
    verify "$NEW" "$kept/installed.apk"
    [ "$problems" = 0 ] || die "$problems problem(s). Nothing was installed."
    echo "new_sha256=$(sha "$NEW")" >> "$kept/record"
    adb install -r "$NEW" || die "The update was refused. The phone still has the previous app and its data. Nothing was removed."
    [ "$(sha "$NEW")" = "$(tmp=$(mktemp -d); pull_installed "$tmp/a.apk"; sha "$tmp/a.apk"; rm -rf "$tmp")" ] && pass "the phone now runs this APK; its data was kept" || bad "the installed APK does not match the one just installed"
    info "To go back: ANDROID_REFRESH_CONFIRM=rollback $0 rollback" ;;
  rollback)
    device; kept=$(latest_backup)
    [ -n "$kept" ] && [ -s "$kept/installed.apk" ] || die "No kept APK under $STATE_DIR."
    [ "${ANDROID_REFRESH_CONFIRM:-}" = rollback ] || die "Set ANDROID_REFRESH_CONFIRM=rollback to put back $kept/installed.apk."
    [ "$(sha "$kept/installed.apk")" = "$(sed -n 's/^sha256=//p' "$kept/record")" ] || die "The kept APK does not match its record."
    adb install -r "$kept/installed.apk" || die "Android refused the previous APK (usually a lower versionCode). Nothing was removed and the newer app is still installed. Do not uninstall: that would erase the app's data. Rebuild the previous source with the current versionCode instead."
    pass "the previous APK is installed again; app data was kept" ;;
  *) sed -n '2,17p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
[ "$problems" = 0 ] || exit 1

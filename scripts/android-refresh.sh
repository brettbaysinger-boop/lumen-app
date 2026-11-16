#!/usr/bin/env bash
# Update of the existing Raialume Preview app on the owner's phone over ADB, and its way back.
# Run on the Android build host, from the reviewed clone, as the normal user, without sudo.
#
#   scripts/android-refresh.sh inventory           read-only: tools, build trees, known APKs, the phone, the installed app
#   scripts/android-refresh.sh phone               read-only: the attached phone and the installed app only
#   scripts/android-refresh.sh build-check         read-only: would `build` run, and what would it replace
#   ANDROID_REFRESH_CONFIRM=build:<first 12 of this clone's commit> scripts/android-refresh.sh build
#   scripts/android-refresh.sh backup              copies the installed APK off the phone (the phone is not changed)
#   scripts/android-refresh.sh verify NEW.apk      read-only: is NEW.apk a safe update of what is installed
#   ANDROID_REFRESH_CONFIRM=install:<first 12 of NEW.apk's sha256> scripts/android-refresh.sh install NEW.apk
#   ANDROID_REFRESH_CONFIRM=rollback scripts/android-refresh.sh rollback    the APK that was installed before
#   ANDROID_REFRESH_CONFIRM=rollback scripts/android-refresh.sh rollback OLDER.apk   an earlier kept APK instead
#
# Settings: PACKAGE (default com.raialume.preview), BUILD_ROOT (default /home/brett/lumen-android-builds),
# BUILD_TREE (default $BUILD_ROOT/preview.ijhcJd, the existing native project),
# LIVE_DIR (default /home/brett/lumen-push; only its .env is read, for the app's public settings),
# ANDROID_SERIAL when more than one device is attached, ANDROID_REFRESH_KEEP (see `build`).
#
# `build` works only in the existing native project. It keeps a copy of that project's JavaScript source and
# its current release APK, replaces only app/ components/ lib/ hooks/ types/ with this clone's, and runs the
# project's own Gradle release build with the public settings taken from the live .env. It never touches
# android/, app.json, package.json, node_modules, google-services.json or signing files, never runs
# `expo prebuild`, and never needs the phone. A file in the project that was never committed to this
# repository is a local edit: `build` stops and names it. To keep such files exactly as they are, list them
# in ANDROID_REFRESH_KEEP (space separated). If the build fails, the previous source is put back.
#
# The only command that changes the phone is `adb install -r`, which replaces the app and keeps its data.
# This script never uninstalls, never clears app data, never signs or re-signs an APK, and never prints a
# setting's value, a key or a password. It touches no Lumen service and reads nothing from the live checkout
# but its .env.
set -euo pipefail
MODE="${1:-}"; NEW="${2:-}"
PACKAGE="${PACKAGE:-com.raialume.preview}"
BUILD_ROOT="${BUILD_ROOT:-/home/brett/lumen-android-builds}"
LIVE_DIR="${LIVE_DIR:-/home/brett/lumen-push}"
BUILD_TREE="${BUILD_TREE:-$BUILD_ROOT/preview.ijhcJd}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIRS="app components lib hooks types"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/lumen-android-refresh"
# Text that only this refresh's JavaScript contains: proof that an APK carries the new bundle, not an older one.
JS_MARKER="Watch it here inside Raialume"
PUBLIC_SETTINGS="EXPO_PUBLIC_SUPABASE_URL EXPO_PUBLIC_SUPABASE_ANON_KEY EXPO_PUBLIC_LUMEN_API_URL"
problems=0
pass() { printf 'PASS  %s\n' "$1"; }
bad()  { printf 'FAIL  %s\n' "$1"; problems=$((problems + 1)); }
info() { printf 'INFO  %s\n' "$1"; }
die()  { printf 'STOP  %s\n' "$1" >&2; exit 1; }
[ "$(id -u)" != 0 ] || die "Run as the normal user, not root."
# Every run ends with one RESULT line. No RESULT line, or RESULT ... FAILED, means the step did not finish:
# do not go on to the next step. Do not pipe a step through `tail` or `head`, which hides this line or the exit code.
trap 'code=$?; case "$MODE" in inventory|phone|backup|build-check|build|verify|install|rollback) [ "$code" = 0 ] && echo "RESULT $MODE: OK" || echo "RESULT $MODE: FAILED (exit $code)" ;; esac' EXIT

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
# adb: on PATH, or in the Android SDK's platform-tools.
ADB=$(command -v adb 2>/dev/null || true)
for root in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" "$HOME/Android/Sdk" "$HOME/android-sdk"; do
  [ -z "$ADB" ] && [ -n "$root" ] && [ -x "$root/platform-tools/adb" ] && ADB="$root/platform-tools/adb"
done
adb() { "$ADB" "$@"; }
NO_ADB="adb was not found on PATH or in the Android SDK's platform-tools. Install it (sdkmanager \"platform-tools\", or the distribution's adb package) and run this again."
AAPT=$(sdk_tool aapt2 || sdk_tool aapt || true); APKSIGNER=$(sdk_tool apksigner || true)
sha() { sha256sum "$1" | cut -d' ' -f1; }
badging() { [ -n "$AAPT" ] && "$AAPT" dump badging "$1" 2>/dev/null | sed -n '1p'; }
apk_field() { badging "$1" | sed -n "s/.*[ :]$2='\([^']*\)'.*/\1/p"; }
# The signing certificate's SHA-256 digest: public, identifies the signer, not a secret.
apk_cert() { [ -n "$APKSIGNER" ] && "$APKSIGNER" verify --print-certs "$1" 2>/dev/null | sed -n 's/^Signer #1 certificate SHA-256 digest: //p' | sed -n '1p'; }
describe_apk() { info "  $1"; info "    sha256 $(sha "$1")  package $(apk_field "$1" name)  versionCode $(apk_field "$1" versionCode)  versionName $(apk_field "$1" versionName)  signer ${2:-$(apk_cert "$1")}"; }

device() {  # one authorised device, or stop
  [ -n "$ADB" ] || die "$NO_ADB"
  local count
  count=$(adb devices | awk 'NR>1 && $2=="device"' | wc -l)
  if [ -n "${ANDROID_SERIAL:-}" ]; then adb get-state >/dev/null 2>&1 || die "Device $ANDROID_SERIAL is not attached and authorised."
  elif [ "$count" != 1 ]; then die "Expected one attached, authorised device and found $count. Attach the phone, accept the USB debugging prompt, or set ANDROID_SERIAL."; fi
}
installed_field() { adb shell dumpsys package "$PACKAGE" 2>/dev/null | tr -d '\r' | sed -n "s/^ *$1=\([^ ]*\).*/\1/p" | sed -n '1p'; }
installed_path() { adb shell pm path "$PACKAGE" 2>/dev/null | tr -d '\r' | sed -n 's/^package://p' | { grep '/base\.apk$' || true; } | sed -n '1p'; }
pull_installed() {  # copies the installed APK to $1; reading it does not change the phone
  local remote; remote=$(installed_path)
  [ -n "$remote" ] || die "$PACKAGE is not installed on the attached device. Nothing to update; this script does not do first installs."
  adb pull "$remote" "$1" >/dev/null 2>&1 || die "Could not copy the installed APK off the phone."
}
latest_backup() { { ls -1d "$STATE_DIR"/backup-* 2>/dev/null || true; } | sort | tail -1; }

inventory() {
  info "host $(hostname), user $(id -un), $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  local tool
  info "adb: ${ADB:-not found}"
  for tool in java node npx; do command -v "$tool" >/dev/null && info "$tool: $(command -v "$tool")" || info "$tool: not on PATH"; done
  command -v java >/dev/null && info "java version: $(java -version 2>&1 | sed -n '1p')"
  info "aapt: ${AAPT:-not found}"; info "apksigner: ${APKSIGNER:-not found}"
  info "ANDROID_HOME=${ANDROID_HOME:-unset} ANDROID_SDK_ROOT=${ANDROID_SDK_ROOT:-unset}"
  if [ -d "$LIVE_DIR/.git" ]; then
    info "live checkout: $LIVE_DIR @ $(git -C "$LIVE_DIR" rev-parse --short=12 HEAD) ($(git -C "$LIVE_DIR" rev-parse --abbrev-ref HEAD))"
    for tool in $PUBLIC_SETTINGS EXPO_PUBLIC_LUMEN_WEB_URL; do grep -q "^$tool=." "$LIVE_DIR/.env" 2>/dev/null && info "  .env has $tool (value not shown)" || info "  .env has no $tool"; done
    # Only the shape of the API address is reported, not the address.
    sed -n 's/^EXPO_PUBLIC_LUMEN_API_URL=//p' "$LIVE_DIR/.env" 2>/dev/null | sed -n '1p' | grep -qE '^"?https://[^/:@]+:8444/?"?$' && info "  API address is https on port 8444: the app can work out the web address for Live video by itself" || info "  API address is not https on port 8444: Live video needs EXPO_PUBLIC_LUMEN_WEB_URL at build time, or stays hidden"
  else info "live checkout: $LIVE_DIR not found"; fi
  if [ -d "$BUILD_ROOT" ]; then
    info "build root $BUILD_ROOT, newest first:"
    { ls -1dt "$BUILD_ROOT"/* 2>/dev/null || true; } | sed -n '1,20p' | while read -r tree; do
      info "  $(date -u -r "$tree" +%Y-%m-%d) $tree$([ -d "$tree/android" ] && echo '  [native project]')$([ -d "$tree/.git" ] && echo "  [git $(git -C "$tree" rev-parse --short=12 HEAD 2>/dev/null)]")"
    done
    local tree; tree=$({ ls -1dt "$BUILD_ROOT"/*/android 2>/dev/null || true; } | sed -n '1p'); tree=${tree%/android}
    if [ -n "$tree" ]; then
      info "newest native project: $tree"
      [ -d "$tree/.git" ] && info "  uncommitted files there: $(git -C "$tree" status --porcelain 2>/dev/null | wc -l)"
      info "  applicationId: $(sed -n "s/.*applicationId[ =]*['\"]\([^'\"]*\)['\"].*/\1/p" "$tree/android/app/build.gradle" 2>/dev/null | sed -n '1p')"
      info "  versionCode/versionName: $(grep -E '^\s*version(Code|Name)\b' "$tree/android/app/build.gradle" 2>/dev/null | tr -s ' ' | tr '\n' ';')"
      info "  app.json scheme/package: $(grep -E '"(scheme|package)"' "$tree/app.json" 2>/dev/null | tr -s ' ' | tr '\n' ' ')"
      [ -f "$tree/android/app/google-services.json" ] && info "  google-services.json: present (not read)" || info "  google-services.json: NOT in android/app"
      info "  release signing lines in build.gradle: $(grep -cE 'signingConfig|storeFile' "$tree/android/app/build.gradle" 2>/dev/null || true); keystore files (names only): $(find "$tree/android" -maxdepth 3 \( -name '*.keystore' -o -name '*.jks' \) -printf '%f ' 2>/dev/null)"
      info "  signing property names in gradle.properties (values not shown): $(grep -oE '^[A-Za-z_.]*(STORE|KEY|store|key)[A-Za-z_.]*' "$tree/android/gradle.properties" 2>/dev/null | tr '\n' ' ')"
      for tool in $PUBLIC_SETTINGS; do grep -q "^$tool=." "$tree/.env" 2>/dev/null && info "  build tree .env has $tool (value not shown)" || info "  build tree .env has no $tool"; done
      info "  source that differs from this clone (app components lib hooks types app.json package.json):"
      local repo; repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
      diff -rq "$repo/app" "$tree/app" 2>/dev/null | sed -n '1,40p' | sed 's/^/INFO      /' || true
      for tool in components lib hooks types app.json package.json; do diff -rq "$repo/$tool" "$tree/$tool" 2>/dev/null | sed -n '1,40p' | sed 's/^/INFO      /' || true; done
    fi
    info "APKs under the build root, newest first:"
    find "$BUILD_ROOT" -maxdepth 8 -name '*.apk' -not -path '*/intermediates/*' -printf '%T@ %p\n' 2>/dev/null | sort -rn | sed -n '1,12p' | cut -d' ' -f2- | { while read -r apk; do describe_apk "$apk"; done; } || true
  else info "build root: $BUILD_ROOT not found"; fi
  phone_report
}

phone_report() {
  [ -n "$ADB" ] || { info "$NO_ADB"; info "The phone was not inspected."; return 0; }
  info "adb: $ADB"
  adb devices -l | sed 's/^/INFO  /'
  [ "$(adb devices | awk 'NR>1 && $2=="device"' | wc -l)" = 1 ] || [ -n "${ANDROID_SERIAL:-}" ] || { info "no single authorised device: the installed app was not inspected"; return 0; }
  info "selected device: ${ANDROID_SERIAL:-$(adb devices | awk 'NR>1 && $2=="device" {print $1}')}"
  info "phone: $(adb shell getprop ro.product.model | tr -d '\r'), Android $(adb shell getprop ro.build.version.release | tr -d '\r')"
  if [ -z "$(installed_path)" ]; then info "$PACKAGE is not installed on this device"; return 0; fi
  info "installed $PACKAGE: versionName $(installed_field versionName) versionCode $(installed_field versionCode) firstInstall $(installed_field firstInstallTime) lastUpdate $(installed_field lastUpdateTime)"
  local tmp; tmp=$(mktemp -d); pull_installed "$tmp/installed.apk"
  info "installed APK (copied to read it, then removed):"; describe_apk "$tmp/installed.apk"
  info "  Compare its sha256 with the APKs listed above and in docs/android-preview.md to see which build the phone runs."
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
  [ "$new_code" = "$old_code" ] && info "same versionCode: the previous APK can be put back with a plain update install" || [ "${new_code:-0}" -lt "${old_code:-0}" ] || info "versionCode rises: after this update Android refuses the previous APK as a downgrade unless the app is removed, which loses its data. Keep versionCode $old_code to keep rollback simple."
  [ "$(sha "$new")" != "$(sha "$old")" ] && pass "differs from the APK it replaces" || bad "this is the APK that is already installed"
  # The crash of October 11: an APK built without the public settings. Each must be in the new bundle,
  # with the value the installed app carries. Values are compared, never printed.
  local new_bundle old_bundle; new_bundle=$(mktemp); old_bundle=$(mktemp)
  unzip -p "$new" assets/index.android.bundle > "$new_bundle" 2>/dev/null || true
  unzip -p "$old" assets/index.android.bundle > "$old_bundle" 2>/dev/null || true
  [ -s "$new_bundle" ] && pass "new APK contains the app bundle" || bad "new APK has no assets/index.android.bundle"
  grep -qaF "$JS_MARKER" "$new_bundle" && pass "new APK carries the refreshed JavaScript (the Live video action)" || bad "new APK does not carry the refreshed JavaScript: it is an older bundle"
  for name in $PUBLIC_SETTINGS; do
    value=$(sed -n "s/^$name=//p" "$LIVE_DIR/.env" 2>/dev/null | sed -n '1p' | sed 's/^"\(.*\)"$/\1/')
    if [ -z "$value" ]; then bad "$name is not set in $LIVE_DIR/.env, so the new APK cannot be checked for it"; continue; fi
    grep -qaF -- "$value" "$new_bundle" && pass "new APK carries $name" || bad "new APK does not carry $name: it would fail at startup"
    grep -qaF -- "$value" "$old_bundle" && pass "installed APK carries the same $name" || bad "installed APK carries a different $name than $LIVE_DIR/.env: the new APK would point somewhere else"
  done
  rm -f "$new_bundle" "$old_bundle"
}

# --- build -------------------------------------------------------------------------------------------
setting() { sed -n "s/^$1=//p" "$LIVE_DIR/.env" 2>/dev/null | sed -n '1p' | sed 's/^"\(.*\)"$/\1/; s/^'"'"'\(.*\)'"'"'$/\1/'; }
kept_file() { local item; for item in ${ANDROID_REFRESH_KEEP:-}; do [ "$item" = "$1" ] && return 0; done; return 1; }
# Was this exact content ever committed at this path? If not, it is an edit made only in the build tree.
ever_committed() { local blobs; blobs=$(git -C "$REPO" log --all --format= --raw --no-abbrev -- "$1" 2>/dev/null | awk '{print $4}'); grep -qx "$(git -C "$REPO" hash-object "$BUILD_TREE/$1")" <<< "$blobs"; }

build_check() {
  local target dir file name missing="" local_edits="" changes=0
  target=$(git -C "$REPO" rev-parse HEAD)
  info "source: $REPO @ ${target:0:12}"; info "native project: $BUILD_TREE"
  [ -z "$(git -C "$REPO" status --porcelain --untracked-files=no)" ] && pass "this clone has no uncommitted changes" || bad "this clone has uncommitted changes; build a reviewed commit only"
  [ "$(git -C "$REPO" rev-parse --is-shallow-repository)" = false ] && pass "this clone has the full history, so local edits in the native project can be told apart" || bad "this clone is shallow; local edits in the native project cannot be told from old committed files. Use a full clone."
  [ -x "$BUILD_TREE/android/gradlew" ] && [ -d "$BUILD_TREE/node_modules" ] || { bad "$BUILD_TREE is not the built native project (android/gradlew or node_modules missing)"; return; }
  case "$(realpath "$BUILD_TREE")/" in "$(realpath "$LIVE_DIR" 2>/dev/null)/"*|"$(realpath "$REPO")/"*) bad "the native project must be separate from the live checkout and from this clone"; return ;; esac
  pass "native project is separate from the live checkout and this clone"
  [ "$(sed -n "s/.*applicationId[ =]*['\"]\([^'\"]*\)['\"].*/\1/p" "$BUILD_TREE/android/app/build.gradle" | sed -n '1p')" = "$PACKAGE" ] && pass "its applicationId is $PACKAGE" || bad "its applicationId is not $PACKAGE"
  [ -f "$BUILD_TREE/android/app/google-services.json" ] && pass "google-services.json is in place (not read)" || bad "google-services.json is missing from android/app: notifications would break"
  grep -q '"raialume-preview"' "$BUILD_TREE/app.json" 2>/dev/null && pass "its app.json has the raialume-preview sign-in scheme" || bad "its app.json lacks the raialume-preview scheme: Google sign-in would not return to the app"
  command -v java >/dev/null && java -version 2>&1 | sed -n '1p' | grep -q '"17\.' && pass "JDK 17" || bad "java is not JDK 17"
  [ -n "$AAPT" ] && [ -n "$APKSIGNER" ] && command -v unzip >/dev/null && pass "aapt, apksigner and unzip found" || bad "aapt, apksigner or unzip not found"
  OLD_APK="$BUILD_TREE/android/app/build/outputs/apk/release/app-release.apk"
  if [ -s "$OLD_APK" ]; then pass "the project's current release APK is there to compare against"; describe_apk "$OLD_APK"; else bad "no current release APK in the project to compare the new one against"; fi
  for name in $PUBLIC_SETTINGS; do [ -n "$(setting "$name")" ] && pass "$name is set in $LIVE_DIR/.env (value not shown)" || bad "$name is not set in $LIVE_DIR/.env"; done
  # Every package the new source imports must already be installed in the project: nothing is installed here.
  missing=$(cd "$REPO" && node -e 'const fs=require("fs"),tree=process.argv[1];for(const name of Object.keys(require("./package.json").dependencies))if(!fs.existsSync(`${tree}/node_modules/${name}/package.json`))console.log(name)' "$BUILD_TREE" 2>/dev/null | tr '\n' ' ') || missing="(could not be checked)"
  [ -z "$missing" ] && pass "every package the source needs is already installed in the project" || bad "packages missing from the project's node_modules: $missing"
  # Live video inside the app needs the web view's native part, which exists only if the project's own
  # package.json lists it. This script never changes that file; without it the app offers the browser only.
  grep -q '"react-native-webview"' "$BUILD_TREE/package.json" 2>/dev/null && info "native project lists react-native-webview: in-app Live video can be offered" || info "native project does NOT list react-native-webview: this build will offer Live video in the browser only (no crash, no in-app view)"
  # Turning the phone in the Live Room needs the native part of expo-screen-orientation. Same rule: it is
  # there only if the project's own package.json lists it, and this script never adds it.
  grep -q '"expo-screen-orientation"' "$BUILD_TREE/package.json" 2>/dev/null && info "native project lists expo-screen-orientation: the Live Room can turn with the phone" || info "native project does NOT list expo-screen-orientation: the Live Room stays portrait, with the Full screen control in Theater (no crash)"
  for dir in $SOURCE_DIRS; do
    [ -d "$BUILD_TREE/$dir" ] || continue
    while read -r file; do
      file="$dir/${file#./}"
      if [ -f "$REPO/$file" ] && cmp -s "$REPO/$file" "$BUILD_TREE/$file"; then continue; fi
      if kept_file "$file"; then info "  kept as it is: $file"; continue; fi
      changes=$((changes + 1))
      ever_committed "$file" || local_edits="$local_edits $file"
    done < <(cd "$BUILD_TREE/$dir" && find . -type f | sort)
  done
  for dir in $SOURCE_DIRS; do changes=$((changes + $(cd "$REPO/$dir" && find . -type f | while read -r file; do [ -e "$BUILD_TREE/$dir/$file" ] || echo x; done | wc -l))); done
  info "files of $SOURCE_DIRS that would change: $changes"
  if [ -z "$local_edits" ]; then pass "every file to be replaced is an older committed version: no local edit would be lost"
  else bad "the native project has files that were never committed. Replacing them would lose local edits:"; for file in $local_edits; do info "    $file"; done
       info "  To keep them exactly as they are: ANDROID_REFRESH_KEEP=\"${local_edits# }\""; fi
  if [ "$changes" = 0 ]; then
    bad "the native project already has this source: nothing to build"
    # Usually an earlier build already ran. Say what it left, so its APK can be verified instead of built again.
    local last; last=$({ ls -1d "$STATE_DIR"/build-* 2>/dev/null || true; } | sort | tail -1)
    if [ -n "$last" ] && [ -f "$last/record" ]; then
      info "an earlier build finished: $last"; sed -n '/^\(commit\|sha256\|previous_sha256\)=/s/^/INFO    /p' "$last/record"
      if [ -s "$OLD_APK" ] && [ "$(sha "$OLD_APK")" = "$(sed -n 's/^sha256=//p' "$last/record")" ]; then info "the project's release APK is that build's APK. Do not build again; with the phone attached run: $0 verify $(ls -1 "$last"/raialume-preview-*.apk 2>/dev/null | sed -n '1p')"
      else info "the project's release APK is NOT that build's APK: stop and report this"; fi
    elif [ -n "$last" ]; then info "an earlier build was started but did not finish its checks: $last (see build.log there). Its APK can still be checked with: $0 verify $OLD_APK"
    else info "no build by this script is recorded under $STATE_DIR: the source was put there some other way"; fi
  fi
}

build() {
  local target record dir name fresh new status=0
  target=$(git -C "$REPO" rev-parse HEAD)
  build_check
  [ "$problems" = 0 ] || die "$problems problem(s). Nothing was changed."
  [ "${ANDROID_REFRESH_CONFIRM:-}" = "build:${target:0:12}" ] || die "Checks passed. Set ANDROID_REFRESH_CONFIRM=build:${target:0:12} to build this commit."
  mkdir -p "$STATE_DIR"; chmod 700 "$STATE_DIR"
  record=$(mktemp -d "$STATE_DIR/build-$(date -u +%Y%m%dT%H%M%SZ)-${target:0:12}.XXXX")
  cp -p "$OLD_APK" "$record/previous.apk"
  tar -C "$BUILD_TREE" -cf "$record/previous-source.tar" $(cd "$BUILD_TREE" && ls -d $SOURCE_DIRS 2>/dev/null)
  pass "kept the project's previous source and APK in $record"
  restore() { for dir in $SOURCE_DIRS; do rm -rf "${BUILD_TREE:?}/$dir"; done; tar -C "$BUILD_TREE" -xf "$record/previous-source.tar"; cp -p "$record/previous.apk" "$OLD_APK"; }
  # Files to keep are set aside, the source directories are replaced whole, then the kept files go back.
  mkdir "$record/kept"
  for name in ${ANDROID_REFRESH_KEEP:-}; do [ -f "$BUILD_TREE/$name" ] && { mkdir -p "$record/kept/$(dirname "$name")"; cp -p "$BUILD_TREE/$name" "$record/kept/$name"; }; done
  for dir in $SOURCE_DIRS; do rm -rf "${BUILD_TREE:?}/$dir"; cp -a "$REPO/$dir" "$BUILD_TREE/$dir"; done
  cp -a "$record/kept/." "$BUILD_TREE/"
  pass "source of ${target:0:12} is in the project (android/, app.json, package.json, node_modules untouched)"
  # A fresh bundler cache and no earlier bundle, so the JavaScript is bundled again with these settings.
  fresh=$(mktemp -d)
  find "$BUILD_TREE/android/app/build" -name 'index.android.bundle' -delete 2>/dev/null || true
  info "building; the log is $record/build.log"
  ( cd "$BUILD_TREE/android"
    for name in $PUBLIC_SETTINGS EXPO_PUBLIC_LUMEN_WEB_URL; do value=$(setting "$name"); [ -n "$value" ] && export "$name=$value"; done
    NODE_ENV=production EXPO_NO_TELEMETRY=1 TMPDIR="$fresh" ./gradlew assembleRelease > "$record/build.log" 2>&1 ) || status=$?
  rm -rf "$fresh"
  if [ "$status" != 0 ] || [ ! -s "$OLD_APK" ]; then restore; die "The build failed (see $record/build.log). The project's previous source and APK were put back."; fi
  new="$record/raialume-preview-${target:0:12}.apk"; cp -p "$OLD_APK" "$new"
  verify "$new" "$record/previous.apk"
  unzip -p "$new" assets/index.android.bundle > "$record/bundle.tmp" 2>/dev/null || true
  [ "$(apk_field "$new" versionCode)" = "$(apk_field "$record/previous.apk" versionCode)" ] && pass "versionCode is unchanged, so the previous APK can be put back as a plain update" || bad "versionCode changed: rollback would be refused as a downgrade"
  grep -qaF "$JS_MARKER" "$record/bundle.tmp" && pass "the new APK carries this commit's JavaScript" || bad "the new APK does not carry this commit's JavaScript (stale bundle)"
  rm -f "$record/bundle.tmp"
  { echo "commit=$target"; echo "sha256=$(sha "$new")"; echo "previous_sha256=$(sha "$record/previous.apk")"; echo "signer=$(apk_cert "$new")"; } > "$record/record"
  [ "$problems" = 0 ] || die "$problems problem(s) with the built APK. Do not install it. It is at $new; the previous one is $record/previous.apk."
  pass "built and checked: $new"; describe_apk "$new"
  info "Nothing was installed. Next, with the phone attached: $0 verify $new"
}

case "$MODE" in
  # Reports only: a probe that fails is shown as an empty value, it does not end the report.
  inventory) set +e +o pipefail; inventory; exit 0 ;;
  phone) set +e +o pipefail; phone_report; exit 0 ;;
  build-check) build_check; [ "$problems" != 0 ] || info "Ready. To build: ANDROID_REFRESH_CONFIRM=build:$(git -C "$REPO" rev-parse --short=12 HEAD) $0 build" ;;
  build) build ;;
  backup) backup ;;
  verify)
    device; tmp=$(mktemp -d); pull_installed "$tmp/installed.apk"
    verify "$NEW" "$tmp/installed.apk"; rm -rf "$tmp"
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
    device
    if [ -n "$NEW" ]; then  # a named earlier APK: it must be this app, signed by the same certificate as what is installed
      back="$NEW"; [ -s "$back" ] || die "No APK at '$back'."
      tmp=$(mktemp -d); pull_installed "$tmp/installed.apk"; now_cert=$(apk_cert "$tmp/installed.apk"); rm -rf "$tmp"
      [ "$(apk_field "$back" name)" = "$PACKAGE" ] && [ -n "$now_cert" ] && [ "$(apk_cert "$back")" = "$now_cert" ] || die "'$back' is not $PACKAGE signed by the installed app's certificate. Nothing was changed."
    else
      kept=$(latest_backup); back="$kept/installed.apk"
      [ -n "$kept" ] && [ -s "$back" ] || die "No kept APK under $STATE_DIR."
      [ "$(sha "$back")" = "$(sed -n 's/^sha256=//p' "$kept/record")" ] || die "The kept APK does not match its record."
    fi
    info "to put back: $back (sha256 $(sha "$back"))"
    [ "${ANDROID_REFRESH_CONFIRM:-}" = rollback ] || die "Set ANDROID_REFRESH_CONFIRM=rollback to put back $back."
    adb install -r "$back" || die "Android refused the previous APK (usually a lower versionCode). Nothing was removed and the newer app is still installed. Do not uninstall: that would erase the app's data. Rebuild the previous source with the current versionCode instead."
    pass "the previous APK is installed again; app data was kept" ;;
  *) sed -n '2,32p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
[ "$problems" = 0 ] || exit 1

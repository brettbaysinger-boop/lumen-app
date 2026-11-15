#!/usr/bin/env bash
# Offline test of scripts/android-refresh.sh: stand-ins for adb, aapt2, apksigner and id, and
# fictional "APKs" made here. Touches no device, no SDK and no real checkout.
set -euo pipefail
SRC=$(cd "$(dirname "$0")/.." && pwd)
T=$(mktemp -d); T=$(realpath "$T"); trap 'rm -rf "$T"' EXIT
fail=0; ok() { echo "PASS $1"; }; bad() { echo "FAIL $1"; fail=1; }
S=$T/state; B=$T/bin; L=$T/live; R=$T/builds; H=$T/home; mkdir -p "$S" "$B" "$L" "$R/preview.fictional/android/app" "$H"
printf 'EXPO_PUBLIC_SUPABASE_URL=https://supabase.fictional.invalid\nEXPO_PUBLIC_SUPABASE_ANON_KEY=fictional-anon-key\nEXPO_PUBLIC_LUMEN_API_URL=https://lumen.fictional.invalid:8444\n' > "$L/.env"
SETTINGS='https://supabase.fictional.invalid fictional-anon-key https://lumen.fictional.invalid:8444'
apk() {  # apk FILE PACKAGE VERSIONCODE CERT BUNDLE-TEXT
  local d; d=$(mktemp -d -p "$T"); mkdir -p "$d/assets"; printf '%s\n' "$5" > "$d/assets/index.android.bundle"
  printf "package: name='%s' versionCode='%s' versionName='1.0.0'\n" "$2" "$3" > "$d/badging"; echo "$4" > "$d/cert"
  (cd "$d" && zip -q -r "$1" .); rm -rf "$d"
}
apk "$T/old.apk" com.raialume.preview 1 AAAA "old app $SETTINGS"
apk "$T/new.apk" com.raialume.preview 1 AAAA "new app $SETTINGS"
apk "$T/other-package.apk" com.raialume.other 1 AAAA "new app $SETTINGS"
apk "$T/other-key.apk" com.raialume.preview 1 BBBB "new app $SETTINGS"
apk "$T/unsigned.apk" com.raialume.preview 1 INVALID "new app $SETTINGS"
apk "$T/no-settings.apk" com.raialume.preview 1 AAAA "new app undefined undefined undefined"
apk "$T/other-server.apk" com.raialume.preview 1 AAAA "new app https://supabase.fictional.invalid fictional-anon-key https://elsewhere.invalid"
apk "$T/newer.apk" com.raialume.preview 2 AAAA "new app $SETTINGS"
cp "$T/old.apk" "$R/preview.fictional/android/app/app-release.apk"; touch "$R/preview.fictional/android/app/google-services.json"
echo 'MYAPP_UPLOAD_STORE_PASSWORD=never-print-this' > "$R/preview.fictional/android/gradle.properties"
cp "$T/old.apk" "$S/phone.apk"; echo 1 > "$S/devices"

printf '#!/usr/bin/env bash\nunzip -p "$3" badging\n' > "$B/aapt2"
cat > "$B/apksigner" <<'STUB'
#!/usr/bin/env bash
file="${@: -1}"; cert=$(unzip -p "$file" cert); [ "$cert" != INVALID ] || exit 1
[ "$2" = --print-certs ] && echo "Signer #1 certificate SHA-256 digest: $cert"; exit 0
STUB
printf '#!/usr/bin/env bash\ncase "$1" in -u) [ -f "%s/root" ] && echo 0 || echo 1000 ;; *) echo fictional ;; esac\n' "$S" > "$B/id"
mkdir -p "$H/Android/Sdk/platform-tools"; ADB="$H/Android/Sdk/platform-tools/adb"   # not on PATH: found in the SDK
cat > "$ADB" <<STUB
#!/usr/bin/env bash
echo "adb \$*" >> "$S/calls"
code() { unzip -p "\$1" badging | sed "s/.*versionCode='\([0-9]*\)'.*/\1/"; }
case "\$*" in
  devices*) echo "List of devices attached"; for n in \$(seq 1 \$(cat "$S/devices")); do echo "FICTIONAL\$n device model:SM_S901U"; done ;;
  "shell pm path "*) [ -f "$S/phone.apk" ] && echo "package:/data/app/fictional/base.apk" ;;
  "shell dumpsys package "*) echo "    versionCode=\$(code "$S/phone.apk") minSdk=24"; echo "    versionName=1.0.0"; echo "    firstInstallTime=2026-10-10"; echo "    lastUpdateTime=2026-10-11" ;;
  "shell getprop "*) echo SM-S901U ;;
  "pull "*) cp "$S/phone.apk" "\$3" ;;
  "install -r "*) [ "\$(code "\$3")" -ge "\$(code "$S/phone.apk")" ] || { echo "INSTALL_FAILED_VERSION_DOWNGRADE"; exit 1; }; cp "\$3" "$S/phone.apk"; echo Success ;;
  *) echo "unexpected adb call: \$*" >&2; exit 9 ;;
esac
STUB
chmod +x "$B"/* "$ADB"
run() { env PATH="$B:$PATH" HOME="$H" XDG_STATE_HOME="$H/state" LIVE_DIR="$L" BUILD_ROOT="$R" "$@" bash "$SRC/scripts/android-refresh.sh" "${ARGS[@]}"; }
phone() { sha256sum "$S/phone.apk" | cut -d' ' -f1; }; sum() { sha256sum "$1" | cut -d' ' -f1; }
changed() { grep -cE '^adb (install|uninstall|shell pm (clear|uninstall)|shell am|push|root|reboot)' "$S/calls" || true; }
OLD=$(phone); CONFIRM="install:$(sum "$T/new.apk" | cut -c1-12)"

ARGS=(inventory); out=$(run 2>&1) && ok "inventory runs" || bad "inventory: $out"
[[ $out == *"SM-S901U"* && $out == *"$OLD"* && $out == *"google-services.json: present (not read)"* && $out == *"MYAPP_UPLOAD_STORE_PASSWORD"* ]] && ok "inventory: phone, installed APK hash, build tree and signing property names reported" || bad "inventory content: $out"
[[ $out != *never-print-this* && $out != *fictional-anon-key* && $out != *lumen.fictional.invalid* ]] && ok "inventory: no setting value or password printed" || bad "inventory printed a value"
[[ $(changed) == 0 && $(phone) == "$OLD" ]] && ok "inventory: read-only on the phone" || bad "inventory changed the phone"
[[ $out == *"adb: $ADB"* && $out == *"selected device: FICTIONAL1"* ]] && ok "inventory: adb found in the SDK's platform-tools, selected device named" || bad "adb discovery: $out"
ARGS=(phone); out=$(run 2>&1) && [[ $out == *"$OLD"* && $out != *"build root"* && $(changed) == 0 ]] && ok "phone: device and installed APK only, read-only" || bad "phone: $out"
mv "$ADB" "$ADB.off"; out=$(run 2>&1) && [[ $out == *"adb was not found"* ]] && ok "phone: says so when adb is not installed" || bad "phone without adb: $out"; mv "$ADB.off" "$ADB"
ARGS=(inventory)
echo 0 > "$S/devices"; out=$(run 2>&1) && ok "inventory: works without a phone attached" || bad "inventory without phone: $out"; echo 1 > "$S/devices"

ARGS=(verify "$T/new.apk"); out=$(run 2>&1) && [[ $out == *"Safe to install"*"$CONFIRM"* ]] && ok "verify: a same-package, same-key, same-settings APK passes" || bad "verify good: $out"
[[ $out != *fictional-anon-key* ]] && ok "verify: settings compared, not printed" || bad "verify printed a value"
refuse() { ARGS=(verify "$T/$1"); if out=$(run 2>&1); then bad "verify accepted $1"; elif [[ $out == *"$2"* ]]; then ok "verify refuses: $3"; else bad "verify $1: $out"; fi; }
refuse other-package.apk "different app" "another package id"
refuse other-key.apk "certificate differs" "another signing key"
refuse unsigned.apk "signature does not verify" "an invalid signature"
refuse no-settings.apk "would fail at startup" "an APK built without the public settings"
refuse other-server.apk "would fail at startup" "an APK pointing at another server"
refuse old.apk "already installed" "the APK that is already installed"
cp "$T/newer.apk" "$S/phone.apk"; refuse new.apk "downgrade" "a lower versionCode"; cp "$T/old.apk" "$S/phone.apk"
ARGS=(verify "$T/newer.apk"); out=$(run 2>&1) && [[ $out == *"refuses the previous APK as a downgrade"* ]] && ok "verify: a raised versionCode passes with a rollback warning" || bad "verify newer: $out"
[[ $(changed) == 0 && $(phone) == "$OLD" ]] && ok "verify: read-only on the phone" || bad "verify changed the phone"

ARGS=(install "$T/new.apk"); if out=$(run 2>&1); then bad "install ran without confirmation"; else [[ $(changed) == 0 ]] && ok "install: refuses without the confirmation for this exact APK" || bad "install touched the phone unconfirmed"; fi
if out=$(run ANDROID_REFRESH_CONFIRM="install:000000000000" 2>&1); then bad "install accepted another APK's confirmation"; else ok "install: a confirmation for another APK is refused"; fi
ARGS=(install "$T/other-key.apk"); if out=$(run ANDROID_REFRESH_CONFIRM="install:$(sum "$T/other-key.apk" | cut -c1-12)" 2>&1); then bad "install took a wrong-key APK"; else [[ $(changed) == 0 && $(phone) == "$OLD" ]] && ok "install: a confirmed but unsafe APK is still refused, phone untouched" || bad "unsafe install touched the phone"; fi
echo 2 > "$S/devices"; ARGS=(install "$T/new.apk"); if out=$(run ANDROID_REFRESH_CONFIRM="$CONFIRM" 2>&1); then bad "install with two devices"; else ok "install: refuses when more than one device is attached"; fi; echo 1 > "$S/devices"
touch "$S/root"; if out=$(run ANDROID_REFRESH_CONFIRM="$CONFIRM" 2>&1); then bad "ran as root"; else ok "refuses to run as root"; fi; rm "$S/root"
out=$(run ANDROID_REFRESH_CONFIRM="$CONFIRM" 2>&1) && [[ $(phone) == "$(sum "$T/new.apk")" ]] && ok "install: the confirmed APK is installed as an update" || bad "install: $out"
KEPT=$(ls -1d "$H"/state/lumen-android-refresh/backup-* | sort | tail -1)
[[ $(sum "$KEPT/installed.apk") == "$OLD" ]] && grep -q "^sha256=$OLD$" "$KEPT/record" && ok "install: the previous APK was copied off the phone first" || bad "no backup of the previous APK"
[[ $(grep -c '^adb install' "$S/calls") == 1 && $(grep -c '^adb install -r ' "$S/calls") == 1 ]] && ok "install: one 'adb install -r', nothing else changes the phone" || bad "unexpected install calls"

ARGS=(rollback); if out=$(run 2>&1); then bad "rollback ran without confirmation"; else ok "rollback: refuses without confirmation"; fi
out=$(run ANDROID_REFRESH_CONFIRM=rollback 2>&1) && [[ $(phone) == "$OLD" ]] && ok "rollback: the previous APK is installed again" || bad "rollback: $out"
cp "$T/newer.apk" "$S/phone.apk"; if out=$(run ANDROID_REFRESH_CONFIRM=rollback 2>&1); then bad "rollback claimed success on a downgrade"; else [[ $out == *"Do not uninstall"* && $(phone) == "$(sum "$T/newer.apk")" ]] && ok "rollback: a refused downgrade stops; the app and its data stay" || bad "rollback downgrade: $out"; fi
grep -qE 'uninstall|pm clear|shell am ' "$S/calls" && bad "an uninstall or data wipe was issued" || ok "never uninstalls or clears app data"
grep -nE '^[^#]*(adb +(shell +)?(pm +)?(uninstall|clear)|apksigner +sign|jarsigner|keytool)' "$SRC/scripts/android-refresh.sh" && bad "the script contains an uninstall, wipe or signing command" || ok "the script has no uninstall, wipe or signing command"

# --- build: a fictional repository with history, a fictional native project, a stand-in for Gradle ---
g() { git -c user.name=t -c user.email=t@example.invalid -c commit.gpgsign=false "$@"; }
C=$T/clone; N=$R/preview.ijhcJd; mkdir -p "$C/scripts" "$C/app" "$C/components" "$C/lib" "$C/hooks" "$C/types"
echo '{"dependencies":{"fictional-dep":"1.0.0"}}' > "$C/package.json"; echo '{"expo":{"scheme":"myapp"}}' > "$C/app.json"
echo "chat v1" > "$C/app/index.tsx"; echo "old screen" > "$C/app/removed.tsx"; echo "auth v1" > "$C/lib/social-auth.ts"; echo x > "$C/components/a.tsx"; echo x > "$C/hooks/h.ts"; echo x > "$C/types/t.ts"
g -C "$C" init -q; g -C "$C" add -A; g -C "$C" commit -q -m "accepted in October"
mkdir -p "$N/android/app/build/outputs/apk/release" "$N/node_modules/fictional-dep"; echo '{}' > "$N/node_modules/fictional-dep/package.json"
for d in app components lib hooks types; do cp -r "$C/$d" "$N/$d"; done
echo '{"expo":{"scheme":"raialume-preview","android":{"package":"com.raialume.preview"}}}' > "$N/app.json"; echo '{"native":"project"}' > "$N/package.json"
echo "applicationId 'com.raialume.preview'" > "$N/android/app/build.gradle"; echo '{"fictional":"firebase"}' > "$N/android/app/google-services.json"; echo fictional-keystore > "$N/android/app/release.keystore"
cp "$T/old.apk" "$N/android/app/build/outputs/apk/release/app-release.apk"
cat > "$N/android/gradlew" <<STUB
#!/usr/bin/env bash
echo "gradlew \$* NODE_ENV=\$NODE_ENV" >> "$S/calls"
[ -f "$S/gradle-fail" ] && { echo "BUILD FAILED"; exit 1; }
d=\$(mktemp -d -p "$T"); mkdir -p "\$d/assets"
{ cat ../app/* ../lib/*; [ -f "$S/no-env" ] || echo "\$EXPO_PUBLIC_SUPABASE_URL \$EXPO_PUBLIC_SUPABASE_ANON_KEY \$EXPO_PUBLIC_LUMEN_API_URL"; } > "\$d/assets/index.android.bundle"
printf "package: name='com.raialume.preview' versionCode='1' versionName='1.0.0'\n" > "\$d/badging"; echo AAAA > "\$d/cert"
rm -f app/build/outputs/apk/release/app-release.apk; (cd "\$d" && zip -q -r "$N/android/app/build/outputs/apk/release/app-release.apk" .)
STUB
printf '#!/usr/bin/env bash\necho %s >&2\n' "'openjdk version \"17.0.12\" 2026-01-01'" > "$B/java"; chmod +x "$N/android/gradlew" "$B/java"
cp "$SRC/scripts/android-refresh.sh" "$C/scripts/"; echo "chat v2 Open live video in your browser" > "$C/app/index.tsx"; echo "new screen" > "$C/app/added.tsx"; g -C "$C" rm -q app/removed.tsx
g -C "$C" add -A; g -C "$C" commit -q -m "refresh"; HEAD12=$(git -C "$C" rev-parse --short=12 HEAD)
brun() { env PATH="$B:$PATH" HOME="$H" XDG_STATE_HOME="$H/state" LIVE_DIR="$L" BUILD_ROOT="$R" "$@" bash "$C/scripts/android-refresh.sh" "${ARGS[@]}"; }
native() { (cd "$N" && cat app.json package.json android/app/build.gradle android/app/google-services.json android/app/release.keystore node_modules/fictional-dep/package.json | sha256sum); }
tree() { (cd "$N" && find app components lib hooks types -type f | sort | xargs sha256sum | sha256sum); }
NATIVE=$(native); TREE=$(tree); : > "$S/calls"; cp "$T/old.apk" "$S/phone.apk"

ARGS=(build-check); out=$(brun 2>&1) && [[ $out == *"files of app components lib hooks types that would change: 3"*"build:$HEAD12"* && $(tree) == "$TREE" ]] && ok "build-check: passes, counts the changes, changes nothing" || bad "build-check: $out"
[[ $out != *fictional-anon-key* && $out != *fictional-keystore* ]] && ok "build-check: no setting value or key printed" || bad "build-check printed a value"
ARGS=(build); if out=$(brun 2>&1); then bad "build ran without confirmation"; else [[ $(tree) == "$TREE" ]] && ! grep -q gradlew "$S/calls" && ok "build: refuses without the confirmation for this commit" || bad "unconfirmed build changed the project"; fi
echo "auth v1 with a host-only fix" > "$N/lib/social-auth.ts"; TREE=$(tree)
if out=$(brun ANDROID_REFRESH_CONFIRM="build:$HEAD12" 2>&1); then bad "build overwrote a local edit"; else [[ $out == *"never committed"*"lib/social-auth.ts"* && $(tree) == "$TREE" ]] && ok "build: stops at a file that was only ever edited in the native project" || bad "local edit: $out"; fi
touch "$S/gradle-fail"; if out=$(brun ANDROID_REFRESH_KEEP="lib/social-auth.ts" ANDROID_REFRESH_CONFIRM="build:$HEAD12" 2>&1); then bad "failed build reported success"; else [[ $(tree) == "$TREE" && $(sum "$N/android/app/build/outputs/apk/release/app-release.apk") == "$OLD" ]] && ok "build: a failed build puts the previous source and APK back" || bad "failed build left changes: $out"; fi; rm "$S/gradle-fail"
touch "$S/no-env"; if out=$(brun ANDROID_REFRESH_KEEP="lib/social-auth.ts" ANDROID_REFRESH_CONFIRM="build:$HEAD12" 2>&1); then bad "build accepted an APK without settings"; else [[ $out == *"would fail at startup"*"Do not install"* ]] && ok "build: an APK without the public settings is rejected" || bad "no-env build: $out"; fi; rm "$S/no-env"
tar -C "$N" -xf "$(ls -1d "$H"/state/lumen-android-refresh/build-* | sort | tail -1)/previous-source.tar" && rm -f "$N/app/added.tsx" && cp "$T/old.apk" "$N/android/app/build/outputs/apk/release/app-release.apk"
out=$(brun ANDROID_REFRESH_KEEP="lib/social-auth.ts" ANDROID_REFRESH_CONFIRM="build:$HEAD12" 2>&1) && [[ $out == *"built and checked"*"Nothing was installed"* ]] && ok "build: builds the confirmed commit and checks the APK" || bad "build: $out"
BUILT=$(ls -1d "$H"/state/lumen-android-refresh/build-* | sort | tail -1)
[[ $(cat "$N/app/index.tsx") == "chat v2"* && -f "$N/app/added.tsx" && ! -e "$N/app/removed.tsx" && $(cat "$N/lib/social-auth.ts") == *"host-only fix" ]] && ok "build: source replaced, removed files removed, the kept local edit untouched" || bad "source sync wrong"
[[ $(native) == "$NATIVE" ]] && ok "build: app.json, package.json, android/, google-services.json, keystore and node_modules untouched" || bad "native project files changed"
[[ $(sum "$BUILT/previous.apk") == "$OLD" && -s "$BUILT/previous-source.tar" && $(sum "$BUILT/raialume-preview-$HEAD12.apk") == "$(sed -n 's/^sha256=//p' "$BUILT/record")" ]] && ok "build: previous APK and source kept, new APK recorded by hash" || bad "build record wrong"
grep -q "gradlew assembleRelease NODE_ENV=production" "$S/calls" && ! grep -qE 'prebuild|^adb ' "$S/calls" && ok "build: the project's own release build, no prebuild, no phone" || bad "unexpected build calls: $(cat "$S/calls")"
[[ $out != *fictional-anon-key* ]] && ! grep -rq fictional-anon-key "$BUILT/record" "$N/.env" 2>/dev/null && ok "build: settings not printed and not written into the project" || bad "build leaked a setting"
ARGS=(verify "$BUILT/raialume-preview-$HEAD12.apk"); out=$(brun 2>&1) && [[ $out == *"Safe to install"* ]] && ok "the built APK then passes verify against the phone" || bad "verify built: $out"
[ "$fail" = 0 ] && echo "android refresh: all checks passed" || { echo "android refresh: FAILED"; exit 1; }

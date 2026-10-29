#!/usr/bin/env bash
# Inert locally unless all official CI/repository/snapshot guards pass. No production credentials.
set -euo pipefail
cd "$(dirname "$0")/.."
# Independently enforce the event envelope before installing/building anything.
python3 -B - <<'PYGUARD'
import importlib.util, os
spec = importlib.util.spec_from_file_location('gift_evidence', 'scripts/mobile-ci-draft.py')
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
module.validate_event(os.environ)
PYGUARD
[[ "${GITHUB_REPOSITORY:-}" == marinanemukhina-lgtm/gift-lists-android ]]
[[ "${GITHUB_RUN_ATTEMPT:-}" == 1 ]]
[[ "${GITHUB_REPOSITORY_ID:-}" == 1435989060 && "${GITHUB_REF:-}" == refs/heads/main ]]
[[ "${REVIEWED_SHA:-}" =~ ^[0-9a-f]{40}$ && "$REVIEWED_SHA" == "$GITHUB_SHA" ]]
[[ "$(git rev-parse HEAD)" == "$REVIEWED_SHA" ]]
[[ "${API_LEVEL:-}" == 36 ]]
: "${RUNNER_TEMP:?}" "${ANDROID_HOME:?}" "${JAVA_HOME_21_X64:?}"
export JAVA_HOME="$JAVA_HOME_21_X64"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
export ANDROID_AVD_HOME="$RUNNER_TEMP/gift-avd"
export GRADLE_USER_HOME="$RUNNER_TEMP/gift-gradle"
export npm_config_cache="$RUNNER_TEMP/gift-npm-cache"
# Refuse accidentally committed configuration; exact synthetic origins come from reviewed source.
if find . -path './.git' -prune -o -path './node_modules' -prune -o -name '.env*' ! -name '.env.example' -print | grep -q .; then
  echo 'Unexpected environment file: refusing CI build'; exit 1
fi
source scripts/mobile-demo-env.sh
evidence="$RUNNER_TEMP/gift-qa-evidence"
logs="$RUNNER_TEMP/gift-qa-private-logs"
keydir="$RUNNER_TEMP/gift-test-signing"
mkdir -p "$evidence" "$logs" "$ANDROID_AVD_HOME"
mkdir -m 700 "$keydir"
export GIFT_QA_EVIDENCE="$evidence" GIFT_QA_LOGS="$logs"
stage='toolchain'
result='NOT_RUN'
collect_screenshots() {
# Fixed files created by test-only UiAutomation at verified synthetic UI states. Never account/recovery.
for name in offline-editor.png offline-preview-cards.png offline-preview.png; do
  [[ -f "$evidence/$name" ]] && continue
  if ! timeout 10 adb -s emulator-5554 exec-out cat "/data/local/tmp/gift-qa-$name" > "$logs/$name" 2>/dev/null; then continue; fi
  python3 -B - "$logs/$name" "$evidence/$name" <<'PYSHOT' || return 1
import importlib.util,pathlib,sys
spec=importlib.util.spec_from_file_location('gift_evidence','scripts/mobile-ci-draft.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
data=pathlib.Path(sys.argv[1]).read_bytes()
width,height=module.validate_png(data)
pathlib.Path(sys.argv[2]).write_bytes(data)
print(f'Collected synthetic native screenshot {pathlib.Path(sys.argv[2]).name}: {width}x{height}, {len(data)} bytes')
PYSHOT
done
}
finish() {
  status=$?
  trap - EXIT
  if [[ "$stage" == offline-runtime || "$stage" == synthetic-screenshot-collection || "$stage" == all-offline-runtime-checks-complete ]]; then
    collect_screenshots || true
  fi
  if (( status != 0 )); then result="FAIL / later stages NOT_RUN"; fi
  export GIFT_QA_STAGE="$stage" GIFT_QA_RESULT="$result" GIFT_QA_EXIT="$status"
  python3 - <<'PY'
import hashlib, os, pathlib, re
root=pathlib.Path(os.environ['GIFT_QA_EVIDENCE']); logs=pathlib.Path(os.environ['GIFT_QA_LOGS'])
lines=['Gift Lists synthetic Android acceptance',f"Source: {os.environ['REVIEWED_SHA']}",
       f"Run: {os.environ['GITHUB_RUN_ID']} attempt {os.environ['GITHUB_RUN_ATTEMPT']}",
       f"API: {os.environ['API_LEVEL']}",f"Result: {os.environ['GIFT_QA_RESULT']}",
       f"Last stage: {os.environ['GIFT_QA_STAGE']}; exit: {os.environ['GIFT_QA_EXIT']}",
       f"APK is ephemeral TEST-signed; mode={os.environ.get('GIFT_ANDROID_MODE','offline')}; API={os.environ.get('VITE_API_ORIGIN') or 'absent'}; NOT store-ready.",
       'No production data/API credential or production signing key used.',
       'No cache/Actions artifact upload. Only APK, report and up to3 fixed synthetic UI PNGs are allowlisted.',
       'A pending/failed stage is not proof of later-stage acceptance.']
for name in ['runtime-metadata.txt','webview.txt']:
    p=logs/name
    if p.exists():
        # Fixed commands only; no environment dump, tokens, app logs or document contents.
        text=p.read_text(errors='replace')[:10000]
        lines += ['',name, re.sub(r'[\x00-\x08\x0b-\x1f]', '',text)]
for p in sorted(logs.glob('instrument-*.txt')):
    lines += ['',p.name]
    for line in p.read_text(errors='replace').splitlines():
        if line.startswith(('INSTRUMENTATION_STATUS: class=','INSTRUMENTATION_STATUS: test=',
                            'INSTRUMENTATION_STATUS: numtests=','INSTRUMENTATION_STATUS_CODE:',
                            'INSTRUMENTATION_CODE:','INSTRUMENTATION_FAILED:',
                            'INSTRUMENTATION_STATUS: stack=')) or re.fullmatch(r'OK \(\d+ tests?\)',line) or line.startswith('FAILURES'):
            lines.append(line[:400])
apk=root/'gift-lists-test.apk'
if apk.exists():
    lines += ['',f'APK bytes: {apk.stat().st_size}',f'APK SHA256: {hashlib.sha256(apk.read_bytes()).hexdigest()}']
for name in ['offline-editor.png','offline-preview-cards.png','offline-preview.png']:
    shot=root/name
    if shot.exists():
        data=shot.read_bytes()
        lines += [f'Synthetic screenshot captured: {name}; bytes={len(data)}; SHA256={hashlib.sha256(data).hexdigest()}']
    else:
        lines += [f'Synthetic screenshot NOT_CAPTURED: {name}']
lines += ['', 'Remaining: online acceptance unless explicit online test PASS; full human SAF filename/folder navigation,',
          'native sharesheet/merchant return, IME/safe-area visual checks, TalkBack/large-text,',
          'no-Google-services device, API26 with supported WebView, final signing/RuStore review.',
          'Fixture provider selection is intercepted in one test; native callbacks and real',
          'ContentResolver read/write/UTF-8/size rejection execute. Real picker Back is separate.']
output='\n'.join(lines)+'\n'
assert len(output.encode())<=65536
(root/'qa-report.txt').write_text(output)
print('\n'.join(lines[:10]))
PY
  rm -rf -- "$keydir"
  adb -s emulator-5554 emu kill >/dev/null 2>&1 || true
  exit "$status"
}
trap finish EXIT
{
  printf 'Node: '; node --version
  java -version 2>&1 | head -3
  printf 'Source: '; git rev-parse HEAD
  printf 'Runner: ubuntu-24.04 x64, standard public runner\n'
} > "$logs/runtime-metadata.txt"
# Use official Android SDK tooling only. Never fetch a replacement WebView from an APK mirror.
# Use only licenses already accepted in the official runner image. No automatic agreement.
stage='official-sdk-existing-licenses'
sdk_diagnostic() {
  python3 - "$logs/sdkmanager.txt" <<'PYSDK'
import pathlib,re,sys
lines=pathlib.Path(sys.argv[1]).read_text(errors='replace').splitlines()
selected=[line[:240] for line in lines if re.search(r'license|https://|package|warning|error',line,re.I)]
print('Bounded official SDK diagnostic (no agreement was accepted):')
print('\n'.join(selected[:25]))
PYSDK
}
if ! timeout 600 sdkmanager 'platform-tools' 'emulator' 'platforms;android-36' 'build-tools;35.0.0' 'build-tools;36.0.0' "system-images;android-$API_LEVEL;google_apis;x86_64" < /dev/null > "$logs/sdkmanager.txt" 2>&1; then
  sdk_diagnostic
  echo 'Official SDK installation stopped; review runner licenses/tool availability. No agreement was accepted.'
  exit 1
fi
if grep -Eiq 'not accepted|licenses? (has|have) not been accepted|accept[^[:cntrl:]]*license|review licenses|Do you accept' "$logs/sdkmanager.txt"; then
  sdk_diagnostic
  echo 'A new SDK license agreement is required. Stopping without agreement; root review needed.'
  exit 1
fi
for required in "$ANDROID_HOME/platforms/android-36/android.jar" "$ANDROID_HOME/build-tools/35.0.0/aapt2" "$ANDROID_HOME/build-tools/36.0.0/apksigner" "$ANDROID_HOME/emulator/emulator" "$ANDROID_HOME/system-images/android-$API_LEVEL/google_apis/x86_64/package.xml"; do
  [[ -f "$required" ]] || { echo 'Required official SDK component missing; no license bypass.'; exit 1; }
done
[[ "$(df -Pk "$RUNNER_TEMP" | awk 'NR==2 {print $4}')" -gt 3500000 ]]
stage='unsigned-build'
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm test
npm run test:mobile-tooling
npm run build:mobile
(cd apps/mobile && ../../node_modules/.bin/cap sync android)
(cd apps/mobile/android && bash ./gradlew --no-daemon --max-workers=2 :app:assembleRelease :app:assembleReleaseAndroidTest :app:lintRelease :app:testReleaseUnitTest)
app='apps/mobile/android/app/build/outputs/apk/release/app-release-unsigned.apk'
mapfile -t test_apks < <(find apps/mobile/android/app/build/outputs/apk/androidTest/release -maxdepth 1 -type f -name '*.apk')
[[ "${#test_apks[@]}" == 1 ]]
stage='ephemeral-test-signing'
export GIFT_TEST_PASSWORD
GIFT_TEST_PASSWORD="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
keytool -genkeypair -noprompt -storetype PKCS12 -keystore "$keydir/test.p12" -alias gift-test \
  -keyalg RSA -keysize 2048 -validity 2 -dname 'CN=Gift Lists Ephemeral CI Test' \
  -storepass:env GIFT_TEST_PASSWORD -keypass:env GIFT_TEST_PASSWORD >/dev/null 2>&1
buildtools="$ANDROID_HOME/build-tools/36.0.0"
"$buildtools/zipalign" -f -P 16 4 "$app" "$keydir/app-aligned.apk"
"$buildtools/apksigner" sign --ks "$keydir/test.p12" --ks-key-alias gift-test --ks-pass env:GIFT_TEST_PASSWORD --key-pass env:GIFT_TEST_PASSWORD --out "$keydir/gift-lists-test.apk" "$keydir/app-aligned.apk"
"$buildtools/zipalign" -f -P 16 4 "${test_apks[0]}" "$keydir/test-aligned.apk"
"$buildtools/apksigner" sign --ks "$keydir/test.p12" --ks-key-alias gift-test --ks-pass env:GIFT_TEST_PASSWORD --key-pass env:GIFT_TEST_PASSWORD --out "$keydir/instrumentation.apk" "$keydir/test-aligned.apk"
# Keep optional signer sidecars (e.g. .idsig) out of the strict evidence envelope.
# Only the verified standalone APK is copied; sidecars are removed with the temporary key directory.
"$buildtools/apksigner" verify "$keydir/gift-lists-test.apk"
cp -- "$keydir/gift-lists-test.apk" "$evidence/gift-lists-test.apk"
"$buildtools/apksigner" verify "$evidence/gift-lists-test.apk"
"$buildtools/apksigner" verify "$keydir/instrumentation.apk"
unset GIFT_TEST_PASSWORD
[[ "$(apkanalyzer manifest application-id "$evidence/gift-lists-test.apk")" == ru.nemukhina.giftlists ]]
[[ "$(apkanalyzer manifest debuggable "$evidence/gift-lists-test.apk")" == false ]]
[[ "$(stat -c %s "$evidence/gift-lists-test.apk")" -lt 20000000 ]]
stage='kvm-cold-boot'
[[ -c /dev/kvm ]]
# Root-approved per-user ACL ONLY when this ephemeral runner lacks existing access.
# No group/world mode change, no other device permissions, no software fallback.
if [[ ! -r /dev/kvm || ! -w /dev/kvm ]]; then
  sudo setfacl -m "u:$(id -un):rw" /dev/kvm
fi
[[ -r /dev/kvm && -w /dev/kvm ]]
emulator -accel-check | tee -a "$logs/runtime-metadata.txt"
printf 'no\n' | avdmanager create avd --force --name gift-acceptance --package "system-images;android-$API_LEVEL;google_apis;x86_64"
emulator -avd gift-acceptance -port 5554 -no-window -no-audio -no-snapshot -wipe-data -accel on -gpu swiftshader -cores 2 -memory 2048 >"$logs/emulator.txt" 2>&1 &
export ANDROID_SERIAL=emulator-5554
timeout 90 adb wait-for-device
booted=false
for _ in {1..120}; do
  if [[ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == 1 ]]; then booted=true; break; fi
  sleep 2
done
[[ "$booted" == true ]]
python3 - <<'PY' >> "$logs/runtime-metadata.txt"
import os, pathlib
seen=[]
for process in pathlib.Path('/proc').iterdir():
    if not process.name.isdigit(): continue
    try:
        cmd=(process/'cmdline').read_bytes()
        if b'qemu-system' not in cmd: continue
        if any(os.readlink(fd)=='/dev/kvm' for fd in (process/'fd').iterdir()): seen.append(process.name)
    except (OSError,PermissionError): pass
assert seen, 'A live QEMU process must actually hold /dev/kvm; no fallback accepted'
print('Live QEMU KVM handle verified')
PY
adb shell service check activity | tee -a "$logs/runtime-metadata.txt" | grep -q found
adb shell service check package | tee -a "$logs/runtime-metadata.txt" | grep -q found
adb shell getprop ro.build.version.sdk >> "$logs/runtime-metadata.txt"
adb shell dumpsys webviewupdate > "$logs/webview.txt"
stage='supported-webview'
python3 - "$logs/webview.txt" <<'PY'
import pathlib,re,sys
text=pathlib.Path(sys.argv[1]).read_text()
m=re.search(r'Current WebView package.*?\([^,]+,\s*(\d+)\.',text)
assert m and int(m.group(1))>=100, 'Official image WebView below100 or unavailable: stop and obtain separately reviewed supported provider/device; do not fetch an unchecked APK'
PY
stage='offline-runtime'
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
adb shell input keyevent 82
adb shell svc wifi disable
adb shell svc data disable
adb emu gsm data off >/dev/null
adb install "$evidence/gift-lists-test.apk"
adb install -t "$keydir/instrumentation.apk"
adb shell pm clear ru.nemukhina.giftlists | grep -q Success
run_tests() {
  name="$1"; classes="$2"; expected="$3"; seconds="${4:-180}"
  timeout "$seconds" adb shell am instrument -w -r -e class "$classes" ru.nemukhina.giftlists.test/androidx.test.runner.AndroidJUnitRunner > "$logs/instrument-$name.txt" 2>&1
  cat "$logs/instrument-$name.txt"
  grep -Eq "^OK \\($expected tests?\\)" "$logs/instrument-$name.txt"
  ! grep -Eq 'FAILURES|INSTRUMENTATION_FAILED|Process crashed|shortMsg=' "$logs/instrument-$name.txt"
}
run_tests seed 'ru.nemukhina.giftlists.NativeContractTest,ru.nemukhina.giftlists.OfflineAcceptanceTest' 2
stage='synthetic-screenshot-collection'
collect_screenshots
for name in offline-editor.png offline-preview-cards.png offline-preview.png; do
  [[ -f "$evidence/$name" ]] || { echo 'Expected synthetic native screenshot was not captured; no screenshot acceptance claimed.'; exit 1; }
done
stage='offline-runtime'
# Separate process, not merely ActivityScenario.recreate or an in-memory store.
adb shell am force-stop ru.nemukhina.giftlists
run_tests restart 'ru.nemukhina.giftlists.PersistenceAfterRestartTest' 1
run_tests documents 'ru.nemukhina.giftlists.DocumentsRuntimeTest' 2
stage='all-offline-runtime-checks-complete'
result='PASS (5 instrumentation tests; hosted API/device visual gates not included)'

if [[ "${GIFT_ANDROID_MODE:-offline}" == online ]]; then
  stage='online-runtime'
  # Same APK and signature: preserve all five offline tests and their screenshots.
  adb shell am force-stop ru.nemukhina.giftlists
  adb shell pm clear ru.nemukhina.giftlists | grep -q Success
  adb shell svc wifi enable
  adb shell svc data enable
  adb emu gsm data on >/dev/null
  run_tests online 'ru.nemukhina.giftlists.OnlineAcceptanceTest' 1 600
  stage='all-offline-and-online-runtime-checks-complete'
  result='PASS (5 offline +1 hosted synthetic online instrumentation tests; device visual/store gates remain)'
fi

#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${JAVA_HOME:?Set JAVA_HOME to JDK 21}"
: "${ANDROID_HOME:?Set ANDROID_HOME to an installed Android SDK}"
# Detect a JRE-only environment before changing generated assets or invoking Gradle.
if [[ ! -x "$JAVA_HOME/bin/java" || ! -x "$JAVA_HOME/bin/javac" ]] || ! "$JAVA_HOME/bin/javac" -version 2>&1 | grep -Eq '^javac 21([.]|$)'; then
  echo 'JDK 21 with java and javac is required; a Java runtime alone cannot build Android.' >&2
  exit 1
fi
if [[ ! -f "$ANDROID_HOME/platforms/android-36/android.jar" ]]; then
  echo 'Installed Android SDK platform android-36 is required. No SDK licenses are accepted by this script.' >&2
  exit 1
fi
if [[ ! -x "$ANDROID_HOME/build-tools/35.0.0/aapt2" || ! -x "$ANDROID_HOME/build-tools/35.0.0/zipalign" ]]; then
  echo 'Installed Android SDK build-tools 35.0.0 are required (AGP 8.13.0 default).' >&2
  exit 1
fi
export PATH="$JAVA_HOME/bin:$PATH"
npm run build:mobile
(cd apps/mobile && ../../node_modules/.bin/cap sync android)
# The checked-in wrapper pins Gradle 8.14.3 and its distribution checksum.
(cd apps/mobile/android && bash ./gradlew --no-daemon --max-workers=2 :app:assembleRelease :app:lintRelease :app:testReleaseUnitTest)
printf '\nUnsigned APK (NOT store ready): apps/mobile/android/app/build/outputs/apk/release/app-release-unsigned.apk\n'
sha256sum apps/mobile/android/app/build/outputs/apk/release/app-release-unsigned.apk

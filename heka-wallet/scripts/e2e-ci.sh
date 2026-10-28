#!/usr/bin/env bash
# Runs the no-backend Maestro flows in CI on the booted emulator; the debug app loads its JS from Metro on the host.
# Leaves the JUnit report, Maestro debug output, the app log and logcat in e2e-output/ for the upload step.
# Run from heka-wallet/.
set -euo pipefail

out=e2e-output
mkdir -p "$out"

adb reverse tcp:8081 tcp:8081
adb install -r app/android/app/build/outputs/apk/debug/app-debug.apk

status=0
maestro test .maestro --include-tags no-backend \
  --format junit --output "$out/report.xml" --debug-output "$out/debug" || status=$?

# Maestro's default output (screenshots of failed steps), in case --debug-output wrote nothing.
cp -r "$HOME/.maestro/tests" "$out/maestro-tests" 2>/dev/null || true
adb shell run-as com.heka.wallet cat files/log.txt > "$out/app-log.txt" 2>/dev/null || true
adb logcat -d > "$out/logcat.txt" || true

exit "$status"

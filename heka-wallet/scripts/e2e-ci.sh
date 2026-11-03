#!/usr/bin/env bash
# Runs Maestro flows in CI on the booted emulator; the debug app loads its JS from Metro on the host.
# Arguments are passed to `maestro test` (tags, -e variables).
# Leaves the JUnit report, Maestro debug output, the app log and logcat in e2e-output/ for the upload step.
# Run from heka-wallet/.
set -euo pipefail

out=e2e-output
mkdir -p "$out"

# Metro, then the backend the backend flows use on localhost: Keycloak, identity-service API and OID4VC router.
for port in 8081 8080 3000 3003; do
  adb reverse "tcp:$port" "tcp:$port"
done
adb install -r app/android/app/build/outputs/apk/debug/app-debug.apk

# Keycloak login opens in a Chrome Custom Tab; skip Chrome's first-run screens that would cover it.
adb shell pm list packages | grep -i chrome > "$out/browsers.txt" || echo "no Chrome on the device" > "$out/browsers.txt"
adb shell am set-debug-app --persistent com.android.chrome || true
adb shell "echo '_ --disable-fre --no-default-browser-check --no-first-run' > /data/local/tmp/chrome-command-line"

# The logcat ring buffer rotates within one flow, so stream it to a file for the whole run.
adb logcat -c
adb logcat > "$out/logcat.txt" &
logcat_pid=$!

status=0
maestro test .maestro "$@" \
  --format junit --output "$out/report.xml" \
  --debug-output "$out/debug" --flatten-debug-output --test-output-dir "$out/test-output" || status=$?

kill "$logcat_pid" 2>/dev/null || true

adb shell run-as com.heka.wallet cat files/log.txt > "$out/app-log.txt" 2>/dev/null || true

exit "$status"

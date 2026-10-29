#!/usr/bin/env bash
# Starts Metro in the background for the CI e2e run and waits until the debug app's bundle is built.
# A cold bundle build on first launch outlasts the flows' wait for the first screen, so it is built here.
# Leaves the Metro log in metro.log for the upload step.
# Run from heka-wallet/.
set -euo pipefail

(cd app && nohup yarn start > ../metro.log 2>&1 &)

timeout 120 bash -c 'until curl -sf http://localhost:8081/status; do sleep 2; done'

# Metro caches the bundle per query: this URL must match the debug app's request (react-native DevServerHelper.kt).
curl -sf -o /dev/null --max-time 900 \
  'http://localhost:8081/index.bundle?platform=android&dev=true&lazy=true&minify=false&app=com.heka.wallet&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server'

#!/usr/bin/env bash
# Waits in CI until the backend started by "Start the backend" answers: Keycloak, then identity-service.
# Fails at once when `docker compose up` failed (its exit status is in e2e-output/compose-up.exit), not at the timeout.
# Run from heka-wallet/.
set -euo pipefail

out=e2e-output

compose_failed() {
  [ -s "$out/compose-up.exit" ] && [ "$(cat "$out/compose-up.exit")" != 0 ]
}

# Usage: wait_for <url> <timeout in seconds>
wait_for() {
  local url=$1 deadline=$((SECONDS + $2))
  until curl -sf -o /dev/null --max-time 10 "$url"; do
    if compose_failed; then
      echo "docker compose up failed with exit code $(cat "$out/compose-up.exit"):"
      tail -n 100 "$out/compose-up.log"
      exit 1
    fi
    if [ "$SECONDS" -ge "$deadline" ]; then
      echo "Timed out waiting for $url"
      exit 1
    fi
    sleep 10
  done
}

wait_for http://localhost:8080/realms/heka-wallet/.well-known/openid-configuration 1200
wait_for http://localhost:3000/health 600

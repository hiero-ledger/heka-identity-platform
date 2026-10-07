#!/bin/bash
# Creates the second database of the root Compose project. The postgres image creates
# POSTGRES_DB (heka-identity-service) itself; heka-sso-service needs its own database on the
# same instance. Runs once, on an empty data directory (docker-entrypoint-initdb.d); a changed
# script needs `docker compose down -v`. The identity service's Askar wallet databases are
# created by the service at runtime under the same superuser and need nothing here.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE DATABASE "heka-sso-service";
SQL

-- Creates the second database of the root Compose project. The postgres image creates
-- POSTGRES_DB (heka-identity-service) itself; heka-sso-service needs its own database on the
-- same instance. Runs once, on an empty data directory (docker-entrypoint-initdb.d); a changed
-- file needs `docker compose down -v`. The identity service's Askar wallet databases are
-- created by the service at runtime under the same superuser and need nothing here.
-- Plain SQL on purpose: the entrypoint pipes *.sql to psql, so it does not depend on the file
-- mode (a *.sh file is executed or sourced depending on the execute bit, which a bind mount on
-- Docker Desktop for macOS reports inconsistently).
CREATE DATABASE "heka-sso-service";

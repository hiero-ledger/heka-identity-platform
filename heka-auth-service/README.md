# Heka Auth Service

## Description

Authentication service for the [Heka Identity Service](https://github.com/hiero-ledger/heka-identity-platform/tree/main/heka-identity-service). Issues JWTs that the Identity Service validates against a shared secret — see [JWT alignment with Identity Service](#jwt-alignment-with-identity-service) below.

## Quick Start

1. Start a local Postgres compatible with the service defaults:

   ```bash
   docker run --name heka-auth-service-postgres \
     -e POSTGRES_DB=heka-auth-service \
     -e POSTGRES_USER=heka \
     -e POSTGRES_PASSWORD=heka1 \
     -p 5433:5432 -d postgres
   ```

2. Install dependencies:

   ```bash
   yarn install
   ```

3. (Optional) Create a `.env` file in the repo root to override any defaults — see [Configuration](#configuration) for the available variables.

4. Run database migrations:

   ```bash
   yarn migration:up
   ```

5. Start the service:

   ```bash
   yarn start
   ```

6. Verify by opening Swagger UI at <http://localhost:3004/api/docs>.

## API

The service exposes a REST API at port `3004` by default. Swagger UI is available at `/api/docs` (e.g. <http://localhost:3004/api/docs>). Endpoints are grouped by controller:

- **OAuth** (`/api/v1/oauth/*`) — token issuance, refresh, revocation.
- **User** (`/api/v1/user/*`) — user management.
- **Health** (`/health`) — memory + database health probe for use as a Kubernetes readiness/liveness check or a Compose healthcheck.

## Configuration

The service is configured via environment variables. Values can be set in a `.env` file at the repo root. All variables are optional — defaults are compiled in (see the tables below).

### Application

| Variable                 | Default                       | Description                                                              |
|--------------------------|-------------------------------|--------------------------------------------------------------------------|
| `APP_NAME`               | `Heka Auth Service`           | Application name surfaced in metadata.                                   |
| `APP_VERSION`            | _(reads from `package.json`)_ | Application version surfaced in metadata.                                |
| `APP_PORT`               | `3004`                        | HTTP port the service binds to.                                          |
| `APP_PREFIX`             | `api`                         | URL prefix for the REST API.                                             |
| `APP_REQUEST_SIZE_LIMIT` | `50mb`                        | Maximum request body size.                                               |
| `APP_ENABLE_CORS`        | `false`                       | Set to `true` to enable CORS handling.                                   |
| `APP_ALLOW_ORIGINS`      | `*`                           | Comma-separated list of allowed CORS origins.                            |
| `ORG_ID`                 | `id`                          | Organization identifier surfaced as the `org_id` claim in issued tokens. |

### Database (PostgreSQL)

| Variable      | Default             | Description                                                   |
|---------------|---------------------|---------------------------------------------------------------|
| `DB_HOST`     | `localhost`         | Database host.                                                |
| `DB_PORT`     | `5433`              | Database port.                                                |
| `DB_NAME`     | `heka-auth-service` | Database name.                                                |
| `DB_USER`     | `heka`              | Database user.                                                |
| `DB_PASSWORD` | `heka1`             | Database password. **Replace in any non-trivial deployment.** |

### Authentication (JWT)

| Variable                    | Default                 | Description                                                                                                                   |
|-----------------------------|-------------------------|-------------------------------------------------------------------------------------------------------------------------------|
| `JWT_ISSUER`                | `Heka`                  | Value emitted in the `iss` claim.                                                                                             |
| `JWT_AUDIENCE`              | `Heka Identity Service` | Value emitted in the `aud` claim.                                                                                             |
| `JWT_SECRET`                | `test`                  | HMAC secret used to sign tokens. **Replace in any non-trivial deployment.**                                                   |
| `JWT_ACCESS_EXPIRY`         | `3600` (1 h)            | Access-token lifetime in seconds.                                                                                             |
| `JWT_REFRESH_EXPIRY`        | `86400` (24 h)          | Refresh-token lifetime in seconds.                                                                                            |
| `DEMO_USER`                 | _(unset)_               | Optional pre-provisioned demo user identifier. When set, tokens for this user are issued with an extended lifetime (~1 year). |
| `EXPIRE_IN_PASSWORD_CHANGE` | `3600`                  | Lifetime in seconds of password-change tokens.                                                                                |

#### JWT Alignment with Identity Service

The Identity Service validates JWTs issued by this service against a shared secret and matching `iss` / `aud` claims. **Both services must be configured with the same values:**

| Variable here  | Variable in Identity Service  |
|----------------|-------------------------------|
| `JWT_SECRET`   | `JWT_SECRET`                  |
| `JWT_ISSUER`   | `JWT_VERIFY_OPTIONS_ISSUER`   |
| `JWT_AUDIENCE` | `JWT_VERIFY_OPTIONS_AUDIENCE` |

Tokens issued by this service include the claims `sub`, `roles[]`, `name`, and optional `org_id`, matching the [Identity Service's required JWT claims](../heka-identity-service/docs/setup.md#required-jwt-claims).

### Logging

| Variable            | Default                                                          | Description                                                           |
|---------------------|------------------------------------------------------------------|-----------------------------------------------------------------------|
| `LOG_LEVEL`         | `info`                                                           | Log level. One of `trace`, `debug`, `info`, `warn`, `error`, `fatal`. |
| `LOG_EXCLUDE_URLS`  | _(unset — none excluded)_                                        | Comma-separated list of URL paths to exclude from request logging.    |
| `LOG_REDACT_FIELDS` | `db.host,db.user,db.password,jwt.issuer,jwt.audience,jwt.secret` | Comma-separated list of dotted field paths redacted from log output.  |

### Health

`GET /health` checks memory usage and database connectivity. The thresholds below define when memory health is reported as unhealthy:

| Variable                          | Default | Description                                                       |
|-----------------------------------|---------|-------------------------------------------------------------------|
| `HEALTH_MEMORY_HEAP_THRESHOLD_MB` | `2048`  | Heap usage threshold above which `memory_heap` reports unhealthy. |
| `HEALTH_MEMORY_RSS_THRESHOLD_MB`  | `2048`  | RSS usage threshold above which `memory_rss` reports unhealthy.   |

### Runtime

| Variable   | Default   | Description                                                              |
|------------|-----------|--------------------------------------------------------------------------|
| `NODE_ENV` | _(unset)_ | When set to `production`, switches the logger to non-pretty JSON output. |

## Migrations

Database schema is managed via migrations stored in `./migrations`. Run `yarn migration:up` before the first start and after pulling changes that include new migrations.

```bash
# Migrate database to the latest version
yarn migration:up

# Show migration:up help
yarn migration:up -- -h

# Migrate one version down. Note: down migrations are not currently supported.
yarn migration:down

# List applied migrations
yarn migration:list

# List pending migrations
yarn migration:pending

# Generate a new migration as a diff between current DB and updated model
yarn migration:create

# Drop database schema and migrations table.
# Skip --drop-migrations-table to keep the migrations table; remove -r to print help.
yarn schema:drop -- --drop-migrations-table -r
```

## Docker

To build the image locally:

```bash
docker compose -f docker-compose.dev.yml build
```

To run the service in Docker:

```bash
docker compose -f docker-compose.dev.yml up -d
```

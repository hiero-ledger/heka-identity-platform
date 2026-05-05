# Setup and Configuration

## Setup locally

### Prerequisites

- **Node.js** — version that supports Corepack (Node 20+ recommended).
- **Yarn 4** via Corepack — this project pins `yarn@4.9.4` in `package.json`. Enable Corepack so the correct Yarn version is used automatically:

  ```bash
  corepack enable
  corepack prepare yarn@4.9.4 --activate
  ```

  Without this, the system Yarn 1.x may run instead and produce unexpected lockfile behavior.

- **PostgreSQL** — local instance or Docker (instructions below).
- **Docker** (optional, for the Postgres container or running the service in Docker).

> First `yarn install` pulls Credo, AnonCreds, and native ledger SDKs. Expect 5–10 minutes and ~1 GB on disk.

### Step-by-step

1. **Clone the repository:**

   ```bash
   git clone https://github.com/hiero-ledger/heka-identity-platform.git
   cd heka-identity-platform/heka-identity-service
   ```

2. **Install dependencies:**

   ```bash
   yarn install
   ```

3. **Create a local environment file:**

   ```bash
   cp .env.example .env
   ```

   The service automatically loads `.env` on startup. All environment variables documented in [Environment Variables](#environment-variables) can be set here.

4. **Start PostgreSQL.** The simplest option for local development:

   ```bash
   docker run --name heka-identity-service-postgres \
     -e POSTGRES_DB=heka-identity-service \
     -e POSTGRES_USER=heka \
     -e POSTGRES_PASSWORD=heka1 \
     -p 5432:5432 -d postgres
   ```

   These match the service defaults — no env vars needed. To use a different host / port / credentials, see [Persistence](#persistence).

5. **Run migrations:**

   ```bash
   yarn migration:up
   ```

   See [Migrations](#migrations) for further commands.

6. **Start the service:**

   ```bash
   yarn start
   ```

7. **Verify.** Open <http://localhost:3000/docs> — you should see the Swagger UI listing the API. The health endpoint at <http://localhost:3000/health> returns a JSON status if the agent and database are reachable.

### Troubleshooting installation

**`node-gyp` build failures with Python 3.12.** Python 3.12 removed `distutils`, which `node-gyp` depends on. Two options:

```bash
# Option 1 (recommended): install setuptools to restore distutils
pip install setuptools

# Option 2: pin to Python 3.11 for this install
npm install --python=python3.11
```

## Persistence

For application state, this backend uses MikroORM with PostgreSQL. To start a Postgres container compatible with the defaults:

```bash
docker run --name heka-identity-service-postgres \
  -e POSTGRES_DB=heka-identity-service \
  -e POSTGRES_USER=heka \
  -e POSTGRES_PASSWORD=heka1 \
  -p 5432:5432 -d postgres
```

Override connection details via the `MIKRO_ORM_*` and `WALLET_POSTGRES_*` variables documented in [Persistence (PostgreSQL)](#persistence-postgresql).

In addition to the application database, the Identity Service stores agent wallets in PostgreSQL (via Askar). By default, the same Postgres instance is reused, but `WALLET_POSTGRES_*` may point at a separate cluster.

## Migrations

Database schema is managed via migrations stored in `./migrations`. Run `yarn migration:up` before the first start and after pulling changes that include new migrations.

```bash
# Migrate database to the latest version
yarn migration:up

# Show migration:up help
yarn migration:up -- -h

# Down migrations are not currently supported
yarn migration:down

# List applied migrations
yarn migration:list

# List pending migrations
yarn migration:pending

# Generate a new migration as a diff between current DB and updated model
yarn migration:create

# Drop schema and the migrations table
yarn schema:drop -- --drop-migrations-table -r
```

## Build the app

For local development, the service runs directly via `ts-node` — no build step is needed before `yarn start`. The compiled output (`dist/`) is used by Docker images and production deployments.

To produce the build output:

```bash
yarn build
```

## Docker

To build the image locally:

```shell
docker compose -f docker-compose.dev.yml build
```

To run the service in Docker:

```shell
docker compose -f docker-compose.dev.yml up -d
```

## Run the app

```bash
# Run in development mode
yarn start

# Run in development mode, watch for changes and automatically restart
yarn watch

# Run in debug mode
yarn debug
```

The service binds to the ports listed under [HTTP server (Express)](#http-server-express) and [Agent transports](#agent-transports). To expose a local instance to a mobile wallet on a different device, see [Local Configuration for Heka Wallet Integration](local-config-for-heka-wallet-integration.md).

## Test the app

```bash
yarn test
```

## CORS Configuration

Cross-Origin Resource Sharing (CORS) controls which browser origins are permitted to call the Heka Identity Service API.
CORS is **disabled by default** — it must be explicitly opted in via environment variables.

| Variable | Description | Default |
|---|---|---|
| `EXPRESS_ENABLE_CORS` | Set to `true` to enable CORS. Any other value (including unset) disables it. | `false` |
| `EXPRESS_CORS_OPTIONS` | JSON string of [CORS options](https://github.com/expressjs/cors#configuration-options) passed directly to `app.enableCors()`. Must be valid JSON; invalid JSON crashes on startup (fail-fast). | `{}` |

> **Security warning:** Enabling CORS without setting an `origin` inside `EXPRESS_CORS_OPTIONS` defaults to `Access-Control-Allow-Origin: *`.
> Always set an explicit origin allowlist in production.

Example `.env` snippet:

```dotenv
EXPRESS_ENABLE_CORS=true
EXPRESS_CORS_OPTIONS={"origin":["https://admin.example.com","https://wallet.example.com"],"credentials":true}
```

## Development tools

```bash
# Type-check all source code
yarn check-types

# Type-check only `src`
yarn check-types:src

# Type-check only `test`
yarn check-types:test

# Lint
yarn lint

# Format with Prettier
yarn format
```

## Environment Variables

This section is the canonical reference for runtime configuration. Defaults match the values committed in `src/config/`.

### HTTP server (Express)

| Variable               | Default     | Description                                                 |
|------------------------|-------------|-------------------------------------------------------------|
| `EXPRESS_HOST`         | `localhost` | Host the server binds to.                                   |
| `EXPRESS_PORT`         | `3000`      | Port for the REST API and Swagger UI.                       |
| `EXPRESS_PREFIX`       | _(unset)_   | Optional global URL prefix (e.g. `/api`).                   |
| `EXPRESS_ENABLE_CORS`  | `true`      | Enable CORS handling.                                       |
| `EXPRESS_CORS_OPTIONS` | `{}`        | JSON-encoded options passed to the Express CORS middleware. |

### Agent transports

The agent exposes three separate ports — REST/Swagger uses `EXPRESS_PORT`, DIDComm uses two ports, and OpenID4VC uses one. The `*_ENDPOINT` variables are what gets advertised in OOB invitations and OID4VCI metadata; override them when fronting the service with a reverse proxy or a tunnel (see [Local Configuration for Heka Wallet Integration](local-config-for-heka-wallet-integration.md)).

| Variable                               | Default                                       | Description                                                              |
|----------------------------------------|-----------------------------------------------|--------------------------------------------------------------------------|
| `AGENT_LABEL`                          | `Heka`                                        | Label advertised by the agent (also used as the wallet store ID prefix). |
| `AGENT_HTTP_PORT`                      | `3001`                                        | DIDComm HTTP transport port.                                             |
| `AGENT_WS_PORT`                        | `3002`                                        | DIDComm WebSocket transport port.                                        |
| `AGENT_OID4VC_PORT`                    | `3003`                                        | OpenID4VCI / OpenID4VP endpoint port.                                    |
| `AGENT_HTTP_ENDPOINT`                  | `http://${EXPRESS_HOST}:${AGENT_HTTP_PORT}`   | Public DIDComm HTTP URL advertised externally.                           |
| `AGENT_WS_ENDPOINT`                    | `ws://${EXPRESS_HOST}:${AGENT_WS_PORT}`       | Public DIDComm WebSocket URL advertised externally.                      |
| `AGENT_OID4VCI_ENDPOINT`               | `http://${EXPRESS_HOST}:${AGENT_OID4VC_PORT}` | Public OID4VCI base URL advertised externally.                           |
| `AGENT_AUTO_ACCEPT_MEDIATION_REQUESTS` | `true`                                        | Auto-accept incoming mediation requests.                                 |

### Persistence (PostgreSQL)

The service uses two separate Postgres instances (or two databases on the same instance) — one for application state via MikroORM, and one for agent wallets via Askar.

**Application database (MikroORM):**

| Variable                  | Default                 | Description                                              |
|---------------------------|-------------------------|----------------------------------------------------------|
| `MIKRO_ORM_DATABASE_TYPE` | `postgresql`            | Database driver. PostgreSQL is the only tested option.   |
| `MIKRO_ORM_HOST`          | `localhost`             | Database host.                                           |
| `MIKRO_ORM_PORT`          | `5432`                  | Database port.                                           |
| `MIKRO_ORM_USER`          | `heka`                  | Database user.                                           |
| `MIKRO_ORM_PASSWORD`      | `heka1`                 | Database password.                                       |
| `MIKRO_ORM_DATABASE`      | `heka-identity-service` | Database name.                                           |
| `MIKRO_ORM_LOGGING`       | `all`                   | MikroORM logging level. Set to a falsy value to disable. |

**Agent wallet database (Askar):**

| Variable                   | Default     | Description               |
|----------------------------|-------------|---------------------------|
| `WALLET_POSTGRES_HOST`     | `localhost` | Wallet database host.     |
| `WALLET_POSTGRES_PORT`     | `5432`      | Wallet database port.     |
| `WALLET_POSTGRES_USER`     | `heka`      | Wallet database user.     |
| `WALLET_POSTGRES_PASSWORD` | `heka1`     | Wallet database password. |

### Authentication (JWT)

API requests must carry a Bearer token signed with `JWT_SECRET`. The default values target [Heka Auth Service](https://github.com/hiero-ledger/heka-identity-platform/tree/main/heka-auth-service); when integrating an external OAuth 2.0 provider, configure that provider to issue tokens matching these values and the [required claims](#required-jwt-claims) below.

> When pairing this service with [Heka Auth Service](https://github.com/hiero-ledger/heka-identity-platform/tree/main/heka-auth-service), the three variables in this section must match the corresponding settings on the auth-service side. See [JWT alignment with Identity Service](../../heka-auth-service/README.md#jwt-alignment-with-identity-service) for the side-by-side mapping.

| Variable                      | Default                 | Description                                                                       |
|-------------------------------|-------------------------|-----------------------------------------------------------------------------------|
| `JWT_SECRET`                  | `test`                  | Secret used to sign and verify tokens. **Replace in any non-trivial deployment.** |
| `JWT_VERIFY_OPTIONS_ISSUER`   | `Heka`                  | Required value of the `iss` claim.                                                |
| `JWT_VERIFY_OPTIONS_AUDIENCE` | `Heka Identity Service` | Required value of the `aud` claim.                                                |

#### Required JWT claims

The token strategy (`src/common/auth/jwt.strategy.ts`) and validator (`src/common/auth/auth.service.ts`) expect:

| Claim         | Required | Description                                                                                                                                                      |
|---------------|----------|------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `sub`         | Yes      | Stable user identifier. Used to provision and look up the user record.                                                                                           |
| `roles`       | Yes      | Array of role strings. The first entry is taken as the primary role. Valid values: `Admin`, `OrgAdmin`, `OrgManager`, `OrgMember`, `Issuer`, `Verifier`, `User`. |
| `name`        | Yes      | User-facing display name; also used as the wallet label on first sight.                                                                                          |
| `org_id`      | No       | Optional organization identifier. Required when issuing org-scoped credentials.                                                                                  |
| `iss` / `aud` | Yes      | Standard JWT claims; must match `JWT_VERIFY_OPTIONS_ISSUER` / `_AUDIENCE`.                                                                                       |

The `tenantId` is **not** a JWT claim — it is derived internally from `(role, sub, org_id)` on first request and persisted with the auto-provisioned wallet. See [Concepts and Glossary — Multi-Tenancy](concepts.md#multi-tenancy).

### Ledger / DID methods

| Variable      | Default           | Description                                                                                         |
|---------------|-------------------|-----------------------------------------------------------------------------------------------------|
| `DID_METHODS` | `indy,key,hedera` | Comma-separated list of enabled DID methods. Supported values: `key`, `indy`, `hedera`, `indybesu`. |

**Hyperledger Indy** — when `indy` is enabled:

| Variable             | Default                                        | Description                                    |
|----------------------|------------------------------------------------|------------------------------------------------|
| `INDY_ENDORSER_SEED` | _(dev seed)_                                   | Endorser seed for writing to the Indy network. |
| `INDY_ENDORSER_DID`  | `did:indy:bcovrin:test:4bbYgjU6JbV4DShPbGoQcA` | Endorser DID.                                  |

**Indy Besu** — when `indybesu` is enabled:

| Variable                         | Default                 | Description                         |
|----------------------------------|-------------------------|-------------------------------------|
| `INDY_BESU_CHAIN_ID`             | `1337`                  | EVM chain ID.                       |
| `INDY_BESU_NODE_ADDRESS`         | `http://localhost:8545` | RPC endpoint.                       |
| `INDY_BESU_NETWORK`              | `testnet`               | Indy Besu network identifier.       |
| `INDY_BESU_ENDORSER_PRIVATE_KEY` | _(dev key)_             | Endorser private key (32-byte hex). |
| `INDY_BESU_ENDORSER_PUBLIC_KEY`  | _(dev key)_             | Endorser public key.                |

**Hedera** — see [Hedera Integration](hedera.md) for the full guide. Variables:

| Variable              | Default         | Description                                                                 |
|-----------------------|-----------------|-----------------------------------------------------------------------------|
| `HEDERA_NETWORK`      | `testnet`       | One of `testnet`, `mainnet`, `previewnet`.                                  |
| `HEDERA_OPERATOR_ID`  | _(dev account)_ | Operator account ID (`0.0.<account-num>`). **Replace for non-trivial use.** |
| `HEDERA_OPERATOR_KEY` | _(dev key)_     | DER-encoded Ed25519 private key. **Replace for non-trivial use.**           |

### mDoc issuance

Required when issuing `mso_mdoc` credentials (mobile driving licences and similar):

| Variable                 | Default      | Description                                                                                      |
|--------------------------|--------------|--------------------------------------------------------------------------------------------------|
| `MDL_ISSUER_CERTIFICATE` | _(dev cert)_ | Base64-encoded X.509 certificate used as the mDL issuer's IACA. **Replace for non-trivial use.** |
| `MDL_ISSUER_PRIVATE_KEY` | _(dev key)_  | JSON-encoded JWK private key matching the certificate. **Replace for non-trivial use.**          |

### Logging

| Variable                | Default            | Description                                                              |
|-------------------------|--------------------|--------------------------------------------------------------------------|
| `PINO_LEVEL`            | `info`             | Logger level. One of `trace`, `debug`, `info`, `warn`, `error`, `fatal`. |
| `PINO_FILE_DESTINATION` | _(unset — stdout)_ | Path to write logs to instead of stdout.                                 |
| `NODE_ENV`              | _(unset)_          | When set to `production`, switches the logger to non-pretty JSON output. |

### Health

The service exposes `GET /health`, which checks memory, database connectivity, and agent state:

| Variable                          | Default        | Description                                                       |
|-----------------------------------|----------------|-------------------------------------------------------------------|
| `HEALTH_MEMORY_HEAP_THRESHOLD_MB` | `2048`         | Heap usage threshold above which `memory_heap` reports unhealthy. |
| `HEALTH_MEMORY_RSS_THRESHOLD_MB`  | `2048`         | RSS usage threshold above which `memory_rss` reports unhealthy.   |

Use `/health` as a Kubernetes readiness/liveness probe or a Compose healthcheck.

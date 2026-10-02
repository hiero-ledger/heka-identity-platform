# Setup and Configuration

## Setup locally

### Prerequisites

- **Node.js** — version that supports Corepack (Node 22 LTS recommended).
- **Yarn 4** via Corepack — this project pins `yarn@4.16.0` in `package.json`. Enable Corepack so the correct Yarn version is used automatically:

  ```bash
  corepack enable
  corepack prepare yarn@4.16.0 --activate
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

| Variable               | Description                                                                                                                                                                                    | Default |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `EXPRESS_ENABLE_CORS`  | Set to `true` to enable CORS. Any other value (including unset) disables it.                                                                                                                   | `false` |
| `EXPRESS_CORS_OPTIONS` | JSON string of [CORS options](https://github.com/expressjs/cors#configuration-options) passed directly to `app.enableCors()`. Must be valid JSON; invalid JSON crashes on startup (fail-fast). | `{}`    |

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

### Security-sensitive variables

The defaults of the following variables are development/test credentials that are publicly visible in this repository (`src/config/insecure-defaults.ts`). They are convenient for local exploration but **must be replaced in any real deployment**.

| Variable                         | Checked when                                       |
| -------------------------------- | -------------------------------------------------- |
| `JWT_SECRET`                     | Always                                             |
| `MIKRO_ORM_PASSWORD`             | Always                                             |
| `WALLET_POSTGRES_PASSWORD`       | Always                                             |
| `MDL_ISSUER_PRIVATE_KEY`         | Always (`mso_mdoc` issuance is enabled by default) |
| `INDY_ENDORSER_SEED`             | `DID_METHODS` contains `indy`                      |
| `INDY_BESU_ENDORSER_PRIVATE_KEY` | `DID_METHODS` contains `indybesu`                  |
| `HEDERA_OPERATOR_KEY`            | `DID_METHODS` contains `hedera`                    |
| `FILE_STORAGE_MINIO_SECRET_KEY`  | `FILE_STORAGE_TARGET` is `minio`                   |

At startup the service checks whether any of these is unset, empty, or still equal to its default. For `MDL_ISSUER_PRIVATE_KEY`, any JWK containing the default private key (`d`) counts as the default, regardless of formatting, member order or `kid`:

- when `NODE_ENV` is unset, empty, `development` or `test` (case-insensitive, surrounding whitespace ignored), a warning naming the affected variables is logged and the service starts (local development and tests);
- with any other `NODE_ENV` value, including `production` in any casing, typos such as `prod`, or custom names such as `staging`, the service **refuses to start** and lists the variables that must be set.

Real deployments should set `NODE_ENV=production` explicitly: an unset `NODE_ENV` is treated as local development and only produces the warning.

### HTTP server (Express)

| Variable               | Default     | Description                                                 |
| ---------------------- | ----------- | ----------------------------------------------------------- |
| `EXPRESS_HOST`         | `localhost` | Host the server binds to.                                   |
| `EXPRESS_PORT`         | `3000`      | Port for the REST API and Swagger UI.                       |
| `EXPRESS_PREFIX`       | _(unset)_   | Optional global URL prefix (e.g. `/api`).                   |
| `EXPRESS_ENABLE_CORS`  | `true`      | Enable CORS handling.                                       |
| `EXPRESS_CORS_OPTIONS` | `{}`        | JSON-encoded options passed to the Express CORS middleware. |

### Agent transports

The agent exposes three separate ports — REST/Swagger uses `EXPRESS_PORT`, DIDComm uses two ports, and OpenID4VC uses one. The `*_ENDPOINT` variables are what gets advertised in OOB invitations and OID4VCI metadata; override them when fronting the service with a reverse proxy or a tunnel (see [Local Configuration for Heka Wallet Integration](local-config-for-heka-wallet-integration.md)).

| Variable                               | Default                                       | Description                                                              |
| -------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------ |
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
| ------------------------- | ----------------------- | -------------------------------------------------------- |
| `MIKRO_ORM_DATABASE_TYPE` | `postgresql`            | Database driver. PostgreSQL is the only tested option.   |
| `MIKRO_ORM_HOST`          | `localhost`             | Database host.                                           |
| `MIKRO_ORM_PORT`          | `5432`                  | Database port.                                           |
| `MIKRO_ORM_USER`          | `heka`                  | Database user.                                           |
| `MIKRO_ORM_PASSWORD`      | `heka1`                 | Database password.                                       |
| `MIKRO_ORM_DATABASE`      | `heka-identity-service` | Database name.                                           |
| `MIKRO_ORM_LOGGING`       | `all`                   | MikroORM logging level. Set to a falsy value to disable. |

**Agent wallet database (Askar):**

| Variable                   | Default     | Description               |
| -------------------------- | ----------- | ------------------------- |
| `WALLET_POSTGRES_HOST`     | `localhost` | Wallet database host.     |
| `WALLET_POSTGRES_PORT`     | `5432`      | Wallet database port.     |
| `WALLET_POSTGRES_USER`     | `heka`      | Wallet database user.     |
| `WALLET_POSTGRES_PASSWORD` | `heka1`     | Wallet database password. |

### Authentication (JWT)

API requests must carry a Bearer token signed with `JWT_SECRET`. The default values target [Heka Auth Service](https://github.com/hiero-ledger/heka-identity-platform/tree/main/heka-auth-service); when integrating an external OAuth 2.0 provider, configure that provider to issue tokens matching these values and the [required claims](#required-jwt-claims) below.

> When pairing this service with [Heka Auth Service](https://github.com/hiero-ledger/heka-identity-platform/tree/main/heka-auth-service), the three variables in this section must match the corresponding settings on the auth-service side. See [JWT alignment with Identity Service](../../heka-auth-service/README.md#jwt-alignment-with-identity-service) for the side-by-side mapping.

| Variable                      | Default                 | Description                                                                       |
| ----------------------------- | ----------------------- | --------------------------------------------------------------------------------- |
| `JWT_SECRET`                  | `test`                  | Secret used to sign and verify tokens. **Replace in any non-trivial deployment.** |
| `JWT_VERIFY_OPTIONS_ISSUER`   | `Heka`                  | Required value of the `iss` claim.                                                |
| `JWT_VERIFY_OPTIONS_AUDIENCE` | `Heka Identity Service` | Required value of the `aud` claim.                                                |

#### Required JWT claims

The token strategy (`src/common/auth/jwt.strategy.ts`) and validator (`src/common/auth/auth.service.ts`) expect:

| Claim         | Required | Description                                                                                                                                                                                                                  |
| ------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sub`         | Yes      | Stable user identifier. Used to provision and look up the user record.                                                                                                                                                       |
| `roles`       | Yes      | Array with exactly one role. Valid values: `Admin`, `OrgAdmin`, `OrgManager`, `OrgMember`, `Issuer`, `Verifier`, `User`. It decides the wallet in both modes, and permissions when the [role model](#role-model) is enabled. |
| `name`        | Yes      | User-facing display name; also used as the wallet label on first sight.                                                                                                                                                      |
| `org_id`      | Depends  | Organization identifier. Required for `OrgAdmin`, `OrgManager`, `OrgMember`, `Issuer` and `Verifier`; rejected for `Admin` and `User`.                                                                                       |
| `iss` / `aud` | Yes      | Standard JWT claims; must match `JWT_VERIFY_OPTIONS_ISSUER` / `_AUDIENCE`.                                                                                                                                                   |

The `tenantId` is **not** a JWT claim — it is derived internally from `(role, sub, org_id)` on first request and persisted with the auto-provisioned wallet. See [Concepts and Glossary — Multi-Tenancy](concepts.md#multi-tenancy).

### Role model

| Variable             | Default | Description                                                                                                             |
| -------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| `ROLE_MODEL_ENABLED` | `false` | Set to `true` to enforce role capabilities. When disabled, every user has every capability over the wallet they act in. |

The flag doesn't change roles, organizations or wallets, so it can be changed with a restart without affecting data. See [Concepts — Role model](concepts.md#role-model).

#### Upgrading an existing deployment

The role model release doesn't keep backward compatibility with existing data. A fresh deployment needs no action. Before users of an existing deployment sign in again, read the following and complete steps 3 to 6:

1. **Wallets change for existing tokens.** Wallet IDs now resolve as in the [role model table](concepts.md#role-model). Before, `Admin` tokens used `Administration_<sub>`, `Issuer` / `Verifier` tokens used `<Role>_<sub>_in_Organization_<org_id>`, and `OrgMember` tokens used `Organization_<org_id>`. On the next request these accounts get a new, empty tenant. DIDs, connections, credentials and OID4VC records in the previous tenants aren't deleted, but they can't be reached through the API anymore. `OrgAdmin`, `OrgManager` and `User` wallets are unchanged.
2. **Schemas, templates and status lists are dropped.** Migration `Migration20260924120000` deletes all schemas, issuance and verification templates, and credential status lists, because they now belong to a wallet instead of a user. Status list URLs in previously issued credentials return `404`, so their revocation status can't be checked anymore.
3. **Role restrictions are off by default.** Before this release, the Identity Service always enforced the per-endpoint role lists: for example, only `Admin`, `OrgAdmin` and `Issuer` could call `POST /dids`, and invitations, offers, proofs, OID4VC sessions, status lists and credential definitions were limited to specific roles. With the default `ROLE_MODEL_ENABLED=false`, no role is checked: every token can do everything in the wallet it acts in. For example, a `User` or `Verifier` token can create public DIDs, register schemas and issue credentials. If your tokens don't come from the bundled Auth Service and you rely on narrower roles, set `ROLE_MODEL_ENABLED=true`. The enabled mode enforces the [capability table](concepts.md#role-model), which differs from the previous role lists.
4. **Existing accounts keep their stored role.** Before this release, sign-up let the client choose its role, and the Web UI and `heka-identity-service-web-ui/scripts/prepare-demo-user.ts` registered every account as `Admin`. After the upgrade, all these accounts act in the shared `Administration` wallet, which is the platform identity: they see each other's resources, and with the role model enabled they hold every capability. Reassign every account that isn't a real platform administrator in the Auth Service database, including the demo user (the Auth Service `DEMO_USER`). New sign-ups get `OrgMember`:

   ```sql
   update "auth_user" set "role" = 'OrgMember' where "role" = 'Admin' and "name" not in ('<real admin>', ...);
   ```

5. **Role changes apply to new tokens only.** Access tokens that were already issued keep their old role until they expire, and the demo user's access token is valid for about one year. The Identity Service doesn't check whether the Auth Service revoked a token, so to invalidate outstanding tokens, rotate `JWT_SECRET` in both services. Then re-run `prepare-demo-user.ts` so the Web UI environment gets a new demo user token.
6. **The SSO service account moves to a new wallet.** `heka-sso-service` signs in to the Auth Service as `IDENTITY_SERVICE_AUTH_NAME` (by default the demo user) and creates verification sessions under `IDENTITY_SERVICE_PUBLIC_VERIFIER_ID`, signed with `IDENTITY_SERVICE_REQUEST_SIGNER_DID`. Both belong to the account's previous wallet. Give the service its own account with a role that holds the `verify` and `did` capabilities, such as `Verifier` in an organization, rather than reassigning it to `OrgMember`. With the role model enabled, a `Verifier` can create a public DID only after `Organization_<org_id>` has a main DID, and `Organization_<org_id>` only after `Administration` has one (otherwise `422`). If they don't have one yet, create them in that order: first with an `Admin` account, then with an `OrgAdmin` account of the same organization, each calling `POST /prepare-wallet` or `POST /dids` without a `method`. Only the main (`key`) DID counts: an `indy` or `hedera` DID doesn't satisfy this [DID controller prerequisite](concepts.md#role-model). Then create the signing DID and the verifier again with that account, set both variables to the new values, and restart the SSO service. Replace `IDENTITY_SERVICE_AUTH_TOKEN` too if it is set, because it was signed with the old `JWT_SECRET`.

### Ledger / DID methods

| Variable      | Default           | Description                                                                                         |
| ------------- | ----------------- | --------------------------------------------------------------------------------------------------- |
| `DID_METHODS` | `indy,key,hedera` | Comma-separated list of enabled DID methods. Supported values: `key`, `indy`, `hedera`, `indybesu`. |

**Hyperledger Indy** — when `indy` is enabled:

| Variable             | Default                                        | Description                                    |
| -------------------- | ---------------------------------------------- | ---------------------------------------------- |
| `INDY_ENDORSER_SEED` | _(dev seed)_                                   | Endorser seed for writing to the Indy network. |
| `INDY_ENDORSER_DID`  | `did:indy:bcovrin:test:4bbYgjU6JbV4DShPbGoQcA` | Endorser DID.                                  |

**Indy Besu** — when `indybesu` is enabled:

| Variable                         | Default                 | Description                         |
| -------------------------------- | ----------------------- | ----------------------------------- |
| `INDY_BESU_CHAIN_ID`             | `1337`                  | EVM chain ID.                       |
| `INDY_BESU_NODE_ADDRESS`         | `http://localhost:8545` | RPC endpoint.                       |
| `INDY_BESU_NETWORK`              | `testnet`               | Indy Besu network identifier.       |
| `INDY_BESU_ENDORSER_PRIVATE_KEY` | _(dev key)_             | Endorser private key (32-byte hex). |
| `INDY_BESU_ENDORSER_PUBLIC_KEY`  | _(dev key)_             | Endorser public key.                |

**Hedera** — see [Hedera Integration](hedera.md) for the full guide. Variables:

| Variable              | Default         | Description                                                                 |
| --------------------- | --------------- | --------------------------------------------------------------------------- |
| `HEDERA_NETWORK`      | `testnet`       | One of `testnet`, `mainnet`, `previewnet`.                                  |
| `HEDERA_OPERATOR_ID`  | _(dev account)_ | Operator account ID (`0.0.<account-num>`). **Replace for non-trivial use.** |
| `HEDERA_OPERATOR_KEY` | _(dev key)_     | DER-encoded Ed25519 private key. **Replace for non-trivial use.**           |

### mDoc issuance

Required when issuing `mso_mdoc` credentials (mobile driving licences and similar):

| Variable                 | Default      | Description                                                                                      |
| ------------------------ | ------------ | ------------------------------------------------------------------------------------------------ |
| `MDL_ISSUER_CERTIFICATE` | _(dev cert)_ | Base64-encoded X.509 certificate used as the mDL issuer's IACA. **Replace for non-trivial use.** |
| `MDL_ISSUER_PRIVATE_KEY` | _(dev key)_  | JSON-encoded JWK private key matching the certificate. **Replace for non-trivial use.**          |

### Logging

| Variable                | Default            | Description                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PINO_LEVEL`            | `info`             | Logger level. One of `trace`, `debug`, `info`, `warn`, `error`, `fatal`.                                                                                                                                                                                                                                                                |
| `PINO_FILE_DESTINATION` | _(unset — stdout)_ | Path to write logs to instead of stdout.                                                                                                                                                                                                                                                                                                |
| `NODE_ENV`              | _(unset)_          | When set to exactly `production`, switches the logger to non-pretty JSON output. Unless `NODE_ENV` is unset, empty, `development` or `test` (case-insensitive, surrounding whitespace ignored), the service refuses to start with [insecure default credentials](#security-sensitive-variables); in those cases it only logs a warning. |

### Health

The service exposes `GET /health`, which checks memory, database connectivity, and agent state:

| Variable                          | Default | Description                                                       |
| --------------------------------- | ------- | ----------------------------------------------------------------- |
| `HEALTH_MEMORY_HEAP_THRESHOLD_MB` | `2048`  | Heap usage threshold above which `memory_heap` reports unhealthy. |
| `HEALTH_MEMORY_RSS_THRESHOLD_MB`  | `2048`  | RSS usage threshold above which `memory_rss` reports unhealthy.   |

Use `/health` as a Kubernetes readiness/liveness probe or a Compose healthcheck.

### Notification webhooks

When a user sets `messageDeliveryType` to `WebHook` on `PATCH /user`, the service treats the configured URL as untrusted egress. The URL is validated when it is saved, again before every notification, and once more against the resolved addresses immediately before the TCP connection (so a DNS answer that changes in between cannot redirect the request).

By default a webhook URL is accepted only when it:

- uses `https:` (see `WEBHOOK_ALLOW_HTTP`);
- carries no embedded credentials (`https://user:pass@host/`);
- does not use a reserved hostname (`localhost`, `metadata.google.internal`, `metadata.goog`, `kubernetes.default[.svc]`, or any `.local` / `.internal` / `.localhost` name);
- resolves exclusively to globally routable unicast addresses — loopback, private (RFC1918), carrier-grade NAT, link-local (including the `169.254.169.254` metadata endpoint), multicast, broadcast, documentation and other reserved ranges are rejected, for both IPv4 and IPv6.

Deliveries are additionally bounded: redirects are never followed, the response body is capped at 500 KiB, and each POST has a wall-clock deadline.

Webhook deliveries always connect directly to the validated address and ignore `HTTP_PROXY` / `HTTPS_PROXY` / `NODE_USE_ENV_PROXY`, because a proxy would resolve and connect to the destination outside the address policy. Deployments whose only internet egress is through an HTTP(S) proxy cannot deliver webhooks.

| Variable                          | Default | Description                                                                                                                     |
| --------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `WEBHOOK_ALLOW_HTTP`              | `false` | Set to `true` to accept plaintext `http://` callbacks. HTTPS-only otherwise.                                                    |
| `WEBHOOK_ALLOW_PRIVATE_ADDRESSES` | `false` | Set to `true` to allow loopback / private / reserved targets and internal hostnames. For local development, Docker and CI only. |
| `WEBHOOK_HTTP_TIMEOUT_MS`         | `10000` | Deadline for a single webhook POST, in milliseconds. Also caps the time spent resolving and connecting.                         |

`WEBHOOK_ALLOW_PRIVATE_ADDRESSES` only relaxes the address and hostname rules. The scheme rule, the credential check, the redirect prohibition, the timeout and the response size cap always apply.

To deliver notifications to a local sink or to a sibling Compose container, enable both settings, for example in `.env` (loaded by `yarn start` and used by `docker compose -f docker-compose.dev.yml` for variable substitution):

```dotenv
WEBHOOK_ALLOW_HTTP=true
WEBHOOK_ALLOW_PRIVATE_ADDRESSES=true
```

For a one-off run, prefix the start command instead: `WEBHOOK_ALLOW_HTTP=true WEBHOOK_ALLOW_PRIVATE_ADDRESSES=true yarn start`.

A minimal local sink that accepts the notification POST and prints its body (the service must be able to reach it; with `yarn start` use `http://127.0.0.1:9999/` as the webhook URL):

```bash
python3 - <<'EOF'
from http.server import BaseHTTPRequestHandler, HTTPServer

class Sink(BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        print(body.decode(), flush=True)
        self.send_response(204)
        self.end_headers()

HTTPServer(('127.0.0.1', 9999), Sink).serve_forever()
EOF
```

Webhook URLs stored before this policy existed are kept in the database as-is; there is no migration. A stored URL that violates the policy is not removed, but each delivery attempt is rejected and logged as `Notification delivery failed` with a `policy:<CODE>` reason. Users can restore delivery by saving a compliant URL via `PATCH /user`.

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

`docker-compose.yml` in this directory runs the identity service and its Postgres on their own; the OIDC provider (and anything else) is expected on the host and reached through `host.docker.internal`. Values come from this directory's `.env`, under the same names `yarn start` uses, and default to the dev Keycloak of the root project. One difference from `yarn start`: a URL the service itself calls must not say `localhost`, which inside the container is the container. Leave `OIDC_JWKS_URI` and `DEMO_TOKEN_URL` unset to get the compose file's `host.docker.internal` defaults, or set them to `http://host.docker.internal:8080/...` yourself; the browser-facing `OIDC_ISSUER_URL` stays on `localhost`.

To build the image and run it:

```shell
docker compose up -d --build
```

To run the image named by `IMAGE` in `.env` without building:

```shell
docker compose up -d
```

To run the whole platform, Keycloak included, use the root project instead: [Running the platform with Docker Compose](../../docs/root-docker-compose.md). The two scopes share host ports, so run one or the other. For just the dev Keycloak next to a host-run identity service: `docker compose --profile keycloak up -d keycloak` at the repository root.

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

### Authentication (OIDC)

API requests must carry a Bearer token issued by an OpenID Connect provider — Keycloak, Auth0, or any provider that publishes a discovery document and a JWKS. The service verifies the signature against the provider's JWKS, checks `iss`, `aud` and expiry, and then reads its four contract claims through configurable claim paths. Tokens signed with a shared secret (HMAC) are not accepted.

| Variable               | Default                            | Description                                                                                                                                                                                                                                         |
| ---------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OIDC_ISSUER_URL`      | _(required)_                       | Exact `iss` value, e.g. `http://localhost:8080/realms/heka-platform` (Keycloak) or `https://<tenant>.<region>.auth0.com/` (Auth0, with the trailing slash). The discovery document is fetched from `<issuer>/.well-known/openid-configuration` on first use. |
| `OIDC_AUDIENCE`        | _(required)_                       | Accepted `aud` value. An array `aud` is accepted when it contains this value.                                                                                                                                                                       |
| `OIDC_JWKS_URI`        | _(from discovery)_                 | JWKS endpoint override; skips discovery.                                                                                                                                                                                                            |
| `OIDC_JWKS`            | _(unset)_                          | Inline JWKS (JSON) for dev/test; bypasses discovery and `OIDC_JWKS_URI`.                                                                                                                                                                            |
| `OIDC_ALGORITHMS`      | `RS256`                            | Comma-separated allowed signature algorithms. HMAC algorithms are refused at startup.                                                                                                                                                               |
| `OIDC_CLOCK_TOLERANCE` | `15`                               | Accepted clock skew in seconds.                                                                                                                                                                                                                     |
| `OIDC_CLAIM_USER_ID`   | `sub`                              | Claim path of the stable user id.                                                                                                                                                                                                                   |
| `OIDC_CLAIM_ROLES`     | `roles`                            | Claim path of the Heka role (a string or an array).                                                                                                                                                                                                 |
| `OIDC_CLAIM_NAME`      | `name,preferred_username,nickname` | Comma-separated fallback list of display-name claim paths; the user id is the last resort.                                                                                                                                                          |
| `OIDC_CLAIM_ORG_ID`    | `org_id`                           | Claim path of the organization id.                                                                                                                                                                                                                  |

The service refuses to start when `OIDC_ISSUER_URL` or `OIDC_AUDIENCE` is missing, and logs the effective issuer, audience, key source and claim paths at startup. A discovery or JWKS fetch failure is reported as a server error, not as `401`, so a misconfigured or unreachable provider is distinguishable from a bad token.

#### Claim paths

A claim path is resolved in this order: as a literal top-level key (so namespaced names such as `https://heka/roles` work as-is), as a JSON pointer when it starts with `/` (RFC 6901, e.g. `/realm_access/roles` or `/https:~1~1heka~1roles`), otherwise as a dotted path (`realm_access.roles`).

#### Required JWT claims

`TokenVerifier` (`src/common/auth/token-verifier.service.ts`) verifies the token and `mapClaims` (`src/common/auth/claims.ts`) applies the contract:

| Claim         | Required | Description                                                                                                                                                                                                                  |
| ------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sub`         | Yes      | Stable user identifier. Used to provision and look up the user record.                                                                                                                                                       |
| `roles`       | Yes      | Array with exactly one role. Valid values: `Admin`, `OrgAdmin`, `OrgManager`, `OrgMember`, `Issuer`, `Verifier`, `User`. It decides the wallet in both modes, and permissions when the [role model](#role-model) is enabled. |
| `name`        | Yes      | User-facing display name; also used as the wallet label on first sight.                                                                                                                                                      |
| `org_id`      | Depends  | Organization identifier. Required for `OrgAdmin`, `OrgManager`, `OrgMember`, `Issuer` and `Verifier`; rejected for `Admin` and `User`.                                                                                       |
| `iss` / `aud` | Yes      | Standard JWT claims; must match `JWT_VERIFY_OPTIONS_ISSUER` / `_AUDIENCE`.                                                                                                                                                   |

The `tenantId` is **not** a JWT claim — it is derived internally from `(role, sub, org_id)` on first request and persisted with the auto-provisioned wallet. See [Concepts and Glossary — Multi-Tenancy](concepts.md#multi-tenancy).

### Role model

| Variable             | Default | Description                                                                                                                            |
| -------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `ROLE_MODEL_ENABLED` | `false` | Set to `true` to enforce the roles allowed on each endpoint and the DID controller. When disabled, every user can call every endpoint. |

The flag doesn't change roles or wallets, so it can be changed with a restart without affecting data. See [Concepts — Role model](concepts.md#role-model).

#### Upgrading an existing deployment

A fresh deployment needs no action. Before users of an existing deployment sign in again, read the following and complete steps 3 to 6:

1. **`Admin` tokens use a shared wallet.** Every `Admin` now acts in the shared `Administration` wallet instead of a personal `Administration_<sub>` wallet. On the next request these accounts use that wallet; DIDs, connections, credentials and OID4VC records in their previous wallets aren't deleted, but they can't be reached through the API anymore. All other wallets are unchanged.
2. **Schemas move to wallets.** Migration `Migration20260924120000` makes each schema belong to a wallet of the user who created it: the wallet whose primary DID registered it, otherwise the creator's wallet whose ID sorts first alphabetically (wallets have no creation date, so this isn't necessarily the oldest one). No data is deleted, and the creator stays the schema's issuer. For accounts that were `Admin` before this release, that wallet is their previous `Administration_<sub>` wallet, so their schemas aren't visible from the shared `Administration` wallet or from the `User_<sub>` wallet of a reassigned account. Templates and credential status lists still belong to their users.
3. **Role restrictions are off by default.** Before this release, the Identity Service always enforced the per-endpoint role lists: for example, only `Admin`, `OrgAdmin` and `Issuer` could call `POST /dids`, and invitations, offers, proofs, OID4VC sessions, status lists and credential definitions were limited to specific roles. With the default `ROLE_MODEL_ENABLED=false`, no role is checked: every token can do everything in the wallet it acts in. If your tokens don't come from the bundled Auth Service and you rely on these role lists, set `ROLE_MODEL_ENABLED=true`; the enabled mode enforces the same lists as before.
4. **Existing accounts keep their stored role.** Before this release, sign-up let the client choose its role, and the Web UI and `heka-identity-service-web-ui/scripts/prepare-demo-user.ts` registered every account as `Admin`. After the upgrade, all these accounts act in the shared `Administration` wallet: they see each other's resources. Reassign every account that isn't a real platform administrator, including the demo user (the Auth Service `DEMO_USER`). New sign-ups get `User`. An `Admin` can do this with the Auth Service [role assignment API](../../heka-auth-service/README.md#api) (`PATCH /api/v1/users/{id}/role`), or directly in the Auth Service database:

   ```sql
   update "auth_user" set "role" = 'User' where "role" = 'Admin' and "name" not in ('<real admin>', ...);
   ```

5. **Role changes apply to new tokens only.** Access tokens that were already issued keep their old role until they expire, and the demo user's access token is valid for about one year. The Identity Service doesn't check whether the Auth Service revoked a token, so to invalidate outstanding tokens, rotate `JWT_SECRET` in both services. Then re-run `prepare-demo-user.ts` so the Web UI environment gets a new demo user token.
6. **The SSO service account moves to a new wallet.** `heka-sso-service` signs in to the Auth Service as `IDENTITY_SERVICE_AUTH_NAME` (by default the demo user) and creates verification sessions under `IDENTITY_SERVICE_PUBLIC_VERIFIER_ID`, signed with `IDENTITY_SERVICE_REQUEST_SIGNER_DID`. Both belong to the account's previous wallet. Give the service its own account with a role that can create a public DID and verifiers, such as `OrgAdmin` of an organization, rather than reassigning it to `User`. Create the signing DID and the verifier again with that account, set both variables to the new values, and restart the SSO service. Replace `IDENTITY_SERVICE_AUTH_TOKEN` too if it is set, because it was signed with the old `JWT_SECRET`.

#### Provider recipes

**Keycloak** — the `heka-platform` realm shipped in [`heka-sso-service/keycloak/realm-heka-platform.json`](../../heka-sso-service/keycloak/README.md) already contains the recipe: a bearer-only client `heka-identity-service` owning the client roles `Admin`, `OrgAdmin`, `OrgManager`, `OrgMember`, `Issuer`, `Verifier`, `User`, and on each client that requests tokens the protocol mappers User Client Role → claim `roles` (multivalued, in the access token), User Attribute `org_id` → `org_id`, User Property `id` → `heka_uid`, and Audience `heka-identity-service`. The display name comes from the built-in `profile` scope (`name` / `preferred_username`), which the default `OIDC_CLAIM_NAME` fallback list already reads. Then set `OIDC_ISSUER_URL=http://<keycloak>/realms/heka-platform` and `OIDC_AUDIENCE=heka-identity-service`; the claim paths keep their defaults. For another realm, recreate the same client, roles and mappers.

**Auth0** — the recipe lives in [`heka-sso-service/auth0`](../../heka-sso-service/auth0/README.md): `setup-tenant.sh` creates the API `https://heka-identity` (RS256), the SPA and machine-to-machine applications, the Heka roles, and deploys two Actions (`post-login`, `credentials-exchange`) that set the namespaced custom claims `https://heka/roles` (array with one role), `https://heka/name`, `https://heka/org_id` and `https://heka/heka_uid` on access tokens requested with that audience — namespaced names are mandatory in Auth0 access tokens with an API audience. Then set `OIDC_ISSUER_URL=https://<tenant>.<region>.auth0.com/` (trailing slash), `OIDC_AUDIENCE=https://heka-identity`, `OIDC_CLAIM_ROLES=https://heka/roles`, `OIDC_CLAIM_NAME=https://heka/name,name,nickname`, `OIDC_CLAIM_ORG_ID=https://heka/org_id` and `OIDC_CLAIM_USER_ID=https://heka/heka_uid`. Clients must request the API `audience`, otherwise Auth0 issues opaque access tokens.

The full migration plan, including the web UI and SSO service sides, is in [docs/keycloak-replacement-for-auth-service.md](../../docs/keycloak-replacement-for-auth-service.md) at the repository root.

### Demo token broker

The web UI's public demo pages (Demo, Age verification) run without a signed-in user. Instead of a long-lived token baked into the web bundle, they call `GET /demo/token` on this service, which returns a short-lived access token of a dedicated **demo service account** obtained with an OAuth 2.0 Client Credentials grant from the OIDC provider above (`{ "access_token", "token_type": "Bearer", "expires_in" }`). The token is cached and re-acquired a minute before it expires, so the provider sees one grant per token lifetime however many browsers open the demo. The endpoint is optional: it answers `404` until all three required settings are present, and `502` when the provider does not issue a token.

| Variable                  | Default              | Description                                                                                                                                                                     |
| ------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEMO_TOKEN_URL`          | _(unset: disabled)_  | Provider token endpoint, e.g. `http://localhost:8080/realms/heka-platform/protocol/openid-connect/token` or `https://<tenant>.<region>.auth0.com/oauth/token`.                   |
| `DEMO_CLIENT_ID`          | _(unset: disabled)_  | Confidential client with a service account that carries the demo tenant's claims: `heka-demo` in the shipped Keycloak realm, the `heka-demo` application's client id in Auth0. |
| `DEMO_CLIENT_SECRET`      | _(unset: disabled)_  | Its secret. Production refuses the dev secret of the shipped realm and secrets shorter than 16 characters.                                                                       |
| `DEMO_CLIENT_AUTH_METHOD` | `client_secret_post` | `client_secret_post` or `client_secret_basic`.                                                                                                                                  |
| `DEMO_TOKEN_PARAMS`       | _(none)_             | Extra form fields for the token request as a JSON object, e.g. `{"audience":"https://heka-identity"}` for Auth0.                                                                |
| `DEMO_TOKEN_RATE_LIMIT`   | `30`                 | Requests per minute per client IP accepted by `GET /demo/token` (`429` above it). Only this endpoint is rate-limited.                                                            |

Anyone can call the endpoint, as anyone could read the bundled token before, so keep the demo account on the minimum role it needs and keep the provider's access-token lifetime for that client short (minutes). The three settings must be set together; a partial set is a startup error. Behind a reverse proxy set Express `trust proxy` so the rate limit sees client addresses rather than the proxy's.

The demo account is created by the provider recipe: the Keycloak realm ships the `heka-demo` client with a service-account user of fixed id `e5f6a7b8-c9d0-4e1f-a2b3-c4d5e6f7a8b9`, and `setup-tenant.sh` creates an Auth0 machine-to-machine application `heka-demo` whose metadata carries the same `heka_uid`, so the demo tenant and its DID are the same on both providers. The web UI's `yarn prepare-demo-user` then obtains a token from the broker, prepares that tenant's wallet through `/prepare-wallet` and records the DID for the build (see the [web UI README](../../heka-identity-service-web-ui/README.md#creation-of-pre-defined-demo-user)).

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

To deliver notifications to a local sink or to a sibling Compose container, enable both settings, for example in `.env` (loaded by `yarn start` and used by `docker compose` for variable substitution):

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

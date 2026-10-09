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

| Variable                  | Default                            | Description                                                                                                                                                                                                                                                  |
| ------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `OIDC_ISSUER_URL`         | _(required)_                       | Exact `iss` value, e.g. `http://localhost:8080/realms/heka-platform` (Keycloak) or `https://<tenant>.<region>.auth0.com/` (Auth0, with the trailing slash). The discovery document is fetched from `<issuer>/.well-known/openid-configuration` on first use. |
| `OIDC_AUDIENCE`           | _(required)_                       | Accepted `aud` value. An array `aud` is accepted when it contains this value.                                                                                                                                                                                |
| `OIDC_JWKS_URI`           | _(from discovery)_                 | JWKS endpoint override; skips discovery.                                                                                                                                                                                                                     |
| `OIDC_JWKS`               | _(unset)_                          | Inline JWKS (JSON) for dev/test; bypasses discovery and `OIDC_JWKS_URI`.                                                                                                                                                                                     |
| `OIDC_ALGORITHMS`         | `RS256`                            | Comma-separated allowed signature algorithms. HMAC algorithms are refused at startup.                                                                                                                                                                        |
| `OIDC_CLOCK_TOLERANCE`    | `15`                               | Accepted clock skew in seconds.                                                                                                                                                                                                                              |
| `OIDC_CLAIM_USER_ID`      | `sub`                              | Claim path of the stable user id.                                                                                                                                                                                                                            |
| `OIDC_CLAIM_ROLES`        | `roles`                            | Claim path of the Heka role (a string or an array).                                                                                                                                                                                                          |
| `OIDC_CLAIM_NAME`         | `name,preferred_username,nickname` | Comma-separated fallback list of display-name claim paths; the user id is the last resort.                                                                                                                                                                   |
| `OIDC_CLAIM_ORG_ID`       | `org_id`                           | Comma-separated fallback list of claim paths for the organization id; the first one present wins. The Keycloak recipe uses `heka_organization,org_id`: the organization chosen at login, else the `org_id` user attribute.                                   |
| `OIDC_CLAIM_ORG_ID_FIELD` | _(unset)_                          | Field that holds the Heka organization id inside an organization object, e.g. `heka_org_id` for Keycloak Organizations (`{ "<alias>": { "heka_org_id": ["<id>"] } }`).                                                                                       |

The service refuses to start when `OIDC_ISSUER_URL` or `OIDC_AUDIENCE` is missing, and logs the effective issuer, audience, key source and claim paths at startup. A discovery or JWKS fetch failure is reported as a server error, not as `401`, so a misconfigured or unreachable provider is distinguishable from a bad token.

#### Claim paths

A claim path is resolved in this order: as a literal top-level key (so namespaced names such as `https://heka/roles` work as-is), as a JSON pointer when it starts with `/` (RFC 6901, e.g. `/realm_access/roles` or `/https:~1~1heka~1roles`), otherwise as a dotted path (`realm_access.roles`).

#### Required JWT claims

`TokenVerifier` (`src/common/auth/token-verifier.service.ts`) verifies the token and `mapClaims` (`src/common/auth/claims.ts`) applies the contract. The claim names below are the defaults; each one is read through its `OIDC_CLAIM_*` path.

| Claim (default path)           | Required | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sub` (`OIDC_CLAIM_USER_ID`)   | Yes      | Stable user identifier, at most 255 characters. Used to provision and look up the user record. The recipes point it at `heka_uid`, which keeps the same value when users move to another provider.                                                                                                                                                                                                                                                                                                                                                                                       |
| `roles` (`OIDC_CLAIM_ROLES`)   | Yes      | A string or an array. Values that aren't Heka roles are ignored, and exactly one Heka role must remain: `Admin`, `OrgAdmin`, `OrgManager`, `OrgMember`, `Issuer`, `Verifier` or `User`. It decides the wallet in both modes, and permissions when the [role model](#role-model) is enabled. Roles are assigned in the OIDC provider; see [Managing roles](#managing-roles).                                                                                                                                                                                                              |
| `name` (`OIDC_CLAIM_NAME`)     | No       | User-facing display name; also used as the wallet label on first sight. Falls back to the user id.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `org_id` (`OIDC_CLAIM_ORG_ID`) | Depends  | Organization identifier. Required for `OrgAdmin`, `OrgManager`, `OrgMember`, `Issuer` and `Verifier`; ignored for `Admin` and `User`, who act outside any organization (a provider includes one, for example, for a new sign-up added to an organization before they get an organization role). Accepted shapes: a string; a single-element array; or an object with exactly one key, the organization, whose `OIDC_CLAIM_ORG_ID_FIELD` is read (without a field, the key itself is the id). A claim listing two or more organizations is rejected (`401`): the login has to select one. |
| `iss` / `aud`                  | Yes      | Standard JWT claims. They must match `OIDC_ISSUER_URL` and `OIDC_AUDIENCE`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

The `tenantId` is **not** a JWT claim — it is derived internally from `(role, sub, org_id)` on first request and persisted with the auto-provisioned wallet. See [Concepts and Glossary — Multi-Tenancy](concepts.md#multi-tenancy).

### Wallet preparation

| Variable                      | Default | Description                                                                                                                        |
| ----------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `PREPARE_WALLET_LOCK_TIMEOUT` | `300`   | Seconds a `POST /prepare-wallet` call waits while another call prepares the same wallet, on any instance, before it returns `503`. |

`POST /prepare-wallet` calls for one wallet run one at a time, also across Identity Service instances. A PostgreSQL advisory lock on the wallet id is held on a dedicated database connection for the whole preparation. A concurrent caller (for example, a second member of a shared organization wallet) waits, then gets the fully prepared wallet. A repeated call creates whatever is still missing: a DID that failed before, OID4VC records, schema registrations on a DID created later. The `dids` list in the response reports each DID method as `created`, `existing`, `failed` (retried by the next call) or `skipped` (not allowed for the role).

### Role model

| Variable             | Default | Description                                                                                                                            |
| -------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `ROLE_MODEL_ENABLED` | `false` | Set to `true` to enforce the roles allowed on each endpoint and the DID controller. When disabled, every user can call every endpoint. |

The flag doesn't change roles or wallets, so it can be changed with a restart without affecting data. See [Concepts — Role model](concepts.md#role-model).

#### Managing roles

Roles are assigned in the OIDC provider, not in the Identity Service. The shipped recipes set safe defaults:

- every new user gets `User` (a personal `User_<id>` wallet);
- the SSO service account is `OrgAdmin` of its own organization `heka-sso`;
- the demo service account, whose token is public, is `User`;
- `Admin` is never a default. Every `Admin` acts in the one shared `Administration` wallet, the platform identity, so give it only to platform operators.

How to create the first `Admin`, keep operators, assign organization roles and recover access is described for each provider in the Keycloak README, [Managing roles](../../heka-sso-service/keycloak/README.md#managing-roles), and the Auth0 README, [Managing roles](../../heka-sso-service/auth0/README.md#managing-roles).

A role change reaches the Identity Service with the user's next access token. It also moves the user to another wallet; the previous wallet keeps its data.

#### Upgrading an existing deployment

A fresh deployment needs no action. A deployment that still runs heka-auth-service changes two things at once: the role model of #215 (shared `Administration` wallet, wallet-owned schemas, the `ROLE_MODEL_ENABLED` flag), and the switch to an OIDC provider. Plan the switch as one maintenance window, and follow the step-by-step [runbook](../../docs/runbook-migrate-to-oidc-provider.md); it includes the checks and a rollback. The points below summarize what changes.

1. **`Admin` tokens use a shared wallet.** Every `Admin` now acts in the shared `Administration` wallet instead of a personal `Administration_<sub>` wallet. DIDs, connections, credentials and OID4VC records in the previous wallets aren't deleted, but they can't be reached through the API anymore. All other wallets are unchanged.
2. **Schemas move to wallets.** Migration `Migration20260924120000` makes each schema belong to a wallet of the user who created it. That is the wallet whose primary DID registered it; otherwise it is the creator's wallet whose ID sorts first alphabetically. Wallets have no creation date, so this isn't necessarily the oldest one. No data is deleted, and the creator stays the schema's issuer. For accounts that were `Admin` before this release, that wallet is their previous `Administration_<sub>` wallet, so their schemas aren't visible from the shared `Administration` wallet, or from the `User_<sub>` wallet of a reassigned account. Templates and credential status lists still belong to their users.
3. **Role restrictions are off by default.** Before #215, the Identity Service always enforced the per-endpoint role lists. For example, only `Admin`, `OrgAdmin` and `Issuer` could call `POST /dids`, and invitations, offers, proofs, OID4VC sessions, status lists and credential definitions were limited to specific roles. With the default `ROLE_MODEL_ENABLED=false`, no role is checked: every token can do everything in the wallet it acts in. If you rely on these role lists, set `ROLE_MODEL_ENABLED=true`; the enabled mode enforces the same lists as before.
4. **Only real operators stay `Admin`.** Before #215, sign-up let the client choose its role, and the Web UI and `prepare-demo-user.ts` registered every account as `Admin`. Migrated unchanged, all these accounts would act in the shared `Administration` wallet and see each other's resources.
   - The export tool therefore refuses to export `Admin` accounts until you name the operators with `--keep-admin <name>`. Every other `Admin` is exported as `User`, and the heka-auth-service database is left unchanged.
   - `--report` shows every account's role and wallet after the migration before anything is imported.
5. **Migrate the accounts to the OIDC provider.** Dump `auth_user`, convert it with [`tools/heka-auth-user-export`](../../tools/heka-auth-user-export/README.md) (passing the deployment's `ORG_ID` as `--org-id`), import it into Keycloak or Auth0, and check the result with `verify-import.mjs`.
   - Each account keeps its id as `heka_uid`.
   - Organization roles get `org_id` = `ORG_ID`.
   - So every account that keeps its role lands in the same wallet as before.
6. **Switch the services.** Configure the Identity Service with `OIDC_*` (see [Authentication (OIDC)](#authentication-oidc)), then switch the SSO service and the Web UI. Tokens issued by heka-auth-service stop working at once, so users sign in again. From then on, role changes are made in the provider and apply with the next access token (see [Managing roles](#managing-roles)).
7. **Re-create the service accounts' wallets.** The SSO service now authenticates as its own service account (`OrgAdmin` of `heka-sso` in both recipes), and the demo pages as `heka-demo` (`User`). Both get new wallets.
   - With the SSO account's token, call `POST /prepare-wallet`. Set `IDENTITY_SERVICE_PUBLIC_VERIFIER_ID` and `IDENTITY_SERVICE_REQUEST_SIGNER_DID` to the DID it returns, and restart the SSO service.
   - Run `yarn prepare-demo-user` in the Web UI and rebuild it.
8. **Tell former `Admin`s who are now `User`s** that they start in an empty `User_<id>` wallet. Their earlier data stays in the old wallet.
9. **Retire heka-auth-service** once the import has been verified. Keep its database dump until then.

Step by step: [docs/runbook-migrate-to-oidc-provider.md](../../docs/runbook-migrate-to-oidc-provider.md). Background: [docs/keycloak-replacement-for-auth-service.md](../../docs/keycloak-replacement-for-auth-service.md) (the switch) and [docs/role-model-and-oidc-providers.md](../../docs/role-model-and-oidc-providers.md) (the role model).

#### Provider recipes

**Keycloak** — the `heka-platform` realm shipped in [`heka-sso-service/keycloak/realm-heka-platform.json`](../../heka-sso-service/keycloak/README.md) already contains the recipe: a bearer-only client `heka-identity-service` owning the client roles `Admin`, `OrgAdmin`, `OrgManager`, `OrgMember`, `Issuer`, `Verifier`, `User`, and on each client that requests tokens the protocol mappers User Client Role → claim `roles` (multivalued, in the access token), User Attribute `org_id` → `org_id`, User Property `id` → `heka_uid`, and Audience `heka-identity-service`. The display name comes from the built-in `profile` scope (`name` / `preferred_username`), which the default `OIDC_CLAIM_NAME` fallback list already reads. Roles: the default group `heka-users` grants `User` to every new user, and the group `heka-admins` grants `Admin` to operators. Organizations: the realm has Keycloak Organizations enabled; the Web UI requests the `organization` scope, so a member of several organizations picks one at login, and the client mapper `heka organization` emits it as `heka_organization` with the organization attribute `heka_org_id`. Then set `OIDC_ISSUER_URL=http://<keycloak>/realms/heka-platform`, `OIDC_AUDIENCE=heka-identity-service`, `OIDC_CLAIM_ORG_ID=heka_organization,org_id` and `OIDC_CLAIM_ORG_ID_FIELD=heka_org_id`; the other claim paths keep their defaults. For another realm, recreate the same client, roles and mappers.

**Auth0** — the recipe lives in [`heka-sso-service/auth0`](../../heka-sso-service/auth0/README.md): `setup-tenant.sh` creates the API `https://heka-identity` (RS256), the SPA and machine-to-machine applications, the Heka roles, and deploys two Actions (`post-login`, `credentials-exchange`) that set the namespaced custom claims `https://heka/roles` (array with one role), `https://heka/name`, `https://heka/org_id` and `https://heka/heka_uid` on access tokens requested with that audience — namespaced names are mandatory in Auth0 access tokens with an API audience. Then set `OIDC_ISSUER_URL=https://<tenant>.<region>.auth0.com/` (trailing slash), `OIDC_AUDIENCE=https://heka-identity`, `OIDC_CLAIM_ROLES=https://heka/roles`, `OIDC_CLAIM_NAME=https://heka/name,name,nickname`, `OIDC_CLAIM_ORG_ID=https://heka/org_id` and `OIDC_CLAIM_USER_ID=https://heka/heka_uid`. Clients must request the API `audience`, otherwise Auth0 issues opaque access tokens. A login through an Auth0 Organization (the Web UI sends `organization` when `REACT_APP_OIDC_ORGANIZATION` is set) carries that organization's `metadata.heka_org_id` as `https://heka/org_id` and the role of the membership.

The full migration plan, including the web UI and SSO service sides, is in [docs/keycloak-replacement-for-auth-service.md](../../docs/keycloak-replacement-for-auth-service.md) at the repository root.

### Organization administration

An `OrgAdmin` can manage the Heka roles of their own organization's members through this API, without an account in the provider's admin console. The roles stay in the OIDC provider. The service changes them through the provider's admin API with a dedicated service account, and enforces the rules heka-auth-service had for `OrgAdmin`s.

| Endpoint                                                                | Result                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /organization/members`                                             | The members of the caller's organization: provider user id, Heka user id, username, Heka role(s), and whether the member is the caller.                                                                                                                                        |
| `PUT /organization/members/{memberId}/role` with `{ "role": "Issuer" }` | Gives the member exactly that organization role (`OrgAdmin`, `OrgManager`, `OrgMember`, `Issuer`, `Verifier`) and removes any other Heka role. In Keycloak, the member also leaves the `heka-users` default group. The change reaches the member with their next access token. |

The rules, enforced on every call, whatever `ROLE_MODEL_ENABLED` says:

- **Who:** only an `OrgAdmin`.
- **Which organization:** only the one in the caller's token. It must exist in the provider's Organizations, with `heka_org_id` = the token's `org_id`.
- **Which roles:** only organization roles; `Admin` and `User` can't be assigned.
- **Not oneself:** a caller can't change their own role.
- **Not operators:** members with `Admin` are never touched.
- **Fresh check:** the caller's own membership and role are read again from the provider before each call, so a token issued before a demotion can't be used.

Answers:

- `403`: the caller isn't, or is no longer, an `OrgAdmin` member.
- `404`: the feature is off, or the organization or member is unknown.
- `400`: not an organization role.
- `502`: the provider's admin API failed.

Every change is logged with `audit: "organization-role-change"`, the caller, the member, and the old and new role.

| Variable                    | Default                 | Description                                                                                                                                                |
| --------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ORG_ADMIN_PROVIDER`        | _(unset: disabled)_     | `keycloak` or `auth0`.                                                                                                                                     |
| `ORG_ADMIN_URL`             | _(unset: disabled)_     | Keycloak base URL (`http://localhost:8080`) or Auth0 tenant URL (`https://<tenant>.<region>.auth0.com`).                                                   |
| `ORG_ADMIN_CLIENT_ID`       | _(unset: disabled)_     | The admin service account: `heka-identity-admin` in the shipped Keycloak realm, or the `heka-identity-admin` M2M application created by `setup-tenant.sh`. |
| `ORG_ADMIN_CLIENT_SECRET`   | _(unset: disabled)_     | Its secret. Production refuses `dev-only-…` secrets and secrets shorter than 16 characters.                                                                |
| `ORG_ADMIN_REALM`           | `heka-platform`         | Keycloak only.                                                                                                                                             |
| `ORG_ADMIN_ROLES_CLIENT_ID` | `heka-identity-service` | Keycloak only: the client that owns the Heka client roles.                                                                                                 |
| `ORG_ADMIN_DEFAULT_GROUP`   | `/heka-users`           | Keycloak only: the default group that grants `User`.                                                                                                       |
| `ORG_ADMIN_ORG_ID_FIELD`    | `heka_org_id`           | Organization attribute (Keycloak) or metadata field (Auth0) that holds the Heka organization id.                                                           |

The four required settings must be set together; a partial set is a startup error.

What the service account needs:

- **Keycloak:** the `realm-management` roles `manage-users`, `view-users`, `view-clients`, `query-groups` and `manage-realm`. Keycloak 26.0 only lets `manage-realm` read organizations and their members, which makes this a powerful account; its secret must stay with this service.
- **Auth0:** the Management API scopes `read:organizations`, `read:organization_members`, `read:organization_member_roles`, `create:organization_member_roles`, `delete:organization_member_roles`, `read:roles` and `read:users`. The admin API client retries `429 Too Many Requests`, because the Management API rate limits are low on small plans.

Both recipes create the account. Members without an organization in the provider (the `org_id` user attribute only) can't be managed this way: move them into the provider's Organizations first.

### Demo token broker

The web UI's public demo pages (Demo, Age verification) run without a signed-in user. Instead of a long-lived token baked into the web bundle, they call `GET /demo/token` on this service, which returns a short-lived access token of a dedicated **demo service account** obtained with an OAuth 2.0 Client Credentials grant from the OIDC provider above (`{ "access_token", "token_type": "Bearer", "expires_in" }`). The token is cached and re-acquired a minute before it expires, so the provider sees one grant per token lifetime however many browsers open the demo. The endpoint is optional: it answers `404` until all three required settings are present, and `502` when the provider does not issue a token.

| Variable                  | Default              | Description                                                                                                                                                                    |
| ------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DEMO_TOKEN_URL`          | _(unset: disabled)_  | Provider token endpoint, e.g. `http://localhost:8080/realms/heka-platform/protocol/openid-connect/token` or `https://<tenant>.<region>.auth0.com/oauth/token`.                 |
| `DEMO_CLIENT_ID`          | _(unset: disabled)_  | Confidential client with a service account that carries the demo tenant's claims: `heka-demo` in the shipped Keycloak realm, the `heka-demo` application's client id in Auth0. |
| `DEMO_CLIENT_SECRET`      | _(unset: disabled)_  | Its secret. Production refuses the dev secret of the shipped realm and secrets shorter than 16 characters.                                                                     |
| `DEMO_CLIENT_AUTH_METHOD` | `client_secret_post` | `client_secret_post` or `client_secret_basic`.                                                                                                                                 |
| `DEMO_TOKEN_PARAMS`       | _(none)_             | Extra form fields for the token request as a JSON object, e.g. `{"audience":"https://heka-identity"}` for Auth0.                                                               |
| `DEMO_TOKEN_RATE_LIMIT`   | `30`                 | Requests per minute per client IP accepted by `GET /demo/token` (`429` above it). Only this endpoint is rate-limited.                                                          |

Anyone can call the endpoint, as anyone could read the bundled token before, so keep the demo account on the minimum role it needs (`User` in both recipes; never `Admin`, which would hand every visitor the shared `Administration` wallet) and keep the provider's access-token lifetime for that client short (minutes). The three settings must be set together; a partial set is a startup error. Behind a reverse proxy set Express `trust proxy` so the rate limit sees client addresses rather than the proxy's.

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

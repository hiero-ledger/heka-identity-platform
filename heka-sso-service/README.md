# Heka SSO Service

## Description

"Sign in with wallet" OIDC bridge for the Heka Identity Platform. The service will act as a standard OIDC provider (built on `node-oidc-provider`) whose sole authentication method is a verifiable-credential presentation (OID4VP), verified by the [Heka Identity Service](../heka-identity-service). Customer IdPs (Keycloak first) broker logins to it via standard OIDC.

See [INTEGRATION.md](docs/INTEGRATION.md) for the design, platform decisions, and the phased implementation plan. The current state is the **Phase 0 scaffold**: platform component skeleton (config, logging, health, database/migrations, Docker, CI) — the OP core, adapter, and wallet-login interaction land in Phase 1.

This service is deliberately separate from [heka-auth-service](../heka-auth-service) (login/password JWT issuance, unchanged): no shared code, database tables, or keys — see INTEGRATION.md §4.5.

## Quick Start

1. Start a local Postgres compatible with the service defaults:

   ```bash
   docker run --name heka-sso-service-postgres \
     -e POSTGRES_DB=heka-sso-service \
     -e POSTGRES_USER=heka \
     -e POSTGRES_PASSWORD=heka1 \
     -p 5434:5432 -d postgres
   ```

2. Enable Corepack so the pinned Yarn 4 runs, then install dependencies. The repo pins `yarn@4.16.0` in `package.json`; without Corepack the system Yarn 1.x may run instead and produce unexpected lockfile behavior:

   ```bash
   corepack enable
   yarn install
   ```

3. (Optional) Create a `.env` file in `env/` to override any defaults — see [Configuration](#configuration) for the available variables.

4. Run database migrations:

   ```bash
   yarn migration:up
   ```

5. Start the service:

   ```bash
   yarn start
   ```

6. Verify by opening Swagger UI at <http://localhost:3005/api/docs>.

## API

The service listens on port `3005` by default. The whole service is the OIDC provider: the `node-oidc-provider` instance is mounted at the app root and owns every path except the Nest-served ones below.

- **OIDC provider** (app root) — discovery at `/.well-known/openid-configuration`, `/authorize`, `/token`, `/jwks` (public halves of the persisted signing keys), `/userinfo`. Client registration and the wallet-login interaction land with the remaining Phase 1 PRs — see [INTEGRATION.md](docs/INTEGRATION.md) §6. Until the MikroORM adapter PR, provider state (sessions, codes) is in-memory.
- **Health** (`/health`, Nest/Terminus) — memory + database health probe for use as a Kubernetes readiness/liveness check or a Compose healthcheck.
- **Swagger UI** (`/api/docs`, Nest).

Behind a reverse proxy the public `Host` header must be forwarded (`provider.proxy = true` trusts `X-Forwarded-*`): discovery endpoint URLs are derived from it.

## Configuration

The service is configured via environment variables. Values can be set in `env/.env` (or `env/.env.<NODE_ENV>`).

### Application

| Variable            | Default                       | Description                                   |
|---------------------|-------------------------------|-----------------------------------------------|
| `APP_NAME`          | `Heka SSO Service`            | Application name surfaced in metadata.        |
| `APP_VERSION`       | _(reads from `package.json`)_ | Application version surfaced in metadata.     |
| `APP_PORT`          | `3005`                        | HTTP port the service binds to.               |
| `APP_PREFIX`        | `api`                         | URL prefix for the REST API.                  |
| `APP_ENABLE_CORS`   | `false`                       | Set to `true` to enable CORS handling.        |
| `APP_ALLOW_ORIGINS` | `*`                           | Comma-separated list of allowed CORS origins. |

### Database (PostgreSQL)

| Variable      | Default            | Description                                                   |
|---------------|--------------------|---------------------------------------------------------------|
| `DB_HOST`     | `localhost`        | Database host.                                                |
| `DB_PORT`     | `5434`             | Database port.                                                |
| `DB_NAME`     | `heka-sso-service` | Database name.                                                |
| `DB_USER`     | `heka`             | Database user.                                                |
| `DB_PASSWORD` | `heka1`            | Database password. **Replace in any non-trivial deployment.** |

### OIDC provider

Secrets in this section have **no compiled-in defaults** (see [INTEGRATION.md](docs/INTEGRATION.md) §5-Decide-4). In **production** (`NODE_ENV=production`) the service **fails fast at startup** when they are unset, too weak, or equal to one of the known dev-default values shipped in `env/.env` / docker-compose. Outside production, unset secrets are generated fresh on every start (sessions and derived `sub` values then do not survive a restart — set explicit dev values when that matters).

| Variable                       | Default                       | Description                                                                                 |
|--------------------------------|-------------------------------|---------------------------------------------------------------------------------------------|
| `OIDC_ISSUER_URL`              | `http://localhost:3005` (dev) | Public issuer URL of the OP. **Required in production.**                                    |
| `OIDC_COOKIE_KEYS`             | _(generated in dev)_          | Comma-separated cookie signing keys (≥ 16 chars each). **Secret — required in production.** |
| `OIDC_SUB_HMAC_SALT`           | _(generated in dev)_          | Salt for the `derived` pairwise `sub` strategy (≥ 32 chars). **Secret — required in production.** |
| `IDENTITY_SERVICE_BASE_URL`    | `http://localhost:3000` (dev) | Base URL of heka-identity-service's verification-session API. **Required in production.**   |
| `IDENTITY_SERVICE_AUTH_TOKEN`  | _(unset)_                     | Credential for the identity-service API. **Secret.**                                        |
| `OIDC_TTL_ACCESS_TOKEN`        | `3600`                        | Access-token lifetime in seconds.                                                           |
| `OIDC_TTL_AUTHORIZATION_CODE`  | `60`                          | Authorization-code lifetime in seconds.                                                     |
| `OIDC_TTL_ID_TOKEN`            | `3600`                        | ID-token lifetime in seconds.                                                               |
| `OIDC_TTL_INTERACTION`         | `600`                         | Interaction (wallet-login page) lifetime in seconds.                                        |
| `OIDC_TTL_SESSION`             | `86400`                       | OP session lifetime in seconds.                                                             |
| `OIDC_TTL_GRANT`               | `86400`                       | Grant lifetime in seconds.                                                                  |
| `OIDC_CLOCK_TOLERANCE`         | `15`                          | Accepted clock skew (seconds) when validating incoming JWTs — brokering IdPs like Keycloak default to 0s tolerance on their side, so the bridge carries the slack. |
| `OIDC_CLIENTS`                 | `[]`                          | Static OIDC clients (MVP), JSON array — see below.                                          |
| `OIDC_LOGIN_CONFIGS`           | `[]`                          | Static login configurations (MVP), JSON array — see below.                                  |
| `OIDC_JWKS`                    | _(unset — keys from Postgres)_ | Inline JWKS override (JSON), intended for dev/test. **Secret.**                            |
| `OIDC_JWKS_FILE`               | _(unset)_                     | Path to a JWKS file override, intended for dev/test. **Secret.**                            |
| `OIDC_STUB_LOGIN`              | `false`                       | Dev-only stub login (see below). **Refused in production.**                                 |

#### Protocol policy

The OP speaks the IdP-broker common denominator (INTEGRATION.md §1) and nothing more:

- **Authorization code flow only** — `response_types_supported` is `["code"]`; no implicit or hybrid flows.
- **PKCE**: **S256 is the only accepted `code_challenge_method`**. The requirement is currently relaxed (`pkce.required` → false) because Keycloak's identity-provider config does not send PKCE unless explicitly enabled — to be re-tightened once the demo realm (P1.7) pins PKCE S256 on the IdP side.
- **Client authentication**: `client_secret_basic` and `client_secret_post`. The two are interchangeable presentations of the same registered secret (the Cognito/Entra floor); no JWT-based or unauthenticated clients.

`OIDC_CLIENTS` — JSON array of static clients (IdP brokers). `grantTypes`, `responseTypes`, and `tokenEndpointAuthMethod` (`client_secret_basic` or `client_secret_post`) are optional; client secrets must be ≥ 16 chars in production:

```json
[{
  "clientId": "keycloak-broker",
  "clientSecret": "<strong secret>",
  "redirectUris": ["https://kc.example.com/realms/myrealm/broker/heka-sso/endpoint"],
  "postLogoutRedirectUris": ["https://kc.example.com/realms/myrealm/broker/heka-sso/endpoint/logout_response"],
  "loginConfigId": "default"
}]
```

`OIDC_LOGIN_CONFIGS` — JSON array of declarative login configurations (INTEGRATION.md §4.2): which credentials to ask for, how disclosed claims map to OIDC claims, the `sub` strategy (`derived` default, `credential-claim`, `ephemeral`), and the trusted credential issuers:

```json
[{
  "id": "default",
  "verificationTemplate": "default",
  "claimMapping": { "pid.given_name": "given_name", "pid.family_name": "family_name" },
  "subStrategy": "derived",
  "issuerAllowlist": []
}]
```

#### Stub login (dev only)

With `OIDC_STUB_LOGIN=true`, the wallet-login interaction at `/interaction/:uid` completes **immediately, without any credential verification** (INTEGRATION.md P1.3): a fixed dev identity is pushed through the real claims pipeline (claim mapping, `derived` `sub` computation, claim-set storage), so the full broker loop — RP → Keycloak → bridge → back — runs end-to-end before the OID4VP wallet integration lands (P1.6). Stub logins carry `amr: ["stub"]` (never `["vc"]`) so brokered tokens can't be mistaken for verified presentations. The flag is **refused at startup in production**, like the dev-default secrets. When the flag is off and no other acquisition method is available, logins are denied with `access_denied`.

#### Signing keys (JWKS)

The OP signs tokens with asymmetric keys (**RS256 + ES256**). Key material lives in the `oidc_signing_key` Postgres table: on first start the service generates one 2048-bit RSA key and one P-256 EC key and persists them (`kid` = RFC 7638 JWK thumbprint). The published JWKS contains all non-retired keys, **newest first per algorithm — the newest key signs**.

For dev/test, `OIDC_JWKS` (inline JSON) or `OIDC_JWKS_FILE` (path) overrides the database entirely. In production an override is refused when any key is a known default (e.g. node-oidc-provider's `keystore-CHANGE-ME` dev keystore), lacks private material, uses an RSA modulus below 2048 bits, or a non-NIST EC curve. Never commit key material to the repository.

#### Key rotation

IdPs cache the JWKS, so rotation must overlap — never swap keys abruptly (an abrupt swap invalidates in-flight logins until the IdP refreshes its cache):

1. **Publish a new key** (`SigningKeysService.rotateKey(alg)`): the new key is added and immediately becomes the signing key; the old key stays published so cached tokens still verify.
2. **Wait out the IdP JWKS cache window** (Keycloak's default public-key cache TTL is ~24 h; check your IdP).
3. **Retire the old key** (`SigningKeysService.retireKey(kid)`, or SQL: `update oidc_signing_key set retired_at = now() where kid = '<old-kid>'`): it disappears from the JWKS.

Until the Phase 2 admin API exposes these operations, rotation is performed via the service methods or SQL. Retired keys stay in the table for audit; they are never republished.

### Logging

| Variable            | Default                                                                                                            | Description                                                           |
|---------------------|--------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------|
| `LOG_LEVEL`         | `info`                                                                                                             | Log level. One of `trace`, `debug`, `info`, `warn`, `error`, `fatal`. |
| `LOG_EXCLUDE_URLS`  | _(unset — none excluded)_                                                                                          | Comma-separated list of URL paths to exclude from request logging.    |
| `LOG_REDACT_FIELDS` | `db.host,db.user,db.password,oidc.cookieKeys,oidc.subHmacSalt,oidc.identityService.authToken,oidc.clients[*].clientSecret` | Comma-separated list of dotted field paths redacted from log output.  |

### Throttling

Applies to Nest controllers only (see INTEGRATION.md §5 — provider endpoints get rate limits at the reverse proxy):

| Variable         | Default | Description                                 |
|------------------|---------|---------------------------------------------|
| `THROTTLE_TTL`   | `60000` | Throttle window in milliseconds.            |
| `THROTTLE_LIMIT` | `100`   | Maximum number of requests per window.      |

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

# List applied migrations
yarn migration:list

# List pending migrations
yarn migration:pending

# Generate a new migration as a diff between current DB and updated model
yarn migration:create
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

## Testing

### Unit tests

```bash
yarn test
```

### E2E tests

E2E tests require a running Postgres instance. The quickest way is to reuse the container from [Quick Start](#quick-start):

```bash
docker run --name heka-sso-service-postgres \
  -e POSTGRES_DB=heka-sso-service \
  -e POSTGRES_USER=heka \
  -e POSTGRES_PASSWORD=heka1 \
  -p 5434:5432 -d postgres
```

Since the Quick Start container maps to host port `5434`, override the default when running tests locally:

```bash
MIKRO_ORM_HOST=127.0.0.1 MIKRO_ORM_PORT=5434 yarn test
```

If your Postgres is on the standard port `5432`, no override is needed:

```bash
yarn test
```

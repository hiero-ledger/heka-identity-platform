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

| Claim         | Required | Description                                                                                                                                                      |
| ------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sub`         | Yes      | Stable user identifier. Used to provision and look up the user record.                                                                                           |
| `roles`       | Yes      | Array of role strings. The first entry is taken as the primary role. Valid values: `Admin`, `OrgAdmin`, `OrgManager`, `OrgMember`, `Issuer`, `Verifier`, `User`. |
| `name`        | Yes      | User-facing display name; also used as the wallet label on first sight.                                                                                          |
| `org_id`      | No       | Optional organization identifier. Required when issuing org-scoped credentials.                                                                                  |
| `iss` / `aud` | Yes      | Standard JWT claims; must match `JWT_VERIFY_OPTIONS_ISSUER` / `_AUDIENCE`.                                                                                       |

The `tenantId` is **not** a JWT claim — it is derived internally from `(role, sub, org_id)` on first request and persisted with the auto-provisioned wallet. See [Concepts and Glossary — Multi-Tenancy](concepts.md#multi-tenancy).

### Ledger / DID methods

| Variable      | Default               | Description                                                                                                |
| ------------- | --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `DID_METHODS` | `indy,key,jwk,hedera` | Comma-separated list of enabled DID methods. Supported values: `key`, `jwk`, `indy`, `hedera`, `indybesu`. |

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

Each tenant provisions its own mdoc issuer PKI through `POST /mdoc-issuers`: a self-signed IACA (published on the scheme trust list) that signs short-lived Document Signer Certificates. The service-wide variables below are the defaults a tenant may override per request (`profile`, `organizationIdentifier`, `certificatePolicyOid`, `country`, `authorityName`, `docType`, `validityDays`):

| Variable                              | Default                 | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MDOC_ISSUER_COUNTRY`                 | `US`                    | ISO 3166-1 alpha-2 country of the IACA subject and of the trust-list entry.                                                                                                                                                                                                                                                                                                                                                                                                 |
| `MDOC_ISSUER_AUTHORITY`               | `Heka`                  | Issuing authority name (IACA subject `O`; also the default scheme-operator name of the trust lists).                                                                                                                                                                                                                                                                                                                                                                        |
| `MDOC_DEFAULT_DOCTYPE`                | `org.iso.18013.5.1.mDL` | Default mdoc `docType` a tenant IACA is authoritative for.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `MDOC_ISSUER_PROFILE`                 | `mdl`                   | IACA / DSC certificate profile: `mdl` (ISO 18013-5 / AAMVA, US), `mdl-eu` (mDL under the EU profile), `eudi-pid` (ETSI TS 119 412-6 PID Provider sign/seal certificate) or `eudi-eaa` (non-qualified EAA Provider certificate). EU profiles emit the EN 319 412-3 legal-person DN, `certificatePolicies`, an AIA `caIssuers` pointer to `GET /mdoc-issuers/certificates/{fingerprint}` and, for `eudi-pid`, the `id-etsi-qct-pid` QcType. An unknown name refuses to start. |
| `MDOC_ISSUER_ORGANIZATION_IDENTIFIER` | _(unset)_               | EN 319 412-1 `organizationIdentifier` of the issuing legal person (e.g. `VATDE-0123456789`, `NTRDE-…`, `LEIXG-…`). **Required for EU profiles**; provisioning fails without it. In a multi-tenant deployment every tenant should pass its own value in the provisioning request.                                                                                                                                                                                            |
| `MDOC_ISSUER_CERTIFICATE_POLICY_OID`  | _(unset)_               | The operator's certificate-policy OID carried in `certificatePolicies` of every EU DSC (EN 319 412-2 §4.3.3). **Required for EU profiles**; provisioning fails without it.                                                                                                                                                                                                                                                                                                  |
| `MDL_ISSUER_CERTIFICATE`              | _(dev cert)_            | **Verification fallback only.** The legacy service-wide mDL issuer certificate the service still trusts when it verifies mdocs in its relying-party role; new mdocs are signed with the tenant DSC, never with this certificate. **Replace or unset for non-trivial use.**                                                                                                                                                                                                  |
| `MDL_ISSUER_PRIVATE_KEY`              | _(dev key)_             | JSON-encoded JWK private key matching `MDL_ISSUER_CERTIFICATE`. Kept only so that key still exists in the service key store; it signs no new credentials. **Replace or unset for non-trivial use.**                                                                                                                                                                                                                                                                         |
| `VICAL_ENABLED`                       | `false`                 | Publish the ISO 18013-5 VICAL at `GET /vical` for readers that import VICALs (Multipaz and similar). Off by default: wallets and verifiers learn the same tenant issuer anchors from the scheme trust lists at `GET /trust-list/eaa-providers` / `GET /trust-list/wrpac-providers`. While off, `/vical` answers 404 and no VICAL signer is provisioned.                                                                                                                     |

### X.509 request signing and SD-JWT VC issuer certificates

Tenants provision X.509 request-signing identities through `POST /x509/signers` (OpenID4VP `x509_hash` / `x509_san_dns` client id schemes) and, for HAIP-style SD-JWT VC issuance, receive an issuer certificate under the service-wide root CA. Certificate validity requested through the API is bounded (1 day up to 10 years, and never beyond the root CA's own lifetime for root-signed leaves).

| Variable                            | Default      | Description                                                                                                                                                                                                                                                                                                      |
| ----------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X509_SAN_DNS_MODE`                 | `private_ca` | How `x509_san_dns` request-signing certificates are provisioned: `private_ca` issues leaves under the service-wide root CA; `csr` defers to an external CA through `POST /x509/signers/csr` and `POST /x509/signers/import` (the imported certificate must certify the CSR key). Unknown values refuse to start. |
| `SD_JWT_VC_ISSUER_DOMAIN`           | _(unset)_    | FQDN of the HAIP SD-JWT VC issuer: the per-tenant issuer certificate carries it as a dNSName SAN and the credential `iss` is `https://<domain>`. Required only for credential offers with `issuerMode: "x5c"`.                                                                                                   |
| `OID4VCI_SIGNED_METADATA_ENABLED`   | `false`      | Publish an OID4VCI `signed_metadata` JWT (with an `x5c` chain to the service root) in the credential-issuer metadata so wallets can authenticate the issuer at issuance.                                                                                                                                         |
| `OID4VCI_ACCESS_CERTIFICATE_DOMAIN` | _(unset)_    | CN and dNSName SAN of the issuer access certificate that signs the metadata (HAIP `iss`-host binding). Empty = default CN, no SAN.                                                                                                                                                                               |

### Trust lists and verifier trust anchors

The service publishes **Heka scheme trust lists** (ETSI TS 119 602 LoTE JWTs at `GET /trust-list`, `GET /trust-list/eaa-providers`, `GET /trust-list/wrpac-providers`) carrying every tenant's issuer certificates, and, in its own relying-party role, verifies credentials against a configurable union of anchor sources. Nothing learned from an upstream (EU) list is ever republished.

Upstream lists are fetched in the background with a 15 s timeout and a size cap (20 MB per TS 119 612 XML, 5 MB per LoTE), at most four national lists at a time. A list is used only if its signature verifies against the pinned signer, it is not past its `NextUpdate` (5 minutes of grace) and its sequence number has not regressed below the last accepted one; a rejected list leaves the previously accepted anchors in place.

| Variable                          | Default                     | Description                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TRUST_LIST_SCHEME_OPERATOR`      | _(`MDOC_ISSUER_AUTHORITY`)_ | Scheme-operator name stated in the published lists.                                                                                                                                                                                                                                                                                                                                                                           |
| `TRUST_LIST_PARTNER_CERTIFICATES` | _(unset)_                   | Operator-curated partner issuer anchors (PEM blocks, or comma/whitespace-separated base64 DER). Listed in `eaa-providers` and used by the `config` verifier source.                                                                                                                                                                                                                                                           |
| `TRUST_LIST_POINTERS`             | _(unset)_                   | JSON array `[{ "location", "signerCertificates": ["<base64 DER>"], "loteType"?, "schemeOperatorName"? }]` of external lists advertised in the `GET /trust-list` index (for example the Commission LoTEs with their OJEU-published signers). An invalid entry refuses to start.                                                                                                                                                |
| `VERIFIER_TRUST_SOURCES`          | `registry,config`           | Anchor sources the service trusts when **it** verifies credentials: `registry` (every tenant's own issuer certificates — every tenant of the scheme is a trusted issuer for every Heka verifier), `config` (`TRUST_LIST_PARTNER_CERTIFICATES`), `lotl` (EU List of Trusted Lists), `lote` (EU Lists of Trusted Entities). `lotl` and `lote` require their URL and signer variables below; an unknown source refuses to start. |
| `VERIFIER_TRUST_REFRESH_SECONDS`  | `3600`                      | Background refresh interval of the `lotl` / `lote` sources. Lists are never fetched inside a verification; on failure the last good snapshot is kept.                                                                                                                                                                                                                                                                         |
| `EU_LOTL_URL`                     | _(unset)_                   | URL of the EU List of Trusted Lists (ETSI TS 119 612 XML). Required with `lotl`.                                                                                                                                                                                                                                                                                                                                              |
| `EU_LOTL_SIGNER_CERTIFICATES`     | _(unset)_                   | The Commission's LoTL signer certificate(s) (OJEU-published; PEM or base64 DER). The LoTL's XML signature must verify with one of these keys; each national list is then verified with the signer the LoTL declares for it. Required with `lotl`.                                                                                                                                                                             |
| `EU_LOTL_SCHEME_TERRITORIES`      | _(unset — all)_             | Comma-separated Member-State codes to traverse, e.g. `DE,FR`.                                                                                                                                                                                                                                                                                                                                                                 |
| `EU_TRUSTED_LIST_SERVICE_TYPES`   | _(unset — the issuer set)_  | Optional **narrowing** of the TS 119 612 service types whose certificates become issuer anchors. Default and maximum: `http://uri.etsi.org/TrstSvc/Svctype/CA/QC`, `…/Svctype/EAA/Q`, `…/Svctype/EAA/Pub-EAA`. Only members of that set may be listed — time-stamping, QWAC/QSeal, validation and other listed services can never be widened in; a non-issuer value refuses to start.                                         |
| `EU_LOTE_URLS`                    | _(unset)_                   | Comma-separated URLs of TS 119 602 LoTE JWTs (PID / PuB-EAA / EAA providers). Required with `lote`.                                                                                                                                                                                                                                                                                                                           |
| `EU_LOTE_SIGNER_CERTIFICATES`     | _(unset)_                   | Pinned list-signer certificate(s) the `x5c` leaf of every LoTE must match byte for byte. Required with `lote`.                                                                                                                                                                                                                                                                                                                |
| `EU_LOTE_SERVICE_TYPES`           | _(unset — the issuer set)_  | Optional **narrowing** of the TS 119 602 service types. Default and maximum: `http://uri.etsi.org/19602/SvcType/EAA/Issuance`, `…/SvcType/PID/Issuance`, `…/SvcType/PubEAA/Issuance`; wallet-provider, registrar and WRPAC access-certificate services can never be widened in; a non-issuer value refuses to start.                                                                                                          |

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

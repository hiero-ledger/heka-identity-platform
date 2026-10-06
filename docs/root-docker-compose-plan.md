# Root Docker Compose for the Heka Identity Platform

Status: plan, 2026-09-30, revised 2026-10-01. Progress is tracked in the Status column of section 10; all steps are implemented; steps 3 to 8 await review.

## 1. Goal

One `docker compose up` at the repository root that runs the four web-facing components together:

| Component                        | Host port   | Notes                                                        |
| -------------------------------- | ----------- | ------------------------------------------------------------ |
| heka-identity-service            | 3000-3003   | REST API (3000), DIDComm (3001 http, 3002 ws), OID4VC (3003) |
| heka-identity-service-web-ui     | 8000        | Static bundle served by nginx                                |
| heka-sso-service                 | 3005        | OIDC bridge                                                  |
| heka-sso-web-ui                  | 5173        | Static bundle served by nginx                                |
| postgres                         | 5432        | One instance, two databases                                  |
| keycloak (optional, `keycloak` profile) | 8080 | Dev IdP with the three shipped realms                        |

The OIDC provider is deliberately **not** a hard part of the stack. It runs either as an optional Compose profile (Keycloak) or entirely outside Compose (Auth0). The root project is provider-neutral and takes every provider-specific value from a root `.env`.

Each backend package keeps exactly one Compose file for running that service alone against the rest of the platform on the host; the current `docker-compose.dev.yml` files are merged into them and removed, and Keycloak moves to the root project. Section 13 has the rule and the migration.

## 2. Decisions

1. **Host ports do not change.** The committed realms hard-code browser URLs: `http://localhost:8000` for the identity web UI client in `heka-sso-service/keycloak/realm-heka-platform.json` and `http://localhost:5173` for the SSO web UI client in `realm-heka.json`. Publishing the same ports keeps every redirect URI, web origin and issuer valid without touching the realm files or the Auth0 recipe.
2. **Browser-facing URLs stay `localhost`, provider calls go through the host gateway.** The token `iss` is the browser-facing Keycloak URL (`KC_HOSTNAME`), and Auth0 is a public host. Every server-to-provider call therefore uses `host.docker.internal:8080` (Keycloak) or the public Auth0 URL, never a Compose service name. This is the pattern the identity service dev Compose and the SSO production Compose already use, and it works identically whether Keycloak runs in the `keycloak` profile, in the SSO package's Compose project, or not at all.
3. **Service-to-service calls inside the project use service names.** The SSO service reaches the identity service at `http://heka-identity-service:3000`. Nothing else in the project calls a sibling container.
4. **No `depends_on` on Keycloak.** A service without a profile cannot depend on a profiled service. Both backends fetch the JWKS and service-account tokens lazily on first use, so the provider only needs to be up before the first authenticated request.
5. **One Postgres.** An init script creates the second database. The identity service's Askar wallet databases are created by the service itself under the same superuser, as today.
6. **Web UIs are static bundles behind nginx.** Both apps bake their configuration into the bundle at build time (dotenv-webpack and `import.meta.env`), so provider values are Docker build args. Changing them means `docker compose up -d --build <ui>`.
7. **Two values are only known after first boot** and are read from the root `.env`: the demo tenant DID for the identity web UI, and the verifier id plus request signer DID for the SSO service. The SSO service falls back to the dev stub login until they are set. See section 7.
8. **Two IdP roles, no provider defaults in Compose.** The platform IdP (identity service, identity web UI, SSO service account) and the demo relying-party IdP (SSO web UI, broker) are switched independently between Keycloak and Auth0. All provider values live in the root `.env`, whose example file has a Keycloak section (active) and an Auth0 section (commented out); the Compose file declares provider values as required so a missing one fails by name instead of silently using the other provider. See section 5.
9. **The directory decides the scope, one Compose file per directory.** The root file runs the platform and is the only place Keycloak is defined. A package's file runs that one service plus its own Postgres, with everything else on the host. The per-package `docker-compose.dev.yml` files are merged into the package `docker-compose.yml` and deleted. See section 13.

## 3. Files to add

```
docker-compose.yml                              root project (name: heka), no provider-specific defaults
.env.example                                    root variables: section 1 Keycloak (active), section 2 Auth0 (commented), section 3 shared
docker/postgres/init-databases.sh               creates heka-sso-service next to heka-identity-service
docker/nginx/spa.conf                           shared nginx config: listen 80, SPA fallback
docker/keycloak/prepare-realms.sh               copies the realm files into a volume, rewrites the heka-sso broker issuer (section 9.2)
heka-sso-service/env/oidc-login-configs.json    bridge login configuration, mounted by the root and the package Compose (section 5.3)
heka-sso-service/env/oidc-clients.example.json  bridge broker clients template; copied to the gitignored env/oidc-clients.json on first boot
heka-identity-service-web-ui/Dockerfile         node:22 build stage + nginx:alpine
heka-identity-service-web-ui/.dockerignore      node_modules, build, .env
heka-sso-web-ui/Dockerfile                      node:22 build stage + nginx:alpine
heka-sso-web-ui/.dockerignore                   node_modules, dist, .env
docs/root-docker-compose.md                     usage guide (sections 7 to 9 of this plan, starting with the quick start in 7.1)
```

Files to edit: root `README.md` (Getting Started: mention the root Compose), `heka-sso-service/README.md` (Docker section: point at the root project for the full stack), `.gitignore` (root `.env`; `heka-sso-service/env/oidc-clients.json` next to the already ignored `env/.env`).

Preparatory change in another package: `heka-sso-service` gains `OIDC_CLIENTS_FILE` and `OIDC_LOGIN_CONFIGS_FILE` (section 5.3), shipped as its own PR before the root Compose.

## 4. Service specification

### 4.1 postgres

- Image `postgres:15`, `shm_size: 256m`, port `5432:5432`.
- `POSTGRES_USER=heka`, `POSTGRES_PASSWORD=heka1`, `POSTGRES_DB=heka-identity-service`.
- Mount `docker/postgres/init-databases.sh` into `/docker-entrypoint-initdb.d/`. It runs `CREATE DATABASE "heka-sso-service"` with `psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER"`. Init scripts run only on an empty data directory; document that a changed script needs `docker compose down -v`.
- Healthcheck `pg_isready -d heka-identity-service -U heka`, as in the identity dev Compose.
- Named volume `postgres-data` so the wallet keys and migrations survive restarts. The per-package files do not persist data today; persisting here is deliberate because the bootstrap values of section 7 are tied to database content.

### 4.2 heka-identity-service

Build context `./heka-identity-service`, existing Dockerfile. Environment, using the **same variable names as the package `.env`** so a value means the same thing in `yarn start` and in Compose:

| Variable                               | Value                                                                                         |
| -------------------------------------- | --------------------------------------------------------------------------------------------- |
| `MIKRO_ORM_HOST`, `WALLET_POSTGRES_HOST` | `postgres`                                                                                  |
| `EXPRESS_PORT`                         | `3000`                                                                                        |
| `EXPRESS_ENABLE_CORS`                  | `true`                                                                                        |
| `EXPRESS_CORS_OPTIONS`                 | `{"origin":["http://localhost:8000","http://localhost:5173"],"credentials":true}`             |
| `OIDC_ISSUER_URL`                      | `${OIDC_ISSUER_URL:?platform IdP issuer, see .env.example section 1.[P] or 2.[P]}`           |
| `OIDC_JWKS_URI`                        | `${OIDC_JWKS_URI:-}` (Keycloak: host-gateway certs URL from `.env`; Auth0: empty, discovery)  |
| `OIDC_AUDIENCE`                        | `${OIDC_AUDIENCE:?platform IdP audience}`                                                     |
| `OIDC_CLAIM_USER_ID`, `OIDC_CLAIM_ROLES`, `OIDC_CLAIM_NAME`, `OIDC_CLAIM_ORG_ID` | `${VAR:-}` pass-through (empty means service default) |
| `DEMO_TOKEN_URL`, `DEMO_CLIENT_ID`, `DEMO_CLIENT_SECRET` | `${VAR:-}` pass-through; the broker is off when all three are empty         |
| `DEMO_TOKEN_PARAMS`, `DEMO_CLIENT_AUTH_METHOD`, `DEMO_TOKEN_RATE_LIMIT` | `${VAR:-}` pass-through                                     |
| `AGENT_HTTP_ENDPOINT`, `AGENT_WS_ENDPOINT` | `${AGENT_HTTP_ENDPOINT:-http://localhost:3001}`, `${AGENT_WS_ENDPOINT:-ws://localhost:3002}` |
| `AGENT_OID4VCI_ENDPOINT`               | `${AGENT_OID4VCI_ENDPOINT:-http://localhost:3003}`                                            |
| `FILE_STORAGE_FS_URL`                  | `${FILE_STORAGE_FS_URL:-http://localhost:3000}`                                               |
| `FILE_STORAGE_FS_PUBLIC_URL`           | `${FILE_STORAGE_FS_PUBLIC_URL:-}`                                                             |

Provider values (`OIDC_*`, `DEMO_*`) have no Keycloak default here on purpose (decision 8).

Found while verifying step 3: the image failed in `yarn migration:up` with "Bad @mikro-orm/decorators version 7.2.2 ... same version as @mikro-orm/core (7.1.3)", and `yarn migration:pending` failed the same way on the host. The package pinned `@mikro-orm/cli` to exactly 7.1.3 while the runtime packages float with `^7.1.3` and were locked at 7.2.2, so the CLI carried its own nested core. Fix applied in `heka-identity-service/package.json` and `yarn.lock`: the CLI is pinned to the locked runtime version, 7.2.2. The exact pin is deliberate, a caret pulled the CLI to 7.2.3 and recreated the mismatch; whoever bumps the MikroORM runtime must bump the CLI pin with it. Provider-independent values (agent endpoints, file URLs) keep a `localhost` default.
| `WEBHOOK_ALLOW_HTTP`, `WEBHOOK_ALLOW_PRIVATE_ADDRESSES`, `WEBHOOK_HTTP_TIMEOUT_MS` | pass-through with the dev Compose defaults          |

Also: `extra_hosts: host.docker.internal:host-gateway`, ports 3000 to 3003, the existing curl healthcheck on `/health`, `depends_on: postgres: condition: service_healthy`.

Two things the current package dev Compose gets wrong and the root file must not copy:

- It maps `AGENT_HTTP_ENDPOINT` from a variable named `AGENT_HTTP_EP`, so the value in `.env` never reaches the container. Use the `.env` names.
- It does not forward the `OIDC_CLAIM_*` variables at all and defaults `OIDC_JWKS_URI` to Keycloak, which makes Auth0 impossible in Docker. The pass-through rows above fix that; the Auth0 block in section 8 sets `OIDC_JWKS_URI=` (empty) to fall back to discovery.

### 4.3 heka-sso-service

Build context `./heka-sso-service`, existing Dockerfile (build arg `NODE_ENV=development` so the dev secrets are accepted).

| Variable                                | Value                                                                                     |
| --------------------------------------- | ----------------------------------------------------------------------------------------- |
| `NODE_ENV`                              | `development`                                                                             |
| `APP_PORT`, `APP_ENABLE_CORS`           | `3005`, `true`                                                                            |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | `postgres`, `5432`, `heka-sso-service`, `heka`, `heka1`                 |
| `OIDC_ISSUER_URL`                       | `${SSO_ISSUER_URL:?bridge issuer, see .env.example section 1.[R] or 2.[R]}` (browser-facing or tunnel; the broker validates it) |
| `OIDC_COOKIE_KEYS`, `OIDC_SUB_HMAC_SALT` | the dev-only values from the package Compose                                             |
| `IDENTITY_SERVICE_BASE_URL`             | `http://heka-identity-service:3000`                                                       |
| `IDENTITY_SERVICE_TOKEN_URL`            | `${IDENTITY_SERVICE_TOKEN_URL:?platform IdP token endpoint for the bridge's service account}` |
| `IDENTITY_SERVICE_CLIENT_ID`, `IDENTITY_SERVICE_CLIENT_SECRET` | `${VAR:?...}` required, from the `[P]` block of `.env`                      |
| `IDENTITY_SERVICE_TOKEN_PARAMS`, `IDENTITY_SERVICE_CLIENT_AUTH_METHOD` | `${VAR:-}` pass-through (Auth0 needs the audience param) |
| `IDENTITY_SERVICE_PUBLIC_VERIFIER_ID`, `IDENTITY_SERVICE_REQUEST_SIGNER_DID` | `${VAR:-}` pass-through                             |
| `OIDC_STUB_LOGIN`                       | `${OIDC_STUB_LOGIN:-true}`                                                                |
| `OIDC_ALLOW_PRIVATE_NETWORK_CALLS`      | `true` (back-channel logout to the host gateway is a private address)                     |
| `OIDC_CLIENTS_FILE`                     | `/run/config/oidc-clients.json`, mounted from `./heka-sso-service/env/oidc-clients.json` (gitignored, credentials; section 5.3) |
| `OIDC_LOGIN_CONFIGS_FILE`               | `/run/config/oidc-login-configs.json`, mounted from `./heka-sso-service/env/oidc-login-configs.json` (committed) |

Also: `extra_hosts` host gateway, port `3005:3005`, the existing curl healthcheck, `depends_on: postgres` (healthy) and `heka-identity-service` (healthy).

`OIDC_CLIENTS` and `OIDC_LOGIN_CONFIGS` are JSON arrays and do not belong in Compose interpolation (a `}` inside a `${VAR:-default}` ends the default) nor in the root `.env`. The root project supplies them as files through two new `_FILE` variables that the SSO service gains in a small preparatory change (section 5.3). Both files are bind-mounted read-only under `/run/config`, the same path shape a production deployment gets from Docker secrets.

### 4.4 heka-identity-web-ui

Build context `./heka-identity-service-web-ui`, new Dockerfile:

```
FROM node:22-bookworm AS build
WORKDIR /app
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn
RUN yarn install --immutable
COPY . .
ARG REACT_APP_AGENCY_ENDPOINT REACT_APP_AUTH_PROVIDER REACT_APP_OIDC_AUTHORITY \
    REACT_APP_OIDC_CLIENT_ID REACT_APP_OIDC_AUDIENCE REACT_APP_OIDC_SCOPE \
    REACT_APP_AUTH_ACCOUNT_URL REACT_APP_DEMO_USER_DID
# dotenv-webpack reads only the .env file (systemvars is off), so materialise the args
RUN env | grep '^REACT_APP_' > .env && yarn build:prod

FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
COPY docker/nginx/spa.conf /etc/nginx/conf.d/default.conf
```

The nginx config copy needs the file inside the build context; either duplicate `spa.conf` into each package or use `additional_contexts` (Compose 2.17+) to reference `docker/nginx`. Prefer `additional_contexts`, the installed Compose is 2.40.

Implemented (step 2): the committed `heka-identity-service-web-ui/Dockerfile` follows this sketch with three additions: it copies `.yarn/plugins` as well, sets `HUSKY=0` because the package's `prepare` script runs husky and there is no git inside the build, and writes only non-empty `REACT_APP_*` args into `.env` so an empty arg behaves like an unset variable. A `# check=skip=SecretsUsedInArgOrEnv` directive silences BuildKit's heuristic that flags any arg named with `AUTH`. Standalone build: `docker build --build-context nginxconf=../docker/nginx -t heka-identity-web-ui .`

Found while verifying step 3: the container healthcheck uses busybox `wget`, which resolves `localhost` to `::1` first, while `spa.conf` listened on IPv4 only, so both web UIs reported unhealthy. `spa.conf` now also listens on `[::]:80` and the healthchecks target `127.0.0.1`.

Compose `build.args` map the `REACT_APP_*` variables of the `[P]` block and the demo DID straight from `.env`; `REACT_APP_AUTH_PROVIDER`, `REACT_APP_OIDC_AUTHORITY` and `REACT_APP_OIDC_CLIENT_ID` are required (`:?`), the agency endpoint defaults to `http://localhost:3000`. Port `8000:80`.

`.dockerignore`: `node_modules`, `build`, `.env`, `reports`, `storybook-static`. Excluding `.env` matters: the developer's host `.env` must not leak into the image.

### 4.5 heka-sso-web-ui

Same shape. Vite reads `VITE_*` from the process environment during `vite build`, so `ARG` followed by `ENV` is enough, no `.env` materialisation. Build args map the `VITE_*` variables of the `[R]` block from `.env`: `VITE_AUTH_PROVIDER` required, the `VITE_KC_*` quartet and the `VITE_AUTH0_*` trio as `${VAR:-}` pass-through (the inactive provider's variables are simply empty), plus `VITE_AUTO_SIGN_IN` defaulting to `true`. Output directory `dist`. Port `5173:80`.

`preview.html` is not part of the production build, which is fine for this stack.

Implemented (step 2): `heka-sso-web-ui/Dockerfile` follows this sketch; empty `VITE_*` args are passed through unchanged because an empty `VITE_KC_IDP_HINT` is meaningful. Same `check=skip` directive and standalone build command as the identity web UI, with the tag `heka-sso-web-ui`.

### 4.6 keycloak and keycloak-theme-builder (profile `keycloak`)

Lifted from `heka-sso-service/docker-compose.dev.yml` with paths rewritten to the repo root:

- theme builder: context `./demo/heka-keycloak-theme`, `Dockerfile.builder`, bind mount `./demo/heka-keycloak-theme:/theme`, volumes `keycloak-theme-node-modules` and `keycloak-theme`.
- keycloak-realms: one-shot `busybox` container running `docker/keycloak/prepare-realms.sh`. It copies `./heka-sso-service/keycloak/*.json` (bind mount, read-only) into the `keycloak-realms` volume and rewrites the `heka-sso` broker's `"issuer"` in `realm-heka.json` to `${SSO_ISSUER_URL:-http://localhost:3005}`. With the default value the copy is byte-identical to the committed files.
- keycloak: `quay.io/keycloak/keycloak:26.3`, same `start-dev --import-realm` command and theme flags, `KC_HOSTNAME=${KC_HOSTNAME:-http://localhost:8080}`, `KC_HEALTH_ENABLED=true`, realms from the `keycloak-realms` volume at `/opt/keycloak/data/import:ro`, theme jar from the `keycloak-theme` volume, `extra_hosts` host gateway (the `heka` realm's broker calls the SSO service at `host.docker.internal:3005`), port `8080:8080`, `depends_on` the builder and the realm preparer with `service_completed_successfully`. `SSO_ISSUER_URL` is also set on the Keycloak service itself so that a change of it recreates the container and triggers a fresh import.
- Healthcheck without curl (the image has none): a bash `/dev/tcp` probe of `http://localhost:9000/health/ready`. It is informational only, since nothing depends on it (decision 4).

Both services carry `profiles: [keycloak]`. After the migration of section 13 this is the only Compose definition of Keycloak in the repository; a developer who needs just Keycloak runs `docker compose --profile keycloak up -d keycloak` at the root, which also starts the theme builder as its dependency.

Found while verifying step 4: the theme builder as defined in the SSO package Compose fails with `EXDEV: cross-device link not permitted`. keycloakify renames the finished jar from `node_modules/.cache` (the named `node_modules` volume) into `dist_keycloak` (the host bind mount), and `rename` cannot cross mount points. The root file therefore mounts the host source read-only at `/theme-src` and copies it, minus `node_modules`, `dist` and `dist_keycloak`, into one working volume (`keycloak-theme-work`) where install, cache and output share a mount. The host directory is no longer written to. The package Compose has the same latent failure; step 8c removes that definition.

Also found: the healthcheck probe contains `Host: localhost`, which YAML reads as a mapping inside a plain list item; it is written as a folded block scalar.

Verification notes: a browser login could not be driven from the shell, so the equivalent checks were used. The `heka-platform` authorize endpoint renders the Heka-themed login page for the web UI client and its redirect URI; a token from the demo broker (identity service to Keycloak through the host gateway) carries the expected issuer, audience and role and is accepted on `GET /user` while a missing or tampered token gets 401; the `heka` realm with `kc_idp_hint=heka-sso` redirects through Keycloak's broker endpoint to the bridge's `/authorize` and on to `/interaction/<id>`. Keycloak sets its auth-session cookies with the `Secure` attribute, which curl drops over http while browsers accept it for localhost; the chain was followed by forwarding the cookies by hand.

## 5. Root `.env.example`

### 5.1 Two IdP roles, switched independently

The stack talks to an identity provider in two unrelated roles. Each role is chosen on its own, so Keycloak for one and Auth0 for the other is a valid combination.

| Role | Who signs in | Containers that read the values | Keycloak | Auth0 |
| ---- | ------------ | ------------------------------- | -------- | ----- |
| **Platform IdP** | Operators of the identity web UI; the SSO bridge's service account | `heka-identity-service`, `heka-sso-service`, `heka-identity-web-ui` (build) | realm `heka-platform` | API `https://heka-identity` + SPA + two M2M apps (`setup-tenant.sh`) |
| **Demo relying-party IdP** | Users of the SSO demo web UI, brokered to the wallet bridge | `heka-sso-web-ui` (build), `heka-sso-service` (broker client), `keycloak` (broker issuer) | realm `heka` | SPA + enterprise connection `heka-sso` |

Rules that make the file predictable:

- The root Compose file has **no provider-specific defaults**. Every provider value comes from `.env`; required ones are declared `${VAR:?...}` so a missing value fails at `docker compose config` with the variable name instead of silently pointing at the wrong provider. `cp .env.example .env` is therefore mandatory.
- Each role has one **selector variable** that the web UI already understands, `REACT_APP_AUTH_PROVIDER` for the platform role and `VITE_AUTH_PROVIDER` for the demo role. The selector does nothing by itself in Compose; it is the first line of each block so a reader sees which block is active.
- The file has **two provider sections, Keycloak first and active, Auth0 second and commented out**. Each section repeats the same two role blocks with the same variable names. Switching a role means commenting out its block in one section and uncommenting the same block in the other; nothing else moves.
- Every variable carries the container it reaches, and whether a change needs `up -d` (runtime) or `up -d --build <service>` (baked into a web UI image). A line that sets an **empty** value carries no inline comment, the comment goes on the line above: Compose's env parser reads `VAR=   # text` as the value `# text` (found while verifying step 3).
- Values shared by both providers (bootstrap, tunnels, SSO issuer) sit in a third section after the two provider sections.

### 5.2 File layout

Implemented (step 5): the committed root `.env.example` is this block verbatim.

```
################################################################################
# Heka Identity Platform: root Compose variables (docs/root-docker-compose-plan.md, section 5)
#
# Two identity-provider roles, chosen independently:
#   [P] Platform IdP      - identity web UI login, identity service token check,
#                           SSO bridge service account.   Selector: REACT_APP_AUTH_PROVIDER
#   [R] Relying-party IdP - SSO demo web UI login, brokered to the wallet bridge.
#                           Selector: VITE_AUTH_PROVIDER
# Section 1 (Keycloak) is active. To move a role to Auth0, comment out its [P] or
# [R] block below and uncomment the same block in section 2. Rebuild the web UI
# named in the block afterwards; runtime values only need `docker compose up -d`.
# Keycloak is needed while any role uses it: add `--profile keycloak`.
#
# The comment on (or above) every line names the container that reads the value and
# whether a change is a container recreate (`up -d`) or a web UI rebuild. A line that
# sets an empty value carries no inline comment: Compose would read the comment as the value.
################################################################################

# ==============================================================================
# 1. KEYCLOAK (default)            docker compose --profile keycloak up -d --build
# ==============================================================================

# ---- 1.[P] Platform IdP = Keycloak realm heka-platform ------------------------
REACT_APP_AUTH_PROVIDER=keycloak                                  # heka-identity-web-ui (rebuild)
REACT_APP_OIDC_AUTHORITY=http://localhost:8080/realms/heka-platform   # heka-identity-web-ui (rebuild)
REACT_APP_OIDC_CLIENT_ID=heka-identity-web-ui                     # heka-identity-web-ui (rebuild)
# heka-identity-web-ui (rebuild), Auth0 only
REACT_APP_OIDC_AUDIENCE=
OIDC_ISSUER_URL=http://localhost:8080/realms/heka-platform        # heka-identity-service: exact iss (browser-facing URL)
OIDC_JWKS_URI=http://host.docker.internal:8080/realms/heka-platform/protocol/openid-connect/certs   # heka-identity-service: JWKS via host gateway
OIDC_AUDIENCE=heka-identity-service                               # heka-identity-service
# heka-identity-service: empty = service defaults (sub, roles, ...)
OIDC_CLAIM_USER_ID=
OIDC_CLAIM_ROLES=
OIDC_CLAIM_NAME=
OIDC_CLAIM_ORG_ID=
DEMO_TOKEN_URL=http://host.docker.internal:8080/realms/heka-platform/protocol/openid-connect/token   # heka-identity-service: demo-token broker
DEMO_CLIENT_ID=heka-demo                                          # heka-identity-service
DEMO_CLIENT_SECRET=dev-only-heka-demo-secret-do-not-use-in-production   # heka-identity-service
# heka-identity-service, Auth0 only
DEMO_TOKEN_PARAMS=
IDENTITY_SERVICE_TOKEN_URL=http://host.docker.internal:8080/realms/heka-platform/protocol/openid-connect/token   # heka-sso-service: service-account token
IDENTITY_SERVICE_CLIENT_ID=heka-sso-service                       # heka-sso-service
IDENTITY_SERVICE_CLIENT_SECRET=dev-only-heka-sso-service-secret-do-not-use-in-production   # heka-sso-service
# heka-sso-service, Auth0 only
IDENTITY_SERVICE_TOKEN_PARAMS=

# ---- 1.[R] Relying-party IdP = Keycloak realm heka ----------------------------
VITE_AUTH_PROVIDER=keycloak                                       # heka-sso-web-ui (rebuild)
VITE_KC_URL=http://localhost:8080                                 # heka-sso-web-ui (rebuild)
VITE_KC_REALM=heka                                                # heka-sso-web-ui (rebuild)
VITE_KC_CLIENT_ID=heka-sso-web-ui                                 # heka-sso-web-ui (rebuild)
VITE_KC_IDP_HINT=heka-sso                                         # heka-sso-web-ui (rebuild): empty shows Keycloak's own page
SSO_ISSUER_URL=http://localhost:3005                              # heka-sso-service + keycloak (broker issuer); localhost for a desktop browser

# ==============================================================================
# 2. AUTH0                                     docker compose up -d --build
#    Values come from heka-sso-service/auth0/setup-tenant.sh and the tenant dashboard.
# ==============================================================================

# ---- 2.[P] Platform IdP = Auth0 API https://heka-identity ---------------------
# REACT_APP_AUTH_PROVIDER=auth0                                   # heka-identity-web-ui (rebuild)
# REACT_APP_OIDC_AUTHORITY=https://<tenant>.<region>.auth0.com/   # heka-identity-web-ui (rebuild), trailing slash
# REACT_APP_OIDC_CLIENT_ID=<heka-identity-web-ui SPA client id>   # heka-identity-web-ui (rebuild)
# REACT_APP_OIDC_AUDIENCE=https://heka-identity                   # heka-identity-web-ui (rebuild)
# OIDC_ISSUER_URL=https://<tenant>.<region>.auth0.com/            # heka-identity-service, trailing slash
# heka-identity-service: empty = discovery from the issuer
# OIDC_JWKS_URI=
# OIDC_AUDIENCE=https://heka-identity                             # heka-identity-service
# OIDC_CLAIM_USER_ID=https://heka/heka_uid                        # heka-identity-service: namespaced claims
# OIDC_CLAIM_ROLES=https://heka/roles
# OIDC_CLAIM_NAME=https://heka/name,name,nickname
# OIDC_CLAIM_ORG_ID=https://heka/org_id
# DEMO_TOKEN_URL=https://<tenant>.<region>.auth0.com/oauth/token  # heka-identity-service
# DEMO_CLIENT_ID=<heka-demo M2M client id>                        # heka-identity-service
# DEMO_CLIENT_SECRET=<heka-demo M2M client secret>                # heka-identity-service
# DEMO_TOKEN_PARAMS={"audience":"https://heka-identity"}          # heka-identity-service
# IDENTITY_SERVICE_TOKEN_URL=https://<tenant>.<region>.auth0.com/oauth/token   # heka-sso-service
# IDENTITY_SERVICE_CLIENT_ID=<heka-sso-service M2M client id>     # heka-sso-service
# IDENTITY_SERVICE_CLIENT_SECRET=<heka-sso-service M2M client secret>   # heka-sso-service
# IDENTITY_SERVICE_TOKEN_PARAMS={"audience":"https://heka-identity"}    # heka-sso-service

# ---- 2.[R] Relying-party IdP = Auth0 SPA + enterprise connection heka-sso -----
# VITE_AUTH_PROVIDER=auth0                                        # heka-sso-web-ui (rebuild)
# VITE_AUTH0_DOMAIN=<tenant>.<region>.auth0.com                   # heka-sso-web-ui (rebuild), no scheme
# VITE_AUTH0_CLIENT_ID=<heka-sso-web-ui SPA client id>            # heka-sso-web-ui (rebuild)
# VITE_AUTH0_CONNECTION=heka-sso                                  # heka-sso-web-ui (rebuild)
# SSO_ISSUER_URL=https://<ngrok host for 3005>                    # heka-sso-service: Auth0 must reach the bridge over https
## The auth0-broker callback and logout URLs live in heka-sso-service/env/oidc-clients.json, not here.

# ==============================================================================
# 3. PROVIDER-INDEPENDENT
# ==============================================================================

# ---- Bootstrap values, filled after the first boot (plan section 7.2) ---------
# heka-identity-web-ui (rebuild): from yarn prepare-demo-user
REACT_APP_DEMO_USER_DID=
# heka-sso-service: verifier of the bridge's tenant
IDENTITY_SERVICE_PUBLIC_VERIFIER_ID=
# heka-sso-service: DID signing OID4VP requests
IDENTITY_SERVICE_REQUEST_SIGNER_DID=
OIDC_STUB_LOGIN=true                                              # heka-sso-service: false once the two values above are set

# ---- Third-party wallet on a phone: https tunnel to port 3003 (plan section 9) -
# A phone wallet cannot reach localhost: put the tunnel hostname here, e.g.
# https://abc123.ngrok-free.app, then `docker compose up -d`. Runtime only, no rebuild.
AGENT_OID4VCI_ENDPOINT=http://localhost:3003                      # heka-identity-service: baked into offers and requests
# heka-identity-service: logo URLs for wallets; empty = FILE_STORAGE_FS_URL
FILE_STORAGE_FS_PUBLIC_URL=
FILE_STORAGE_FS_URL=http://localhost:3000                         # heka-identity-service: logo URLs for browsers
AGENT_HTTP_ENDPOINT=http://localhost:3001                         # heka-identity-service: DIDComm only
AGENT_WS_ENDPOINT=ws://localhost:3002                             # heka-identity-service: DIDComm only

# ---- Optional -----------------------------------------------------------------
KC_HOSTNAME=http://localhost:8080                                 # keycloak: browser-facing URL = iss of every token
WEBHOOK_ALLOW_HTTP=false                                          # heka-identity-service
WEBHOOK_ALLOW_PRIVATE_ADDRESSES=false                             # heka-identity-service
SSO_LOG_LEVEL=info                                                # heka-sso-service
```

The root `.env` is used only for Compose interpolation and build args. It is not mounted into any container, so a value listed here must be wired explicitly in the Compose file.

### 5.3 Broker clients and login configurations as JSON files

The bridge's `OIDC_CLIENTS` and `OIDC_LOGIN_CONFIGS` are JSON arrays. Today the service reads them only from the environment (`parseJsonArray` in `heka-sso-service/src/core/config/configs/oidc.config.ts`), while the signing keys already have a file variant (`OIDC_JWKS_FILE`, read with `readFileSync` when `OIDC_JWKS` is unset). The plan extends that precedent to the two arrays, which keeps credentials out of `.env`, sidesteps Compose interpolation entirely and lets a production deployment point the same variables at Docker secrets.

**Preparatory change in heka-sso-service** (its own small PR, lands before the root Compose):

- New keys `OIDC_CLIENTS_FILE` and `OIDC_LOGIN_CONFIGS_FILE`. Precedence mirrors the JWKS rule: the inline variable wins when set; otherwise the file is read; otherwise the value is `[]`. An unreadable file is a config problem reported by name, like `OIDC_JWKS_FILE could not be read`.
- Implementation: `parseJsonArray` gains the file fallback (about fifteen lines), reusing the existing read-and-report pattern. Validation of the parsed array is unchanged, so client-secret strength checks in production still apply.
- README: two rows in the OIDC provider table, one sentence under the `OIDC_CLIENTS` and `OIDC_LOGIN_CONFIGS` examples. Unit tests: file read, inline precedence, missing file reported.

**Files, kept in the SSO package so the root project and the package Compose share them:**

```
heka-sso-service/env/oidc-login-configs.json      committed: the default mDL login config from the package Compose
heka-sso-service/env/oidc-clients.json            gitignored: broker clients with their secrets
heka-sso-service/env/oidc-clients.example.json    committed: keycloak-broker entry (dev secret) + auth0-broker entry with <tenant> placeholders
```

The example clients file is the `OIDC_CLIENTS` value of `heka-sso-service/env/.env.example` pretty-printed, with the Keycloak `backchannelLogoutUri` on `http://host.docker.internal:8080/...` because the bridge calls Keycloak from inside a container in both scopes. First boot copies it to `oidc-clients.json`; the user edits the `auth0-broker` entry's callback and logout URLs when the demo role moves to Auth0 (section 8), so no `AUTH0_DOMAIN` variable is needed in `.env`. Both brokers may stay registered at once; an unused client is inert. The files are the same whether the bridge runs from the root project or from the package (section 13.3), so there is one copy to edit.

Both Compose files mount the two files read-only into `heka-sso-service` at `/run/config/` and set the two `_FILE` variables (section 4.3); the root file uses the `./heka-sso-service/env/` path. Because the service reads the files at startup, a change is `docker compose restart heka-sso-service`, no recreate.

Until the preparatory change is merged, the fallback that needs no code is a wrapper command exporting the file contents, `sh -c 'export OIDC_CLIENTS="$(cat /run/config/oidc-clients.json)" ...'`. It is not the target design; it is listed so the root Compose can be tried before the SSO PR lands.

## 6. Startup order

```
postgres (healthy)
  -> heka-identity-service (healthy: /health)
       -> heka-sso-service
heka-identity-web-ui, heka-sso-web-ui   (no dependencies, static)
keycloak-theme-builder -> keycloak      (profile only, no dependents)
```

The identity service takes noticeably longer than the rest to become healthy because the agent initialises its wallet. Set `start_period: 60s` on its healthcheck so the SSO service is not started against a half-initialised API.

## 7. Running the containers

### 7.1 Quick start (Keycloak, desktop browser)

What a user does, in order. This is the text that `docs/root-docker-compose.md` will carry once implemented.

1. **Prerequisites.** Docker Desktop or Docker Engine with Compose v2.17 or newer. Nothing else on the host may listen on ports 3000 to 3003, 3005, 5173, 8000 or 8080; stop any per-package Compose project first.
2. **Create the local config files** from the templates, at the repository root:
   ```
   cp .env.example .env
   cp heka-sso-service/env/oidc-clients.example.json heka-sso-service/env/oidc-clients.json
   ```
   The defaults are complete for Keycloak; nothing needs editing for the first run. If the SSO service exits with `OIDC_CLIENTS_FILE could not be read`, the copy was skipped and Docker Desktop created a directory of that name instead: `rmdir heka-sso-service/env/oidc-clients.json`, then copy again.
3. **Start everything**, Keycloak included:
   ```
   docker compose --profile keycloak up -d --build
   ```
   The first run builds four images and takes a few minutes. Wait until `docker compose ps` shows every service healthy or running.
4. **Open the apps.**
   - Identity web UI: `http://localhost:8000`, sign in as `demo` / `Password1234!`.
   - SSO demo web UI: `http://localhost:5173`, sign in through the stub wallet login.
   - Keycloak admin console: `http://localhost:8080`, `admin` / `admin`.
   - Identity service API: `http://localhost:3000`, SSO bridge: `http://localhost:3005`.
5. **Finish the bootstrap** for the public demo pages and real wallet login: section 7.2, steps 2 and 3.
6. **Everyday commands.**
   - Stop: `docker compose --profile keycloak down`. Add `-v` to also drop the databases and start from scratch.
   - Change a runtime value in `.env` (tunnel URL, bootstrap values): `docker compose --profile keycloak up -d`.
   - Change a web UI value in `.env` (`REACT_APP_*`, `VITE_*`): `docker compose up -d --build <heka-identity-web-ui|heka-sso-web-ui>`.
   - Change `heka-sso-service/env/oidc-*.json`: `docker compose restart heka-sso-service`.
   - Logs: `docker compose logs -f <service>`.
7. **Phone wallet.** Start an https tunnel to port 3003, put its hostname into `AGENT_OID4VCI_ENDPOINT` and `FILE_STORAGE_FS_PUBLIC_URL` in `.env`, run `docker compose --profile keycloak up -d`. Details in section 9.
8. **Auth0 instead of Keycloak** for one or both roles: section 8. With both roles on Auth0, drop `--profile keycloak` from every command above.

### 7.2 First boot (Keycloak)

The two-step bootstrap is unavoidable while the demo DID is a build-time value.

1. `cp .env.example .env` and `cp heka-sso-service/env/oidc-clients.example.json heka-sso-service/env/oidc-clients.json`, then `docker compose --profile keycloak up -d --build`. Everything starts. Sign-in to the identity web UI works (user `demo` / `Password1234!` of the `heka-platform` realm). The public demo pages do not work yet, and the SSO web UI logs in through the stub.
2. Prepare the demo tenant. In `heka-identity-service-web-ui`, run `yarn prepare-demo-user` on the host against `http://localhost:3000`. It obtains a token from the demo broker on the identity service and writes `REACT_APP_DEMO_USER_DID` into that package's `.env`. Copy the value into the root `.env`, then `docker compose up -d --build heka-identity-web-ui`.
3. Optional, real wallet login through the SSO bridge. Create the verifier the bridge uses and prepare its wallet (the SSO service-account tenant, `POST /prepare-wallet` with the SSO client's token), record the verifier id and the request signer DID in the root `.env`, set `OIDC_STUB_LOGIN=false`, then `docker compose up -d heka-sso-service`. This step also needs the https tunnel for port 3003, since a phone wallet fetches the authorization request from the OID4VC endpoint.

A follow-up worth doing after the Compose lands: a `tools/compose-bootstrap.sh` that performs step 2 and, given the SSO token, step 3, and rewrites the root `.env`. It is left out of the first iteration to keep the change reviewable.

### 7.3 First-boot run of 2026-10-01: what deviated from 7.1 and 7.2

The sequence was run on a Windows host with Docker Desktop against the implemented files. Everything in 7.1 steps 1 to 4 and 7.2 steps 1 and 2 worked as written; these are the points the usage doc (step 7) must add.

- **Startup time.** The first `up -d --build` builds four images, the identity service one includes native modules and takes the longest; the theme builder then runs a Maven packaging before Keycloak starts. Expect several minutes before `docker compose ps` shows every service healthy, with the identity service and Keycloak last.
- **`yarn prepare-demo-user` runs on the host and needs the web UI package installed** (`yarn install` in `heka-identity-service-web-ui`). It reads and rewrites that package's local `.env`: it needs no values from it beyond the agency endpoint default, but it **overwrites `REACT_APP_DEMO_USER_DID` there**, which matters to a developer who also runs the web UI on the host against a different database. Back the file up first, or copy the printed DID into the root `.env` and restore the package file.
- **The DID differs per database.** The root project's Postgres is a fresh volume, so the demo tenant's DID is not the one a host-run setup produced earlier; both can coexist as long as each `.env` carries its own.
- **Rebuild after the DID is set:** `docker compose --profile keycloak up -d --build heka-identity-web-ui`. Verified by the DID appearing in the served bundle and by `GET /dids?own=true` with a demo-broker token listing it.
- **SSO stub login** needs nothing beyond the defaults. Verified by following the whole redirect chain: the `heka` realm with `kc_idp_hint=heka-sso`, Keycloak's broker login, the bridge's `/authorize`, the interaction page completing immediately under `OIDC_STUB_LOGIN=true`, the resume, Keycloak's broker endpoint and first-broker-login flow, and the redirect to `http://localhost:5173/` with an authorization code.
- **Keycloak cookies and curl.** Keycloak sets its auth-session cookies with `Secure`; curl drops them over http, browsers accept them for localhost. Only relevant to shell-based testing.
- **Not exercised:** 7.2 step 3 (real wallet login through the bridge) needs a phone wallet and an https tunnel to port 3003.

## 8. Moving a role to Auth0

Each role switches on its own; the other role's block stays untouched.

**Platform IdP to Auth0** (identity service, identity web UI, SSO service account):

1. Run the tenant recipe (`heka-sso-service/auth0/setup-tenant.sh`) and copy the API identifier, the SPA client id and the two M2M credentials it prints into block `2.[P]` of the root `.env`. Comment out block `1.[P]`, uncomment `2.[P]`.
2. `docker compose [--profile keycloak] up -d --build heka-identity-web-ui heka-identity-service heka-sso-service`. The profile stays on only if the demo role still uses Keycloak. The `--build` is for the identity web UI bundle; the two services only need a recreate.
3. Auth0 `sub` values differ from Keycloak ones, so the demo tenant DID is provider-specific. Re-run section 7.2 step 2. The fixed `heka_uid` of the demo account keeps the DID identical across providers only when the same wallet database is kept.

**Demo relying-party IdP to Auth0** (SSO web UI, broker):

1. In the tenant, the SPA `heka-sso-web-ui` and the enterprise connection `heka-sso` must exist (README in `heka-sso-service/auth0`). Fill block `2.[R]`: SPA client id, tenant domain, and `SSO_ISSUER_URL` set to the https tunnel of port 3005, which the connection's issuer must equal. Comment out block `1.[R]`, uncomment `2.[R]`.
2. In `heka-sso-service/env/oidc-clients.json`, set the `auth0-broker` entry's `redirectUris` to `https://<tenant>.<region>.auth0.com/login/callback` and `postLogoutRedirectUris` to `https://<tenant>.<region>.auth0.com/logout` (section 5.3). Then `docker compose [--profile keycloak] up -d --build heka-sso-web-ui heka-sso-service`.
3. The verifier values of section 7.2 step 3 belong to the platform role's tenant and are unaffected by this switch.

Running both roles on Auth0 means no `keycloak` profile at all.

## 9. Third-party wallets and public URLs

The stack must work with a wallet on a phone, which cannot reach `localhost`. The tunnels (ngrok) run on the host outside Compose, as today; the root project only needs the resulting URLs. The URLs may be dynamic (a new hostname on every ngrok restart), so the design keeps them out of every image and treats a change as a container recreate, never a rebuild.

### 9.1 What the wallet contacts: port 3003 only

Every wallet interaction goes to the identity service's OID4VC router on port 3003. The SSO login page and the identity web UI put an `openid4vp://...?request_uri=<AGENT_OID4VCI_ENDPOINT>/...` link into the QR, the wallet fetches the request object from that URL and posts the presentation back to it; credential offers work the same way. The wallet never contacts the SSO service, Keycloak or the web UIs when the browser is on a desktop.

Runtime variables on `heka-identity-service`, all from the root `.env`:

| Variable                     | Value                                   | Why                                                                          |
| ---------------------------- | --------------------------------------- | ---------------------------------------------------------------------------- |
| `AGENT_OID4VCI_ENDPOINT`     | `https://<ngrok host for 3003>`         | Baked into offers and presentation requests at creation time                 |
| `FILE_STORAGE_FS_PUBLIC_URL` | `https://<ngrok host for 3003>`         | Logo URLs in issuer metadata; wallets reject http. Port 3003 serves the files |
| `FILE_STORAGE_FS_URL`        | `http://localhost:3000` (unchanged)     | Browser-facing; the ngrok free-tier interstitial would break `<img>` tags    |
| `AGENT_HTTP_ENDPOINT`, `AGENT_WS_ENDPOINT` | unchanged (`localhost`)   | DIDComm only; a DIDComm wallet needs its own tunnels to 3001 and 3002        |

These are ordinary environment values, so the identity service picks them up on container recreate. Nothing in the two web UI images embeds them.

### 9.2 Port 3005: when the SSO service needs a public URL

The SSO service's issuer (`SSO_ISSUER_URL`) must be a public https URL in two cases only:

1. **Auth0 brokering.** Auth0 runs in the cloud and calls the bridge's token, JWKS and userinfo endpoints; the `heka-sso` enterprise connection's issuer must equal the bridge's configured issuer. This is the demo-role Auth0 path of section 8, block `2.[R]` of `.env`.
2. **Same-device flow, browser on the phone.** Then the phone browser also has to reach Keycloak (8080) and the web UIs (8000, 5173), which changes `KC_HOSTNAME`, the identity issuer, the realm redirect URIs and the web UI build args. That is a different deployment shape and is out of scope for the root Compose; treat it as a follow-up.

For **Keycloak brokering with the browser on a desktop**, `SSO_ISSUER_URL` stays `http://localhost:3005`, and the third-party wallet still works because of 9.1. Keeping 3005 on `localhost` in this mode avoids the ngrok interstitial on the authorize redirect.

When the SSO issuer does move to ngrok while Keycloak brokers to it (for example, one bridge serving both a Keycloak realm and an Auth0 connection), the `heka` realm's identity provider must carry the same issuer, and the committed `realm-heka.json` hard-codes `http://localhost:3005`. The root project handles that with a one-shot `keycloak-realms` service in the `keycloak` profile: it copies `heka-sso-service/keycloak/*.json` into a named volume and replaces the broker's `"issuer"` value with `${SSO_ISSUER_URL}` (a `sed` in a `busybox` container). Keycloak imports from that volume instead of the bind mount. Only the `issuer` is rewritten: the token, JWKS and userinfo URLs keep `host.docker.internal:3005`, since oidc-provider derives endpoint URLs from the request host but always stamps the configured issuer, and the authorize and logout URLs keep `localhost:3005` for the desktop browser. Keycloak in `start-dev` has no persistent volume in this stack, so a container recreate re-imports the rewritten realm; the "existing realm is never updated on import" rule only bites if a Keycloak volume is added later.

### 9.3 Rotating a dynamic ngrok URL

1. Start ngrok, note the new hostname(s).
2. Edit the root `.env`: `AGENT_OID4VCI_ENDPOINT` and `FILE_STORAGE_FS_PUBLIC_URL` for 3003; `SSO_ISSUER_URL` for 3005 when it is public.
3. `docker compose --profile keycloak up -d`. Compose recreates only the containers whose environment changed: the identity service always, the SSO service and Keycloak when the issuer changed. No image is rebuilt.
4. Recreate any QR codes and re-save issuer profiles and schemas whose logo URLs are persisted, as documented for the package dev setup. Verification sessions created before the change are dead; start a new login.

An ngrok static domain (one is included in free accounts) removes steps 1 to 3 for the port it is assigned to. Recommend assigning it to port 3003, since that is the URL the wallet sees and the one persisted into records; 3005 changes are cheap by comparison.

### 9.4 Other notes

- ngrok's free tier answers browser requests with an interstitial page. Wallets are not browsers and are unaffected; the split between `FILE_STORAGE_FS_URL` and `FILE_STORAGE_FS_PUBLIC_URL` exists for this reason.
- Webhook delivery to a sibling container (for example a demo relying party) needs `WEBHOOK_ALLOW_HTTP=true` and `WEBHOOK_ALLOW_PRIVATE_ADDRESSES=true` in the root `.env`, exactly as documented for the package dev Compose.

## 10. Implementation steps

| # | Step                                                                                              | Done when                                                                                 | Status |
| - | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------ |
| 0 | heka-sso-service PR: `OIDC_CLIENTS_FILE` and `OIDC_LOGIN_CONFIGS_FILE` with README rows and unit tests, plus `env/oidc-login-configs.json`, `env/oidc-clients.example.json` and the gitignore entry for `env/oidc-clients.json` (section 5.3). | Service starts with both values supplied as files; inline variables still take precedence; a missing file is reported by name; both JSON files parse. | **Done** 2026-10-01, uncommitted on `feature/remove-heka-auth-service-6` |
| 1 | Add `docker/postgres/init-databases.sh` and `docker/nginx/spa.conf`, plus a root `.gitattributes` forcing LF on `*.sh` so the init script survives a Windows checkout. | `psql` lists both databases on a fresh volume; nginx serves `/some/route` as `index.html`. | **Done** 2026-10-01, uncommitted; verified with throwaway `postgres:15` and `nginx:alpine` containers |
| 2 | Add the two web UI Dockerfiles and `.dockerignore` files. | `docker build` of each package succeeds from a clean checkout with no `.env` present. | **Done** 2026-10-01, uncommitted; both images built with `--build-context nginxconf=../docker/nginx`, serve the SPA fallback, inline the build args, contain no `.env` |
| 3 | Write the root `docker-compose.yml` with postgres, the two backends and the two UIs.              | `docker compose config` renders without warnings; `up -d --build` reaches healthy.         | **Done** 2026-10-01, uncommitted; `docker compose config` renders without warnings, `up -d --build` reaches healthy for all five services. Two fixes outside the file were needed: the identity service's MikroORM CLI pin (section 4.2) and nginx listening on IPv6 for the healthcheck (section 4.4) |
| 4 | Add the `keycloak` profile services, including `keycloak-realms` and `docker/keycloak/prepare-realms.sh`. | `--profile keycloak up` imports the three realms; login to the identity web UI succeeds; with `SSO_ISSUER_URL` set, the `heka` realm's broker shows that issuer in the admin console. | **Done** 2026-10-01, uncommitted; the three realms import, a Keycloak token is accepted by the identity service, the `heka` realm forwards to the bridge's interaction page, and the broker issuer follows `SSO_ISSUER_URL` across a recreate |
| 5 | Add root `.env.example` (section 5) and ignore `.env`.                                             | `docker compose config` renders with section 1 active, with either role moved to section 2, and fails with a named variable when `.env` is missing. | **Done** 2026-10-01, uncommitted; verified: section 1 renders, each role moved to section 2 renders with the other role untouched, a missing `.env` fails naming `OIDC_ISSUER_URL` |
| 6 | Run the quick start and first-boot sequence of section 7 and record any deviation in the usage doc. | Demo pages work with the prepared DID; SSO stub login works from the SSO web UI.         | **Done** 2026-10-01; first boot run on this machine, deviations recorded in 7.3; the optional wallet-login step 7.2.3 was not exercised (needs a phone and a tunnel) |
| 7 | Write `docs/root-docker-compose.md` from section 7 (quick start, first boot), section 8 (provider switch) and section 9 (tunnels), and link it from the root README and the SSO README. | Docs reviewed. | **Done** 2026-10-01, uncommitted; `docs/root-docker-compose.md` written from sections 7 to 9 and 13.2, linked from the root README and the SSO README; awaiting review |
| 8 | Consolidate the per-package Compose files (section 13), sub-steps 8a to 8f below.                | Each package has one Compose file; no file in the repository names a `dev.yml`.           | **Done** 2026-10-01, uncommitted; see 8a to 8f |

Step 0 is a separate PR and must be merged before step 3 is tested. Steps 1 and 2 are independent of each other and of the rest. Step 8 ships as its own PR after the root Compose is in, because its doc changes point at the root commands.

Sub-steps of step 8, one per point of section 13.3 and 13.4:

| #  | Sub-step                                                                                          | Done when                                                                                 | Status |
| -- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------ |
| 8a | `heka-identity-service/docker-compose.yml`: merge the dev file in. Add `build: .` next to `image: ${IMAGE:-heka-identity-service:latest}`, drop `version: '3.4'`, keep the host-gateway Keycloak defaults and the healthcheck, rename `AGENT_HTTP_EP`/`AGENT_WS_EP` to the `.env` names, forward `OIDC_CLAIM_*`, `OIDC_JWKS_URI`, `AGENT_OID4VCI_ENDPOINT` and `FILE_STORAGE_FS_*`. Delete `docker-compose.dev.yml`. | `docker compose up -d --build` in the package runs the service against a host Keycloak; `docker compose config` shows every `.env` value forwarded under its own name. | **Done** 2026-10-01; package project healthy against the root Keycloak, every `.env` value forwarded under its own name, a demo-broker token accepted on `GET /user`. Caveat recorded in 13.3: a `.env` written for `yarn start` carries `localhost` in server-to-server URLs, which the container cannot use |
| 8b | `heka-sso-service/docker-compose.yml`: merge the dev file in. Add `build: .` (build arg `NODE_ENV=development`), keep `NODE_ENV=${NODE_ENV:-development}`, the host-gateway URLs and the dev secrets, set `OIDC_STUB_LOGIN=${OIDC_STUB_LOGIN:-true}`, turn the two `:?` verifier values into `${VAR:-}`, replace the inline `OIDC_CLIENTS` and `OIDC_LOGIN_CONFIGS` with the two `_FILE` variables and read-only mounts of `env/oidc-*.json`. Delete `docker-compose.dev.yml`. | `docker compose up -d --build` in the package starts the bridge with stub login and no `.env`; with the verifier values set, wallet login works against a host identity service. | **Done** 2026-10-01; package project starts healthy with stub login and no `.env`, the authorize request completes through the stub; real wallet login not exercised (needs a phone and a tunnel) |
| 8c | Remove `keycloak`, `keycloak-theme-builder` and the `keycloak-theme*` volumes from the SSO package file; keep its Postgres on host port 5434. | `yarn test:e2e` in the SSO package passes against `docker compose up -d postgres`; Keycloak is defined only in the root file. | **Done** 2026-10-01; `yarn test:e2e` passes (3 files, 35 tests) against `docker compose up -d postgres` on 5434; Keycloak is defined only in the root file |
| 8d | Repoint the docs listed in section 13.4: identity `docs/setup.md` (Docker section and webhook note), SSO `README.md` Docker section, identity web UI `README.md` Keycloak hint, `keycloak/README.md`, theme `README.md`. | Each names either the root command or plain `docker compose` in the package; a grep for `dev.yml` across `*.md` is empty. | **Done** 2026-10-01; the only remaining `dev.yml` mentions are historical, in this plan and in `docs/keycloak-replacement-for-auth-service.md` |
| 8e | Update the two code comments that name the dev file: `demo/heka-keycloak-theme/Dockerfile.builder` and the SSO `vitest.e2e.config.mts` plus the two e2e test headers. | A grep for `dev.yml` across the repository (excluding `node_modules`) is empty.           | **Done** 2026-10-01 |
| 8f | Update the SSO README production section so it states that a real deployment overrides every dev secret and sets the verifier values, since the file no longer enforces them with `:?`. | README reviewed.                                                                          | **Done** 2026-10-01 |

## 11. Verification checklist

- `docker compose --profile keycloak up -d --build` from a clean checkout: all services healthy, Keycloak shows realms `heka`, `heka-platform`, `heka-wallet`.
- Identity web UI at `http://localhost:8000`: login redirects to Keycloak and back; the API calls to `localhost:3000` pass CORS.
- `curl http://localhost:3000/demo/token` returns a token (demo broker reaches Keycloak through the host gateway).
- SSO web UI at `http://localhost:5173`: redirect to Keycloak `heka` realm with `kc_idp_hint=heka-sso`, stub login completes, dashboard shows brokered claims. Sign out returns to the Keycloak login page (back-channel logout succeeded through the host gateway).
- `docker compose logs heka-sso-service` shows the service-account token obtained from Keycloak and no `IDENTITY_SERVICE_*` warnings other than the stub-login notice.
- With the Auth0 block and no profile: identity web UI login through Auth0; `docker compose logs heka-identity-service` reports `discovery` as the key source.
- `docker compose down` and `up` again without `--build` keeps the demo tenant and the migrations (volume persistence).
- Third-party wallet, cross-device: with ngrok on 3003 in the root `.env`, a QR from the SSO login page (stub login off, section 7.2 step 3) or a credential offer from the identity web UI is accepted by a wallet on a phone, and the presentation completes. Change the ngrok hostname, run `up -d`, confirm only the identity service container was recreated and a new QR works.
- Windows and Linux hosts: `host.docker.internal` resolves inside every container that declares `extra_hosts`.

## 12. Known limitations and follow-ups

- **Build-time UI configuration.** Every provider or DID change rebuilds a UI image. Reading a `window.__ENV__` object injected by nginx at container start would turn these into runtime values and remove step 2's rebuild. That is a change in both apps and is out of scope here.
- **No Keycloak dependency ordering.** A request made before Keycloak finishes importing realms fails and is retried by the client; nothing crashes.
- **Single Postgres superuser** for both services and the wallet databases. Fine for dev, not a production layout.
- **Dev secrets everywhere.** The root Compose is a development stack. Production deployments use the per-package Compose files with real secrets and `NODE_ENV=production`, as section 13 describes.

## 13. Relationship to the per-package Compose files

### 13.1 The problem

Each backend package has two Compose files with overlapping jobs. `docker-compose.yml` runs the published image and expects the rest of the platform on the host; `docker-compose.dev.yml` builds the image from source and, in the SSO package, also owns Keycloak and the theme builder. A root file on top of that would make five files with three different answers to "where is Keycloak" and "which host name reaches the identity service".

### 13.2 The rule

**The directory you run `docker compose` in decides the scope, and each directory has exactly one Compose file.**

| Directory                 | What `docker compose up` starts                                   | Project name            | Reaches other Heka services via |
| ------------------------- | ----------------------------------------------------------------- | ----------------------- | ------------------------------- |
| repository root           | the platform: both backends, both web UIs, Postgres; Keycloak with `--profile keycloak` | `heka`   | service names (provider via host gateway, decision 2) |
| `heka-identity-service/`  | the identity service and its own Postgres                         | `heka-identity-service` | `host.docker.internal`          |
| `heka-sso-service/`       | the SSO bridge and its own Postgres (host port 5434)              | `heka-sso-service`      | `host.docker.internal`          |

The root project is the only place Keycloak and the theme builder are defined. Project names differ, so container and volume names never clash. Host ports are shared on purpose: the root project and a package project are alternatives, never companions. Running one while the other holds the ports fails fast on the port bind, which is the intended signal.

The web UI packages get a Dockerfile (section 4.4 and 4.5) but no Compose file; a static bundle has nothing to compose, and the root project is where it is served.

### 13.3 What each package file becomes

Merge `docker-compose.dev.yml` into `docker-compose.yml` and delete the dev file:

- `image:` keeps the published tag (`${IMAGE:-heka-identity-service:latest}` for the identity service, `heka-sso-service:latest` for the bridge) and `build: .` is added next to it. Plain `up` uses the local or pulled image, `up --build` builds from source. One file serves the developer of that service and a single-image deployment.
- The dev-friendly defaults of the dev file survive: `NODE_ENV=development`, host-gateway URLs for Keycloak and the identity service, stub login on for the bridge (`OIDC_STUB_LOGIN=${OIDC_STUB_LOGIN:-true}`), the dev secrets. The `:?` requirements of the current SSO production file (`IDENTITY_SERVICE_PUBLIC_VERIFIER_ID`, `IDENTITY_SERVICE_REQUEST_SIGNER_DID`) become `${VAR:-}` pass-through, consistent with the root file; a real deployment overrides every secret anyway and the README's production section says so.
- The identity file adopts the `.env` variable names (`AGENT_HTTP_ENDPOINT`, not `AGENT_HTTP_EP`), forwards `OIDC_CLAIM_*`, `OIDC_JWKS_URI`, `AGENT_OID4VCI_ENDPOINT` and `FILE_STORAGE_FS_*`, and drops the obsolete `version: '3.4'` line. This is the fix noted in section 4.2.
- The SSO file gains `OIDC_CLIENTS_FILE` and `OIDC_LOGIN_CONFIGS_FILE` pointing at `env/oidc-clients.json` and `env/oidc-login-configs.json` in the package (section 5.3). The root project mounts the same two files, so the bridge is configured from one place in both scopes.
- Keycloak, the theme builder and their volumes are removed from the SSO file. The SSO Postgres stays on host port 5434 because `vitest.e2e.config.mts` and the two opt-in e2e tests expect it there.

Found while verifying step 8: the identity package forwards its `.env` under the same names `yarn start` uses, so a file written for the host carries `localhost` in URLs the service itself calls (`DEMO_TOKEN_URL`, `OIDC_JWKS_URI`), and inside the container those point at the container. The compose file keeps `host.docker.internal` defaults for exactly these two and uses `${VAR-default}` for them, so an empty value still means "discovery" or "broker off"; the package `.env.example` and `docs/setup.md` now say to leave them unset in Docker or to use the host gateway. Docker Desktop resolves `host.docker.internal` on the host as well, so one value can serve both; plain Linux hosts cannot. The identity package `.dockerignore` also lost its stale `docker-compose.dev.yml` line.

### 13.4 Docs to repoint

Every reference to a `dev.yml` becomes one of two commands: the root command for the platform or for Keycloak alone, or plain `docker compose up --build` inside the package for that service alone.

| File                                                        | Today                                                       | After                                                                 |
| ----------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------- |
| `heka-identity-service/docs/setup.md`, Docker section       | `docker compose -f docker-compose.dev.yml build` / `up -d`  | `docker compose up -d --build`, plus a link to the root usage doc     |
| `heka-identity-service/docs/setup.md`, webhook note         | mentions `-f docker-compose.dev.yml` for `.env` substitution | plain `docker compose`                                               |
| `heka-sso-service/README.md`, Docker section                | dev file builds and brings up Keycloak; prod file runs the image | one file; Keycloak via the root profile; link to the root usage doc |
| `heka-identity-service-web-ui/README.md`                    | `docker compose -f docker-compose.dev.yml up -d keycloak` in the SSO package | `docker compose --profile keycloak up -d keycloak` at the root |
| `heka-sso-service/keycloak/README.md`                       | "`docker-compose.dev.yml` starts Keycloak with `--import-realm`" | the root project does                                              |
| `demo/heka-keycloak-theme/README.md` and `Dockerfile.builder` comment | SSO dev file rebuilds the jar; `--force-recreate keycloak` in the SSO package | the root project; `docker compose --profile keycloak up -d --force-recreate keycloak` at the root |
| `heka-sso-service/vitest.e2e.config.mts`, two e2e test comments | "dev Postgres (`docker-compose.dev.yml`, port 5434)"     | "package Postgres (`docker-compose.yml`, port 5434)"                 |

### 13.5 Alternatives considered

- **`include:` the package files from the root.** Compose rejects duplicate service names across included files, and both packages define `postgres`. Renaming fixes that, but every environment value still has to be overridden per service, because the package files point at the host gateway while the root wants service names. The indirection buys little.
- **`extends:` package services from the root.** Shares image, build and ports, but environment is where the two scopes differ most, and `:?` requirements in the extended file are evaluated against the root's variables.
- **Keep both files per package and add the root.** Lowest effort, highest confusion. Rejected for the reason in 13.1.

# Running the platform with Docker Compose

The root `docker-compose.yml` starts the web-facing components of the Heka Identity Platform together, with Keycloak as an optional, bundled identity provider. It is a development stack: every secret in it is a published dev value.

| Service                | Host port | What it is                                                                 |
| ---------------------- | --------- | -------------------------------------------------------------------------- |
| `heka-identity-service`| 3000-3003 | REST API (3000), DIDComm (3001 http, 3002 ws), OID4VC endpoints (3003)     |
| `heka-identity-web-ui` | 8000      | Identity web UI, static bundle behind nginx                                |
| `heka-sso-service`     | 3005      | OIDC bridge for wallet login                                               |
| `heka-sso-web-ui`      | 5173      | SSO demo web UI, static bundle behind nginx                                |
| `postgres`             | 5432      | One instance with the `heka-identity-service` and `heka-sso-service` databases |
| `keycloak`             | 8080      | Dev IdP with the `heka`, `heka-platform` and `heka-wallet` realms (profile `keycloak`) |

**Scope rule.** The directory you run `docker compose` in decides what you get. At the repository root it is the whole platform. Inside `heka-identity-service/` or `heka-sso-service/` it is that one service plus its own Postgres, with everything else expected on the host. The two scopes share host ports on purpose: run one or the other, never both.

## Prerequisites

- Docker Desktop or Docker Engine with Compose v2.17 or newer.
- Free host ports 3000 to 3003, 3005, 5173, 5432, 8000 and 8080. Stop any per-package Compose project or host-run service first.
- For the first-boot step only: Node and Yarn on the host, with `heka-identity-service-web-ui` installed (`yarn install` there).

## Quick start with Keycloak

1. Create the two local configuration files from their templates, at the repository root:

   ```shell
   cp .env.example .env
   cp heka-sso-service/env/oidc-clients.example.json heka-sso-service/env/oidc-clients.json
   ```

   Both are gitignored. The defaults are complete for Keycloak; nothing needs editing for the first run.

2. Start everything, Keycloak included:

   ```shell
   docker compose --profile keycloak up -d --build
   ```

   The first run builds four images. The identity service image includes native modules, and the Keycloak theme is packaged with Maven before Keycloak starts, so expect several minutes. Wait until `docker compose --profile keycloak ps` shows every service healthy; the identity service and Keycloak are the last.

3. Open the apps:

   | URL                      | Sign in as                                              |
   | ------------------------ | ------------------------------------------------------- |
   | `http://localhost:8000`  | `demo` / `Password1234!` (Keycloak realm `heka-platform`) |
   | `http://localhost:5173`  | the stub wallet login (no wallet needed, see below)     |
   | `http://localhost:8080`  | Keycloak admin console, `admin` / `admin`               |

   The identity service API is at `http://localhost:3000`, the bridge at `http://localhost:3005`.

4. Finish the first boot below so the web UI's public demo pages work.

## First boot

Two values are only known once the stack has run. They live in the root `.env`, section 3.

### Demo tenant for the public demo pages

The identity web UI bakes the demo tenant's DID into its bundle, so the tenant is prepared first and the web UI rebuilt once.

1. In `heka-identity-service-web-ui`, run `yarn prepare-demo-user`. It obtains a token from the identity service's demo-token broker, prepares the demo tenant's wallet and prints its DID.
2. The script also writes the DID into that package's local `.env`, which matters if you run the web UI on the host against another database: back that file up first, or restore it afterwards. The root project only needs the value in the root `.env`:

   ```
   IDENTITY_WEBUI_DEMO_USER_DID=did:key:...
   ```

3. Rebuild the web UI image:

   ```shell
   docker compose --profile keycloak up -d --build heka-identity-web-ui
   ```

The DID belongs to this project's database. A host-run setup with its own database has a different one; each `.env` carries its own.

### Real wallet login through the bridge (optional)

By default the bridge runs the dev stub login (`SSO_SERVICE_OIDC_STUB_LOGIN=true`): the SSO web UI signs in without any wallet and without credential verification. For a real login with a phone wallet:

1. Set up the https tunnel to port 3003 (see [Phone wallets and tunnels](#phone-wallets-and-tunnels)).
2. Create the verifier the bridge uses and prepare its wallet. The bridge acts as the Keycloak service account `heka-sso-service`: obtain a client-credentials token for that client and call `POST /prepare-wallet` on the identity service with an empty body. It returns the tenant's DID.
3. In the root `.env`, set `SSO_SERVICE_IDENTITY_SERVICE_PUBLIC_VERIFIER_ID` and `SSO_SERVICE_IDENTITY_SERVICE_REQUEST_SIGNER_DID` to that DID and `SSO_SERVICE_OIDC_STUB_LOGIN=false`, then:

   ```shell
   docker compose --profile keycloak up -d heka-sso-service
   ```

## Everyday commands

| Change                                                          | Command                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------ |
| Stop                                                            | `docker compose --profile keycloak down`                           |
| Stop and drop the databases (fresh first boot)                  | `docker compose --profile keycloak down -v`                        |
| A runtime value in `.env` (tunnel URL, bootstrap values)        | `docker compose --profile keycloak up -d`                          |
| A web UI value in `.env` (`IDENTITY_WEBUI_*`, `VITE_SSO_WEBUI_*`)| `docker compose up -d --build heka-identity-web-ui` or `heka-sso-web-ui` |
| `heka-sso-service/env/oidc-*.json`                              | `docker compose restart heka-sso-service`                          |
| Keycloak theme sources                                          | `docker compose --profile keycloak up -d --force-recreate keycloak` |
| Only Keycloak, for a service running on the host                | `docker compose --profile keycloak up -d keycloak`                 |
| Logs                                                            | `docker compose logs -f <service>`                                 |

Compose recreates only the containers whose configuration changed. Keycloak in this stack keeps no volume: a recreate starts empty and re-imports the realms, while `restart` keeps users and sessions.

## Configuration

Everything provider-related comes from the root `.env`; the Compose file has no provider defaults and fails by variable name when one is missing. The file is organised around two identity-provider roles that are chosen independently:

| Role                     | Who signs in                                          | Containers that read it                                               | Selector                  |
| ------------------------ | ----------------------------------------------------- | --------------------------------------------------------------------- | ------------------------- |
| `[P]` Platform IdP       | Operators of the identity web UI; the bridge's service account | `heka-identity-service`, `heka-sso-service`, `heka-identity-web-ui` (rebuild) | `IDENTITY_WEBUI_AUTH_PROVIDER` |
| `[R]` Relying-party IdP  | Users of the SSO demo web UI, brokered to the wallet bridge | `heka-sso-web-ui` (rebuild), `heka-sso-service`, `keycloak` (broker issuer) | `VITE_SSO_WEBUI_AUTH_PROVIDER`      |

Section 1 of `.env.example` holds the Keycloak values for both roles and is active. Section 2 holds the Auth0 values, commented out. Section 3 holds provider-independent values: the bootstrap values above, the tunnel URLs and a few optional settings. The comment on each line names the container that reads it and whether a change is a recreate or a web UI rebuild. A line that sets an empty value has its comment on the line above: Compose reads `VAR=   # text` as the value `# text`.

The bridge's broker clients and login configurations are JSON and live in files, not in `.env`: `heka-sso-service/env/oidc-clients.json` (gitignored, holds the client secrets; copied from the example in the quick start) and `heka-sso-service/env/oidc-login-configs.json` (committed). Both are mounted read-only into the bridge; a change is a restart.

## Switching a role to Auth0

Each role switches on its own. Comment out its block in section 1 of `.env`, uncomment the same block in section 2, fill in the values, then rebuild the web UI of that role. Keep `--profile keycloak` as long as the other role still uses Keycloak; with both roles on Auth0, drop it everywhere.

**Platform IdP to Auth0** (identity service, identity web UI, bridge service account):

1. Run the tenant recipe in `heka-sso-service/auth0` (`setup-tenant.sh`) and copy the API identifier, the SPA client id and the two machine-to-machine credentials it prints into block `2.[P]`.
2. `docker compose [--profile keycloak] up -d --build heka-identity-web-ui heka-identity-service heka-sso-service`
3. Auth0 subjects differ from Keycloak ones, so prepare the demo tenant again (first boot above) and rebuild the identity web UI.

**Relying-party IdP to Auth0** (SSO web UI, broker):

1. In the tenant, the SPA `heka-sso-web-ui` and the enterprise connection `heka-sso` must exist (README in `heka-sso-service/auth0`). Fill block `2.[R]`: the SPA client id, the tenant domain, and `SSO_SERVICE_OIDC_ISSUER_URL` set to the https tunnel of port 3005, which the connection's issuer must equal.
2. In `heka-sso-service/env/oidc-clients.json`, set the `auth0-broker` entry's `redirectUris` to `https://<tenant>.<region>.auth0.com/login/callback` and `postLogoutRedirectUris` to `https://<tenant>.<region>.auth0.com/logout`.
3. `docker compose [--profile keycloak] up -d --build heka-sso-web-ui heka-sso-service`

The verifier values of the first boot belong to the platform role's tenant and are unaffected by the relying-party switch.

## Phone wallets and tunnels

A wallet on a phone cannot reach `localhost`. Every wallet interaction goes to the identity service's OID4VC endpoint on port 3003: the QR codes of the SSO login page and the identity web UI carry a request URI there, and the wallet fetches requests and posts presentations to it. Wallets require https, so expose port 3003 through a tunnel such as ngrok and put its hostname into the root `.env`:

```
IDENTITY_SERVICE_AGENT_OID4VCI_ENDPOINT=https://<tunnel host>
IDENTITY_SERVICE_FILE_STORAGE_FS_PUBLIC_URL=https://<tunnel host>
```

Then `docker compose --profile keycloak up -d`. These are runtime values: only the identity service container is recreated, no image is rebuilt. The browser-facing `IDENTITY_SERVICE_FILE_STORAGE_FS_URL` stays on `localhost`, because ngrok's free tier answers browsers with an interstitial page; wallets are not browsers and are unaffected.

The wallet never talks to the bridge, so port 3005 needs a public URL only when Auth0 brokers to it (`SSO_SERVICE_OIDC_ISSUER_URL` in block `2.[R]`). With Keycloak and a desktop browser, keep `SSO_SERVICE_OIDC_ISSUER_URL` on `localhost`. When it does move to a tunnel while Keycloak brokers to it, the Keycloak profile rewrites the `heka` realm's broker issuer to match on the next recreate of Keycloak.

**Rotating a dynamic tunnel hostname:** edit the values in `.env`, run `docker compose --profile keycloak up -d`, then recreate any QR codes and re-save issuer profiles and schemas whose logo URLs are persisted. Verification sessions created before the change are dead; start a new login. A static tunnel domain is best spent on port 3003, the URL that wallets see and that is persisted into records.

**Webhooks** to a sibling container (for example a demo relying party) need `IDENTITY_SERVICE_WEBHOOK_ALLOW_HTTP=true` and `IDENTITY_SERVICE_WEBHOOK_ALLOW_PRIVATE_ADDRESSES=true` in `.env`.

## Troubleshooting

- **`required variable ... is missing a value` from `docker compose`.** There is no root `.env`, or the named variable's block is commented out in it. Copy `.env.example` or uncomment the block of the role you use.
- **The bridge exits with `OIDC_CLIENTS_FILE could not be read`.** The copy of the clients file was skipped and Docker Desktop created a directory of that name instead. Remove it with `rmdir heka-sso-service/env/oidc-clients.json`, copy the example again, and `docker compose up -d heka-sso-service`.
- **A port is already allocated.** A per-package Compose project or a host-run service holds it. The scopes are alternatives; stop the other one.
- **The identity web UI or SSO web UI shows the login page of the wrong provider, or an old demo DID.** Web UI values are baked into the image: rebuild it with `up -d --build <service>`.
- **Keycloak lost a user or a realm change after `up`.** The container was recreated and re-imported the committed realms. Keycloak keeps no volume in this stack; use `restart` to keep its data, or make the change in the realm files.
- **Testing the login flow with curl.** Keycloak sets its auth-session cookies with the `Secure` attribute; curl drops them over plain http while browsers accept them for `localhost`. Forward the `Set-Cookie` values by hand or use a browser.

## Production

Not this file. The root project ships dev secrets for every component. Production deployments use the per-package Compose files with real secrets and `NODE_ENV=production`, as each package's README describes.

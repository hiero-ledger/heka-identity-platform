# Keycloak realms

`docker-compose.dev.yml` starts Keycloak with `start-dev --import-realm`, which imports every file in this directory on every start. A realm that already exists in the Keycloak database is **not** overwritten; delete the `keycloak` container to re-import. Three realms are defined:

| File                        | Realm           | Purpose                                                                                                                                                                                            |
| --------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `realm-heka.json`           | `heka`          | The **OID4VP SSO demo**: identity provider `heka-sso` brokering to heka-sso-service, test relying party `heka-sso-web-ui`, login theme `heka`. Users are federated wallet holders.                       |
| `realm-heka-platform.json`  | `heka-platform` | The **OIDC provider for heka-identity-service** (platform-wide replacement of heka-auth-service; plan in [`docs/keycloak-replacement-for-auth-service.md`](../../docs/keycloak-replacement-for-auth-service.md)). Users are platform operators. |
| `realm-heka-wallet.json`    | `heka-wallet`   | The **OIDC provider for the Heka Wallet mobile app** (`ENABLE_EXTERNAL_AUTH`): public native client `heka-wallet`, self-registration, login theme `heka`. Users are wallet holders with a username and password.                        |

They are deliberately separate realms. A realm is Keycloak's isolation boundary for users, sessions, roles and settings, and the two populations must not share them: the platform realm hands every new user the `Admin` role through a default group, which must not apply to users brokered from a wallet; a single realm would also share the SSO cookie, so a password login into the platform UI would open the demo RP without a credential presentation and vice versa; and registration, password policy, email handling, theme and token lifetimes are realm-wide. The wallet realm is separate for the same reasons, plus one of its own: the `heka` realm only logs users in through the `heka-sso` broker, which requires presenting a credential from a wallet, so the wallet itself cannot authenticate against it. In a real deployment the `heka` realm stands in for a customer's IdP, while `heka-platform` and `heka-wallet` are Heka's own.

Everything in these files is **dev configuration**: the client secrets, the `demo` user password and the bootstrap admin (`admin` / `admin`, set in the compose file) must be replaced in any real deployment.

## What the `heka-platform` realm contains

| Item                                | Purpose                                                                                                                                                                                                                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client `heka-identity-service`      | Bearer-only resource server. Owns the client roles `Admin`, `OrgAdmin`, `OrgManager`, `OrgMember`, `Issuer`, `Verifier`, `User` and is the audience (`aud`) of accepted tokens. Never logs in.                                                                                                     |
| Client `heka-identity-web-ui`       | Public SPA client for heka-identity-service-web-ui: Authorization Code + PKCE (S256), refresh tokens, redirect URIs and web origins for `http://localhost:8000`.                                                                                                                                     |
| Client `heka-sso-service`           | Confidential client with a service account; heka-sso-service obtains its identity-service token with Client Credentials. Its service-account user holds the `Admin` role. Dev secret: `dev-only-heka-sso-service-secret-do-not-use-in-production`.                                               |
| Client `heka-demo`                  | Confidential client with a service account for the identity service's demo-token broker (`GET /demo/token`, enabled there with `DEMO_*`): the public demo pages of the web UI act as this account. Its service-account user has the fixed id `e5f6a7b8-c9d0-4e1f-a2b3-c4d5e6f7a8b9` (so `heka_uid`, and with it the demo tenant and DID, survive a re-import) and holds the `Admin` role. Dev secret: `dev-only-heka-demo-secret-do-not-use-in-production`. |
| Protocol mappers (on the three token-requesting clients) | Add the identity-service claim contract to tokens: `roles` (client roles of `heka-identity-service`, array), `org_id` (user attribute), `heka_uid` (the Keycloak user id, a copy of `sub`), and `aud: heka-identity-service`. Kept on the clients rather than in a custom client scope, see below. |
| Group `heka-users` (default group)  | Carries `heka-identity-service.Admin`. Every new user (self-registration included) joins it, so they can use the web UI as an administrator of their own tenant, which is what heka-auth-service did. See [Roles](#roles) before assigning any other role.                                          |
| Realm settings                      | Self-registration on; password policy `length(7) and upperCase(1) and lowerCase(1) and digits(1) and specialChars(1)` (the heka-auth-service rules); refresh-token rotation (`revokeRefreshToken`); login theme `heka` (shared with the demo realm, it is a plain username/password page with Heka branding). |
| User `demo` / `Password1234!`       | Dev-only account with a fixed id (`d3a1c2b4-5e6f-4a7b-8c9d-0e1f2a3b4c5d`), matching the demo user the web UI's `prepare-demo-user` script used to create in heka-auth-service. Member of `heka-users`.                                                                                                  |

The display name comes from the built-in `profile` scope (`name`, or `preferred_username` when no first/last name is set), which heka-identity-service reads through its default `OIDC_CLAIM_NAME` fallback list. No custom mapper is needed for it.

Why no custom client scope and no default-role composite: with `--import-realm`, a `clientScopes` array in the file suppresses the creation of Keycloak's built-in scopes (`profile`, `email`, `basic`, …), and a `roles.realm` array suppresses the built-in realm roles (`offline_access`, `uma_authorization`), which then breaks the import. Mappers on the clients and a default group give the same tokens without touching either section.

The `heka-sso` relationship differs per realm: in `heka` the bridge is an **identity provider** that Keycloak brokers to; in `heka-platform` heka-sso-service is a **client** that obtains tokens for calling heka-identity-service. If the platform UI should ever offer "Sign in with wallet", add the `heka-sso` identity provider to `heka-platform` as well; that does not require sharing users between the realms.

## What the `heka-wallet` realm contains

| Item                                     | Purpose                                                                                                                                                                                                                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client `heka-wallet`                     | Public native client for the mobile app (react-native-app-auth): Authorization Code + PKCE (S256), refresh tokens, redirect URI `com.heka.wallet.auth:/oauthredirect` (the `appAuthRedirectScheme` of the Android build). No secret, so token revocation on logout sends only `client_id`.         |
| Protocol mapper `user_id`                | Copies the Keycloak user id into a `user_id` claim in tokens and the userinfo response, which is the field the wallet's `UserInfo` type expects next to the built-in `name` and `email`.                                                                                                          |
| Realm settings                           | Self-registration on; the same password policy and refresh-token rotation as `heka-platform`; login theme `heka`.                                                                                                                                                                                 |
| User `wallet-demo` / `Password1234!`     | Dev-only account with a fixed id (`7c2e9f4a-1b3d-4e5f-8a6b-9c0d1e2f3a4b`).                                                                                                                                                                                                                        |

The wallet is configured through `OAUTH_STORE_CONFIG` in `heka-wallet/app/.env` (one line; the react-native-config parser does not support multi-line values):

```
OAUTH_STORE_CONFIG={"oauthConfig":{"clientId":"heka-wallet","redirectUrl":"com.heka.wallet.auth:/oauthredirect","scopes":["openid","profile","email"],"serviceConfiguration":{"authorizationEndpoint":"http://localhost:8080/realms/heka-wallet/protocol/openid-connect/auth","tokenEndpoint":"http://localhost:8080/realms/heka-wallet/protocol/openid-connect/token","revocationEndpoint":"http://localhost:8080/realms/heka-wallet/protocol/openid-connect/revoke"},"dangerouslyAllowInsecureHttpRequests":true},"userInfoEndpoint":"http://localhost:8080/realms/heka-wallet/protocol/openid-connect/userinfo","accountDeletionURL":"http://localhost:8080/realms/heka-wallet/account"}
```

The login page opens in the device browser, so `localhost` must reach the host: run `adb reverse tcp:8080 tcp:8080` for an Android emulator or a USB-connected device. `KC_HOSTNAME` pins the issuer to `http://localhost:8080`, so the endpoints above must not be rewritten to `10.0.2.2`. `dangerouslyAllowInsecureHttpRequests` is required because the dev Keycloak is plain `http`: without it AppAuth on Android aborts the token request with "only https connections are permitted", which crashes the app. Drop it for any `https` deployment.

## heka-identity-service settings

```
OIDC_ISSUER_URL=http://localhost:8080/realms/heka-platform
OIDC_AUDIENCE=heka-identity-service
```

The claim paths keep their defaults (`sub`, `roles`, `name,preferred_username,nickname`, `org_id`). When the identity service runs in a container, keep `OIDC_ISSUER_URL` at the browser-facing value and point `OIDC_JWKS_URI` at `http://host.docker.internal:8080/realms/heka-platform/protocol/openid-connect/certs` (see `heka-identity-service/docker-compose.dev.yml`).

`KC_HOSTNAME` is pinned to `http://localhost:8080` in `docker-compose.dev.yml`, so `iss` is the same string whether Keycloak is reached from the host or from a container. Change both `KC_HOSTNAME` and `OIDC_ISSUER_URL` together when deploying elsewhere.

## Roles

heka-identity-service derives the tenant from `(role, sub, org_id)` and requires **exactly one** Heka role per token. Because membership of `heka-users` grants `Admin`, a user who should hold another role must leave that group:

1. Users → the user → Groups → leave `heka-users`;
2. Role mapping → assign one client role of `heka-identity-service`;
3. for `OrgAdmin`, `OrgManager`, `OrgMember`, `Issuer`, `Verifier` set the user attribute `org_id` (Users → Attributes). `Admin` and `User` must **not** have `org_id`.

To stop handing out `Admin` by default, remove `/heka-users` from Realm settings → User registration → Default groups.

## Migrating users from heka-auth-service

`node export-users.mjs --target keycloak --in auth-users.json --out users.keycloak.json` in [`tools/heka-auth-user-export`](../../tools/heka-auth-user-export/README.md) (fed with a JSON dump of the retired service's `auth_user` table, see its README) writes a partial-import file: every account keeps its UUID as the Keycloak user id (which the `heka_uid` mapper copies into tokens, so the identity-service tenant is unchanged), gets the attribute `heka_uid`, its argon2id password hash in the form of the built-in `argon2` provider (`secretData` = hash and salt, `credentialData` = iterations, memory, parallelism, hash length, type `id`, version `1.3`), and either the `heka-users` group (`Admin`) or the matching client role of `heka-identity-service` plus the `org_id` attribute. `ifResourceExists` is `SKIP`, so re-running never overwrites.

Import it with an admin token (or Realm settings → Action → Partial import in the console):

```sh
TOKEN=$(curl -s -X POST http://localhost:8080/realms/master/protocol/openid-connect/token \
  -d client_id=admin-cli -d username=admin -d password=admin -d grant_type=password | jq -r .access_token)
curl -s -X POST http://localhost:8080/admin/realms/heka-platform/partialImport \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' --data-binary @users.keycloak.json
```

The response lists every user as `ADDED` or `SKIPPED`. Try one account first (`--user <name>`) and log in with it through the web UI; if the password is refused, export again with `--without-passwords` (the users then carry the `UPDATE_PASSWORD` required action and need a temporary password set by an administrator). Verified on 2026-09-21 against Keycloak 26.3: an imported user logged in with the old password and received a token with `heka_uid` equal to the original id and `roles: ["Admin"]`.

## Trying it out

Start Keycloak (the theme builder runs first and needs network access on the first run):

```sh
docker compose -f docker-compose.dev.yml up -d keycloak
```

Service-account token for heka-sso-service (Client Credentials):

```sh
curl -s -X POST http://localhost:8080/realms/heka-platform/protocol/openid-connect/token \
  -u heka-sso-service:dev-only-heka-sso-service-secret-do-not-use-in-production \
  -d grant_type=client_credentials
```

Demo service-account token (what the identity service's demo-token broker obtains when configured with `DEMO_TOKEN_URL=http://localhost:8080/realms/heka-platform/protocol/openid-connect/token`, `DEMO_CLIENT_ID=heka-demo`, `DEMO_CLIENT_SECRET=dev-only-heka-demo-secret-do-not-use-in-production`):

```sh
curl -s -X POST http://localhost:8080/realms/heka-platform/protocol/openid-connect/token \
  -u heka-demo:dev-only-heka-demo-secret-do-not-use-in-production \
  -d grant_type=client_credentials
```

User token: sign in through the web UI (phase 5), or open an Authorization Code + PKCE request for `heka-identity-web-ui` in the browser and log in as `demo`:

```
http://localhost:8080/realms/heka-platform/protocol/openid-connect/auth?client_id=heka-identity-web-ui&response_type=code&scope=openid%20profile&redirect_uri=http%3A%2F%2Flocalhost%3A8000%2F&code_challenge=<S256 challenge>&code_challenge_method=S256
```

Decode the access token (e.g. `jwt.io`) and check `aud` is `heka-identity-service`, `roles` is `["Admin"]`, `heka_uid` equals `sub`, and `preferred_username` is set. Such a token is accepted by heka-identity-service configured as above; this was verified against Keycloak 26.3 with both a Client Credentials token and a `demo` user token obtained through the code flow.

## Admin console

`http://localhost:8080/admin/` with `admin` / `admin`; pick the realm (`heka`, `heka-platform` or `heka-wallet`) in the top-left selector. Anything changed there is lost when the `keycloak` container is recreated unless it is exported back into the matching realm file.

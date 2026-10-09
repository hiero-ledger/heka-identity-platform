# Keycloak realms

`docker-compose.dev.yml` starts Keycloak with `start-dev --import-realm`, which imports every file in this directory on every start. A realm that already exists in the Keycloak database is **not** overwritten; delete the `keycloak` container to re-import. Three realms are defined:

| File                        | Realm           | Purpose                                                                                                                                                                                            |
| --------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `realm-heka.json`           | `heka`          | The **OID4VP SSO demo**: identity provider `heka-sso` brokering to heka-sso-service, test relying party `heka-sso-web-ui`, login theme `heka`. Users are federated wallet holders.                       |
| `realm-heka-platform.json`  | `heka-platform` | The **OIDC provider for heka-identity-service** (platform-wide replacement of heka-auth-service; plan in [`docs/keycloak-replacement-for-auth-service.md`](../../docs/keycloak-replacement-for-auth-service.md)). Users are platform operators. |
| `realm-heka-wallet.json`    | `heka-wallet`   | The **OIDC provider for the Heka Wallet mobile app** (`ENABLE_EXTERNAL_AUTH`): public native client `heka-wallet`, self-registration, login theme `heka`. Users are wallet holders with a username and password.                        |

They are deliberately separate realms. A realm is Keycloak's isolation boundary for users, sessions, roles and settings, and the two populations must not share them: the platform realm hands every new user a Heka role (`User`) through a default group, which must not apply to users brokered from a wallet; a single realm would also share the SSO cookie, so a password login into the platform UI would open the demo RP without a credential presentation and vice versa; and registration, password policy, email handling, theme and token lifetimes are realm-wide. The wallet realm is separate for the same reasons, plus one of its own: the `heka` realm only logs users in through the `heka-sso` broker, which requires presenting a credential from a wallet, so the wallet itself cannot authenticate against it. In a real deployment the `heka` realm stands in for a customer's IdP, while `heka-platform` and `heka-wallet` are Heka's own.

Everything in these files is **dev configuration**: the client secrets, the `demo` user password and the bootstrap admin (`admin` / `admin`, set in the compose file) must be replaced in any real deployment.

## What the `heka-platform` realm contains

| Item                                | Purpose                                                                                                                                                                                                                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client `heka-identity-service`      | Bearer-only resource server. Owns the client roles `Admin`, `OrgAdmin`, `OrgManager`, `OrgMember`, `Issuer`, `Verifier`, `User` and is the audience (`aud`) of accepted tokens. Never logs in.                                                                                                     |
| Client `heka-identity-web-ui`       | Public SPA client for heka-identity-service-web-ui: Authorization Code + PKCE (S256), refresh tokens, redirect URIs and web origins for `http://localhost:8000`.                                                                                                                                     |
| Client `heka-sso-service`           | Confidential client with a service account; heka-sso-service obtains its identity-service token with Client Credentials. Its service-account user holds `OrgAdmin` with the attribute `org_id` = `heka-sso`, so the SSO verifier and its signing DID live in the `Organization_heka-sso` wallet, not in the shared `Administration` wallet. `OrgAdmin` rather than `Verifier`, because with `ROLE_MODEL_ENABLED=true` only `Admin`, `OrgAdmin` and `Issuer` can create the signing DID. Dev secret: `dev-only-heka-sso-service-secret-do-not-use-in-production`.                                               |
| Client `heka-identity-admin`       | Confidential client with a service account; heka-identity-service uses it for [organization administration](../../heka-identity-service/docs/setup.md#organization-administration) (`ORG_ADMIN_*`). Its service-account user holds the `realm-management` roles `manage-users`, `view-users`, `view-clients`, `query-groups` and `manage-realm`; Keycloak 26.0 needs `manage-realm` to read organization members. Dev secret: `dev-only-heka-identity-admin-secret-do-not-use-in-production`. |
| Client `heka-demo`                  | Confidential client with a service account for the identity service's demo-token broker (`GET /demo/token`, enabled there with `DEMO_*`): the public demo pages of the web UI act as this account. Its service-account user has the fixed id `e5f6a7b8-c9d0-4e1f-a2b3-c4d5e6f7a8b9` (so `heka_uid`, and with it the demo tenant and DID, survive a re-import) and holds the `User` role: its token is handed out without login, so it must never be `Admin` (which would open the shared `Administration` wallet to anyone). Dev secret: `dev-only-heka-demo-secret-do-not-use-in-production`. |
| Protocol mappers (on the three token-requesting clients) | Add the identity-service claim contract to tokens: `roles` (client roles of `heka-identity-service`, array), `org_id` (user attribute), `heka_uid` (the Keycloak user id, a copy of `sub`), and `aud: heka-identity-service`. Kept on the clients rather than in a custom client scope, see below. |
| Group `heka-users` (default group)  | Carries `heka-identity-service.User`. Every new user (self-registration included) joins it and acts in their own `User_<id>` wallet, as heka-auth-service sign-ups did since #215. See [Managing roles](#managing-roles) before assigning any other role. |
| Group `heka-admins`                 | Carries `heka-identity-service.Admin`. Not a default group: platform operators are added to it explicitly. Every `Admin` acts in the one shared `Administration` wallet. |
| Organizations                       | Enabled (`organizationsEnabled`), with the organization `heka-sso` (attribute `heka_org_id` = `heka-sso`). The web UI client has the built-in `organization` scope as an optional scope and the mapper `heka organization` (Organization Membership with organization attributes, claim `heka_organization`). See [Organizations](#organizations). |
| Realm settings                      | Self-registration on; password policy `length(7) and upperCase(1) and lowerCase(1) and digits(1) and specialChars(1)` (the heka-auth-service rules); refresh-token rotation (`revokeRefreshToken`); login theme `heka` (shared with the demo realm, it is a plain username/password page with Heka branding). |
| User `demo` / `Password1234!`       | Dev-only account with a fixed id (`d3a1c2b4-5e6f-4a7b-8c9d-0e1f2a3b4c5d`), matching the demo user the web UI's `prepare-demo-user` script used to create in heka-auth-service. Member of `heka-users`, so a `User`. |
| User `admin` / `Password1234!`      | Dev-only platform operator with a fixed id (`a7d1e2f3-b4c5-4d6e-8f70-81a2b3c4d5e6`). Member of `heka-admins` only, so an `Admin`. |

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
OIDC_CLAIM_ORG_ID=heka_organization,org_id
OIDC_CLAIM_ORG_ID_FIELD=heka_org_id
```

The organization id comes from the organization chosen at login (`heka_organization`, its `heka_org_id` attribute), and otherwise from the `org_id` user attribute ([Organizations](#organizations)). The other claim paths keep their defaults (`sub`, `roles`, `name,preferred_username,nickname`). When the identity service runs in a container, keep `OIDC_ISSUER_URL` at the browser-facing value and point `OIDC_JWKS_URI` at `http://host.docker.internal:8080/realms/heka-platform/protocol/openid-connect/certs` (see `heka-identity-service/docker-compose.dev.yml`).

`KC_HOSTNAME` is pinned to `http://localhost:8080` in `docker-compose.dev.yml`, so `iss` is the same string whether Keycloak is reached from the host or from a container. Change both `KC_HOSTNAME` and `OIDC_ISSUER_URL` together when deploying elsewhere.

## Managing roles

heka-identity-service derives the tenant from `(role, sub, org_id)` and requires **exactly one** Heka role per token. Roles are managed here, in Keycloak.

Two kinds of administrator are involved:

| Who | What they can do | How they get it |
|---|---|---|
| **Heka `Admin`** | Acts as the platform in heka-identity-service (the shared `Administration` wallet). Gives no rights in Keycloak. | Membership of `heka-admins` |
| **Keycloak administrator** | Assigns roles: changes group membership, client roles and the `org_id` attribute of `heka-platform` users. | The master-realm admin (`KC_BOOTSTRAP_ADMIN_USERNAME` in the compose file), or a `heka-platform` user with the `realm-management` client role `realm-admin` |

A platform operator usually needs both. In the dev realm, `admin` in `heka-platform` (a Heka `Admin`) and `admin` in the master realm (the Keycloak administrator) are different accounts that happen to share a name.

**Delegation to organizations:** an `OrgAdmin` doesn't need Keycloak rights to manage the roles of their own organization's members. heka-identity-service offers `GET /organization/members` and `PUT /organization/members/{id}/role` (see [Organization administration](../../heka-identity-service/docs/setup.md#organization-administration)). It acts through the `heka-identity-admin` service account and enforces the rules: own organization only, organization roles only, not oneself, never an `Admin`.

### The first `Admin` and the operators

- **First `Admin`:** the realm import creates the dev operator `admin`, who is in `heka-admins`. In a real deployment, remove that account and add your operators to `heka-admins` instead: Users → the user → Groups → leave `heka-users`, join `heka-admins`. Self-registration never produces an `Admin`.
- **Keep at least two `Admin`s and at least two Keycloak administrators.** That way one person leaving doesn't lock the platform out.
- **Nobody changes their own role.** Keycloak doesn't prevent a realm administrator from editing their own group membership or role mappings, so treat this as an operating rule. To review role changes, enable admin events (Realm settings → Events → Admin events settings).

### Assigning a role

Every new user joins `heka-users` and so holds `User`. To give a user another role, **replace** that membership instead of adding to it, otherwise the token carries two roles and is rejected:

- **`Admin`:** Users → the user → Groups → leave `heka-users`, join `heka-admins`.
- **An organization role** (`OrgAdmin`, `OrgManager`, `OrgMember`, `Issuer`, `Verifier`):
  1. Groups → leave `heka-users`;
  2. Role mapping → assign that one client role of `heka-identity-service`;
  3. Attributes → set `org_id`.
- **Back to `User`:** remove the client role or leave `heka-admins`, join `heka-users`, and remove `org_id`.

`Admin` and `User` must **not** have `org_id`. The `org_id` value names the organization's wallet (`Organization_<org_id>`), so use one stable value per organization and never rename it.

### Organizations

The realm has Keycloak **Organizations** enabled, so organizations and their members are managed in Keycloak (Organizations in the admin console). This replaces the free-text `org_id` attribute for users who belong to an organization.

- **Create an organization** with:
  - a name and an alias;
  - at least one domain (Keycloak requires one; a placeholder such as `acme.invalid` works);
  - the attribute **`heka_org_id`**: the Heka organization id, which names the organization's wallet (`Organization_<heka_org_id>`).

  Set `heka_org_id` once and never change it. Keycloak's own organization id and the alias are not used for the wallet, so an organization can be renamed. When you move an existing organization from the `org_id` attribute, set `heka_org_id` to that old value (for migrated accounts, the deployment's `ORG_ID`) so its members keep their wallet. The realm ships the organization `heka-sso` (`heka_org_id` = `heka-sso`).
- **Add members** under the organization's Members tab. Their Heka role is still one client role of `heka-identity-service` (see [Assigning a role](#assigning-a-role)), and it applies in every organization the user is a member of. Different roles in different organizations aren't supported yet.
- **Login:**
  - The Web UI requests the `organization` scope. A member of **several** organizations gets a "Select an organization to proceed" page after entering their username, and the token carries only the one they chose.
  - The `heka organization` mapper on the web UI client emits it as `heka_organization: { "<alias>": { "heka_org_id": ["<id>"] } }`, which the identity service reads through `OIDC_CLAIM_ORG_ID` / `OIDC_CLAIM_ORG_ID_FIELD`.
  - Users in no organization are not asked, and keep using `org_id` (or none, for `Admin` and `User`).
  - To switch organization, sign out and sign in again.
- **Identity-first login:** with Organizations enabled, Keycloak asks for the username first and the password on a second page, for every user of the realm.
- **Service accounts** don't request the `organization` scope. The SSO service account keeps the `org_id` user attribute (`heka-sso`).

Verified on 2026-10-08 against Keycloak 26.0.7:
- a user who is an `Issuer` in two organizations chose each one in turn at login, and got `heka_organization` with that organization's `heka_org_id` only;
- `demo` (in no organization) logged in without a prompt and without an organization claim.

### When a change takes effect

A change applies with the user's **next access token**:
- **Access token lifetime:** 300 s, Keycloak's default; the realm doesn't override it.
- **Already-issued tokens** keep the old role until they expire, because heka-identity-service doesn't check revocation.
- **Refreshes** pick up the new role.
- **Service accounts** get it with the next Client Credentials grant.

A role change also moves the user to another wallet; the previous wallet keeps its data.

### Recovering access

- **No Heka `Admin` left:** a Keycloak administrator adds an operator to `heka-admins`.
- **No Keycloak administrator left:** create a temporary one in the master realm. Either restart Keycloak with `KC_BOOTSTRAP_ADMIN_USERNAME` / `KC_BOOTSTRAP_ADMIN_PASSWORD` set, which only takes effect when the master realm has no admin user, or run `kc.sh bootstrap-admin user`. Then use it to restore the regular administrators, and delete it.

### Applying the role defaults to a running Keycloak

`--import-realm` only imports a realm that doesn't exist yet. A Keycloak started with an older version of this file may still give `heka-users` (and so every self-registered user) `Admin`, have `Admin` on both service accounts, and lack Organizations. To bring it up to date, either:

- **Dev, no data to keep:** recreate the container, which re-imports the file: `docker compose -f docker-compose.dev.yml up -d --force-recreate keycloak`.
- **Keep the existing users:** in the admin console (`heka-platform` realm):
  1. **Groups:** create `heka-admins` with client role `heka-identity-service` → `Admin`. In `heka-users`, replace the `Admin` client role with `User`. Every member of `heka-users` becomes a `User` with their next token.
  2. **Operators:** move the real operators from `heka-users` to `heka-admins`.
  3. **Clients → `heka-sso-service` → Service account roles:** replace `Admin` with `OrgAdmin`. On the service-account user (Users → `service-account-heka-sso-service` → Attributes), set `org_id` = `heka-sso`.
  4. **Clients → `heka-demo` → Service account roles:** replace `Admin` with `User`.
  5. **Organizations:**
     - Realm settings → General: turn **Organizations** on.
     - Organizations: create `heka-sso`, with domain `heka-sso.invalid` and attribute `heka_org_id` = `heka-sso`.
     - Clients → `heka-identity-web-ui` → Client scopes: add `organization` as **Optional**.
     - Same client → Client scopes → the dedicated scope → Add mapper → By configuration → **Organization Membership**, with:
       - name `heka organization`;
       - token claim name `heka_organization`;
       - claim JSON type `JSON`;
       - multivalued on;
       - "Add organization attributes" on;
       - added to the ID token, the access token and userinfo.

After either path, decode a token of each service account and check the roles (see [Trying it out](#trying-it-out)). The SSO service and the demo pages then act in new wallets (`Organization_heka-sso` and `User_e5f6a7b8-…`). Prepare them again and update `IDENTITY_SERVICE_PUBLIC_VERIFIER_ID`, `IDENTITY_SERVICE_REQUEST_SIGNER_DID` and `REACT_APP_DEMO_USER_DID`.

## Migrating users from heka-auth-service

`node export-users.mjs --target keycloak --in auth-users.json --org-id <ORG_ID> --keep-admin <operator> --out users.keycloak.json` in [`tools/heka-auth-user-export`](../../tools/heka-auth-user-export/README.md) (fed with a JSON dump of the retired service's `auth_user` table, see its README) writes a partial-import file: every account keeps its UUID as the Keycloak user id (which the `heka_uid` mapper copies into tokens, so the identity-service tenant is unchanged), gets the attribute `heka_uid`, its argon2id password hash in the form of the built-in `argon2` provider (`secretData` = hash and salt, `credentialData` = iterations, memory, parallelism, hash length, type `id`, version `1.3`), and its role: the `heka-admins` group (`Admin`), the `heka-users` group (`User`), or the matching client role of `heka-identity-service` plus the `org_id` attribute (organization roles). Accounts registered through the web UI before #215 are usually still `Admin` in heka-auth-service; reassign every account that isn't a real operator to `User` before exporting. `ifResourceExists` is `SKIP`, so re-running never overwrites.

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

Decode the access token (e.g. `jwt.io`) and check `aud` is `heka-identity-service`, `roles` is `["User"]` for `demo` (`["Admin"]` for `admin`, `["OrgAdmin"]` plus `org_id: "heka-sso"` for the `heka-sso-service` service account), `heka_uid` equals `sub`, and `preferred_username` is set. Such a token is accepted by heka-identity-service configured as above; this was verified against Keycloak 26.3 with both a Client Credentials token and a `demo` user token obtained through the code flow.

## Admin console

`http://localhost:8080/admin/` with `admin` / `admin`; pick the realm (`heka`, `heka-platform` or `heka-wallet`) in the top-left selector. Anything changed there is lost when the `keycloak` container is recreated unless it is exported back into the matching realm file.

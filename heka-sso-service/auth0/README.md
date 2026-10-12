# Auth0 recipe for heka-identity-service

Auth0 as the OpenID Connect provider whose tokens heka-identity-service accepts (plan: [`docs/keycloak-replacement-for-auth-service.md`](../../docs/keycloak-replacement-for-auth-service.md), section 8.2). This folder is the Auth0 counterpart of [`../keycloak`](../keycloak/README.md):

| File                                 | Purpose                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `setup-tenant.sh`                    | Creates everything below in a tenant with the [Auth0 CLI](https://github.com/auth0/auth0-cli); re-runnable.              |
| `actions/post-login.js`              | Login Flow Action: adds the identity-service claims to user tokens and gives new users the default Heka role.            |
| `actions/credentials-exchange.js`    | Machine to Machine Flow Action: adds the same claims to Client Credentials tokens (heka-sso-service, demo-token broker). |
| `../test/unit/auth0-actions.spec.ts` | Unit tests for both Actions (run with `yarn test`).                                                                      |

Status: verified on 2026-09-21 against a live dev tenant. `setup-tenant.sh` created every item below; a Client Credentials token for `heka-sso-service` and a `demo` user token (password-realm grant enabled only for the check) both carried `aud`, `https://heka/roles: ["Admin"]`, `https://heka/name` and `https://heka/heka_uid`, and both were accepted by heka-identity-service configured as in [heka-identity-service settings](#heka-identity-service-settings). The Actions are also covered by unit tests. Note that a freshly deployed Action version can take a minute to become active; retry a failed login before debugging.

## Why the token looks different from Keycloak's

Auth0 access tokens with an API audience refuse private claims that are not namespaced, so the contract claims are `https://heka/roles`, `https://heka/name`, `https://heka/org_id` and `https://heka/heka_uid`, and the identity service is pointed at them with `OIDC_CLAIM_*`. `sub` is `auth0|<id>` (or `<client_id>@clients` for machine-to-machine tokens); the provider-independent Heka user id travels in `https://heka/heka_uid`, taken from `app_metadata.heka_uid` when present (migrated users) and from `user_id` otherwise. Auth0 issuers end with a slash (`https://<tenant>.<region>.auth0.com/`) and the discovery document lives at `<issuer>.well-known/openid-configuration`, which the identity service handles.

## What the tenant needs

| Item                                                     | Detail                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API `heka-identity-service`                              | Identifier `https://heka-identity` (the `aud` the identity service checks), RS256, offline access on (refresh tokens for the SPA). Token lifetime is capped by Auth0 at 30 days.                                                                                                                                                                                                                                  |
| Application `heka-identity-web-ui` (SPA)                 | Callback / logout URL `http://localhost:8000/`, web origin `http://localhost:8000`, grants `authorization_code` + `refresh_token`, refresh-token rotation on. Clients must send `audience=https://heka-identity`, otherwise Auth0 issues an opaque access token.                                                                                                                                                  |
| Application `heka-sso-service` (M2M)                     | Client Credentials, granted the API. Application metadata `heka_role=OrgAdmin`, `org_id=heka-sso` (`SSO_ORG_ID`), so the SSO verifier and its signing DID live in the `Organization_heka-sso` wallet and not in the shared `Administration` wallet. `OrgAdmin` rather than `Verifier`, because with `ROLE_MODEL_ENABLED=true` only `Admin`, `OrgAdmin` and `Issuer` can create the signing DID. `heka_uid` and `heka_name` can be added when needed. The credentials-exchange Action turns the metadata into claims.                                                                                                                                                                                                                       |
| Application `heka-demo` (M2M)                            | Client Credentials, granted the API; the identity service's demo-token broker (`GET /demo/token`, `DEMO_*` settings) hands its token to the web UI's public demo pages. Application metadata `heka_role=User` (its token is handed out without login, so it must never be `Admin`, which would open the shared `Administration` wallet to anyone), `heka_uid=e5f6a7b8-c9d0-4e1f-a2b3-c4d5e6f7a8b9` (the same id as the `heka-demo` service account in the Keycloak realm, so the demo tenant and DID are shared across providers), `heka_name=demo`. |
| Roles `Admin` … `User` (optional)                        | Auth0 roles with the Heka names. The post-login Action uses them when a user has exactly one; otherwise it falls back to `app_metadata.heka_role`, and finally to the default role, which it then stores in `app_metadata.heka_role`.                                                                                                                                                                             |
| Application `heka-identity-admin` (M2M)                 | Management API grant with `read:organizations`, `read:organization_members`, `read:organization_member_roles`, `create:organization_member_roles`, `delete:organization_member_roles`, `read:roles` and `read:users`, for heka-identity-service [organization administration](../../heka-identity-service/docs/setup.md#organization-administration) (`ORG_ADMIN_*`). |
| Organization `heka-sso`                                   | `metadata.heka_org_id = heka-sso`, database connection enabled. The SPA allows organization login (optional). See [Organizations](#organizations). |
| Action `heka-identity-claims` (post-login)               | Secrets `HEKA_AUDIENCE`, `HEKA_CLAIM_NAMESPACE`, `HEKA_DEFAULT_ROLE`. Only acts when the login requested the Heka API, so other flows in the tenant (e.g. the OID4VP SSO demo) are untouched. For a login through an organization, the role and `org_id` come from that membership.                                                                                                                                                                                                                     |
| Action `heka-identity-m2m-claims` (credentials-exchange) | Same secrets; denies the exchange when the application has no valid `heka_role`, when an organization role has no `org_id`, or when `Admin` / `User` has one.                                                                                                                                                                                                                                                                                                                                  |
| Database connection                                      | Username required (`requires_username`), so accounts migrated from heka-auth-service keep logging in by name; password policy `good` with minimum length 7 (closest to the heka-auth-service rule of 7+ characters with upper, lower, digit and symbol); sign-ups enabled.                                                                                                                                        |
| Tenant setting                                           | OIDC RP-Initiated Logout: end session endpoint discovery on, so `oidc-client-ts` can log out.                                                                                                                                                                                                                                                                                                                     |
| User `demo` (dev only)                                   | `demo` / `Password1234!`, `app_metadata.heka_uid = d3a1c2b4-5e6f-4a7b-8c9d-0e1f2a3b4c5d` (the same id as in the Keycloak realm, so the demo tenant is shared across providers), `heka_role = User`. |
| User `admin` (dev only)                                  | `admin` / `Password1234!`, `app_metadata.heka_uid = a7d1e2f3-b4c5-4d6e-8f70-81a2b3c4d5e6` (the same id as in the Keycloak realm), `heka_role = Admin`: the dev platform operator, and the only default account with `Admin`.                                                                                                                                                                                                              |

## Running the script

```sh
auth0 login --scopes create:organization_connections,create:organization_members,create:organization_member_roles,read:organization_member_roles   # interactive; pick the target tenant
./setup-tenant.sh                # from this folder; prints the settings for every component at the end
```

Environment overrides: `HEKA_AUDIENCE`, `HEKA_CLAIM_NAMESPACE`, `HEKA_DEFAULT_ROLE` (default `User`), `SSO_ORG_ID` (default `heka-sso`), `WEB_UI_ORIGIN`, `DB_CONNECTION`, `ACTION_RUNTIME` (default `node22`), `CREATE_DEMO_USER=false`.

Doing it by hand in the dashboard is the same list: Applications → APIs (create the API), Applications (SPA and the two M2M apps, authorize each M2M app for the API, set its Application Metadata), User Management → Roles, Actions → Library (create the two Actions from the files here, add the three secrets, deploy) and Actions → Flows (drag them into Login and Machine to Machine), Authentication → Database (Requires Username, password policy), Settings → Advanced → OIDC RP-Initiated Logout.

## heka-identity-service settings

```
OIDC_ISSUER_URL=https://<tenant>.<region>.auth0.com/
OIDC_AUDIENCE=https://heka-identity
OIDC_CLAIM_USER_ID=https://heka/heka_uid
OIDC_CLAIM_ROLES=https://heka/roles
OIDC_CLAIM_NAME=https://heka/name,name,nickname
OIDC_CLAIM_ORG_ID=https://heka/org_id
```

## Managing roles

The identity service requires exactly one Heka role per token and derives the tenant from `(role, user id, org_id)`. Roles are managed here, in Auth0.

Two kinds of administrator are involved:

| Who | What they can do | How they get it |
|---|---|---|
| **Heka `Admin`** | Acts as the platform in heka-identity-service (the shared `Administration` wallet). Gives no rights in Auth0. | `app_metadata.heka_role = Admin`, or the Auth0 role `Admin` |
| **Auth0 tenant administrator** | Assigns roles: edits users' `app_metadata` and Auth0 roles, and applications' metadata. | A member of the tenant in the Auth0 dashboard (Settings → Tenant Members) |

**Delegation to organizations:** an `OrgAdmin` doesn't need to be a tenant member to manage the roles of their own [organization](#organizations)'s members. heka-identity-service offers `GET /organization/members` and `PUT /organization/members/{id}/role` (see [Organization administration](../../heka-identity-service/docs/setup.md#organization-administration)). It acts through the `heka-identity-admin` M2M application and enforces the rules: own organization only, organization roles only, not oneself, never an `Admin`.

### The first `Admin` and the operators

- **First `Admin`:** `setup-tenant.sh` creates the dev operator `admin` with `heka_role = Admin`. In a real deployment, skip the dev users (`CREATE_DEMO_USER=false`) and give your operators `Admin` as described below. Sign-ups never get `Admin`: the post-login Action assigns `HEKA_DEFAULT_ROLE` (`User`).
- **Never set `HEKA_DEFAULT_ROLE` to `Admin`.** Every `Admin` acts in the one shared `Administration` wallet, so every new sign-up would act as the platform.
- **Keep at least two Heka `Admin`s and at least two tenant administrators.** That way one person leaving doesn't lock the platform out.
- **Nobody changes their own role.** Auth0 doesn't prevent a tenant administrator from editing their own `app_metadata`, so treat this as an operating rule. Role changes made through the dashboard or the Management API are recorded in the tenant logs (Monitoring → Logs).

### Assigning a role

The post-login Action takes the first of these that applies:

1. **Exactly one Auth0 role** with a Heka name (`Admin` … `User`; User Management → Users → the user → Roles);
2. **`app_metadata.heka_role`** on the user;
3. **`HEKA_DEFAULT_ROLE`**, which it then saves in `app_metadata.heka_role`.

Use one of the first two consistently. An Auth0 role silently overrides `app_metadata`, and a user with two Heka Auth0 roles falls back to `app_metadata`.

- **Change a user's role:** User Management → Users → the user → Details → `app_metadata`, for example `{ "heka_role": "Issuer", "heka_uid": "…", "org_id": "acme" }`. Keep `heka_uid` unchanged.
- **Organization roles** (`OrgAdmin`, `OrgManager`, `OrgMember`, `Issuer`, `Verifier`) also need `app_metadata.org_id`. `Admin` and `User` must not have it. The `org_id` value names the organization's wallet (`Organization_<org_id>`), so use one stable value per organization and never rename it.
- **Machine-to-machine applications** carry the role in their Application Metadata (`heka_role`, plus `org_id` for organization roles). The credentials-exchange Action refuses a token when the role is missing or invalid, when an organization role has no `org_id`, or when `Admin` / `User` has one.

### Organizations

Auth0 **Organizations** let one user belong to several organizations and have a role per membership. `setup-tenant.sh`:
- allows organization login on the SPA (`organization_usage: allow`), so logins without an organization keep working for `Admin` and `User`;
- creates the organization `heka-sso` with `metadata.heka_org_id = heka-sso`;
- enables the database connection for it.

- **Create an organization** (Organizations → Create) and set its metadata **`heka_org_id`**: the Heka organization id, which names the organization's wallet (`Organization_<heka_org_id>`). Set it once and never change it. When you move an existing organization from `app_metadata.org_id`, use that old value (for migrated accounts, the deployment's `ORG_ID`) so its members keep their wallet. Enable the database connection for the organization (Connections tab).
- **Add members** (Members tab) and give each membership **exactly one** organization role: `OrgAdmin`, `OrgManager`, `OrgMember`, `Issuer` or `Verifier`. Roles assigned to the user outside the organization don't apply to a login through it.
- **Login through the organization:** the Web UI sends `organization=<id or name>` when `REACT_APP_OIDC_ORGANIZATION` is set. The post-login Action then emits:
  - `https://heka/org_id` = the organization's `heka_org_id` (falling back to its Auth0 id `org_…`);
  - `https://heka/roles` = the membership's role.

  It **denies the login** when the membership has no organization role, has two Heka roles, or has `Admin` / `User`. Logins without an organization use `app_metadata` as before.

Machine-to-machine applications can't be organization members here; they keep `org_id` in their Application Metadata (`heka-sso-service`: `heka-sso`).

The Action logic is covered by unit tests (`heka-sso-service/test/unit/auth0-actions.spec.ts`). On 2026-10-08 `setup-tenant.sh` created the `heka-sso` organization on the dev tenant. Verified live on 2026-10-08 against the dev tenant, with a test user whose own `app_metadata.heka_role` was `User` and who was an `Issuer` member of `heka-sso`. The access tokens were signature-checked against the tenant JWKS.
- **Through the organization:** `https://heka/roles: ["Issuer"]`, `https://heka/org_id: "heka-sso"` (from the organization metadata), so the wallet is `Issuer_<uid>_in_Organization_heka-sso`.
- **Without the organization:** `["User"]` from `app_metadata`, with no `org_id`.
- **With a second Heka role on the membership:** the login was denied (`access_denied`, "Your membership of heka-sso needs exactly one of the roles …").

The organization needs the database connection enabled; without it, Auth0 refuses the login with "no connections enabled for the organization". Enabling it through the CLI needs the `create:organization_connections` scope (see the `auth0 login` command above).

### When a change takes effect

A change applies with the user's next access token: their next login or refresh, since the post-login Action runs again. Access tokens for the API live 3600 s. Tokens that were already issued keep the old role until they expire, because heka-identity-service doesn't check revocation. A role change also moves the user to another wallet; the previous wallet keeps its data.

### Recovering access

- **No Heka `Admin` left:** a tenant administrator sets `app_metadata.heka_role = Admin` on an operator.
- **No tenant administrator left:** this can only be solved through Auth0 support, so keep at least two tenant members.

Re-running `setup-tenant.sh` re-applies the role settings to an existing tenant: the Action secrets (including `HEKA_DEFAULT_ROLE`), the metadata of `heka-sso-service` and `heka-demo`, the API token lifetime (3600 s, so a role change reaches the identity service within an hour) and the dev users. Users who signed in while the default was `Admin` keep that persisted `app_metadata.heka_role`; reassign everyone who isn't a platform operator to `User`.

## Migrating users from heka-auth-service

`node export-users.mjs --target auth0 --in auth-users.json --org-id <ORG_ID> --keep-admin <operator> --out users.auth0.json` in [`tools/heka-auth-user-export`](../../tools/heka-auth-user-export/README.md) (fed with a JSON dump of the retired service's `auth_user` table, see its README) writes the bulk-import file with, per user: `user_id` = the old UUID (Auth0 stores it as `auth0|<uuid>`), `username`, `app_metadata: { heka_uid: <uuid>, heka_role: <role>, org_id? }`, and `custom_password_hash: { algorithm: "argon2", hash: { value: "<encoded argon2id hash>" } }`. Auth0 **requires an email per imported user**; heka-auth-service accounts have none, so the script synthesizes `<name>@heka.invalid` (`--email-domain` changes the domain) with `email_verified: false`. Login by username keeps working because the connection requires usernames; password reset only works once a real email is set.

Import with the CLI (User Management → Users → Import Users in the dashboard does the same); files are limited to 500 KB per job:

```sh
auth0 users import -c Username-Password-Authentication --users "$(cat users.auth0.json)" --upsert=false --email-results=false --no-input
auth0 api get jobs/<job id>          # until status is "completed"; summary lists inserted / failed
```

Try one account first (`--user <name>` on the export) and log in with it through the web UI. Verified on 2026-09-21 against the dev tenant: an imported user logged in with the old password (password-realm grant enabled only for the check), a wrong password was refused, and the access token carried `https://heka/heka_uid` equal to the original id and `https://heka/roles: ["Admin"]`.

## Checking a token

Machine-to-machine (values printed by the script):

```sh
curl -s -X POST https://<tenant>.<region>.auth0.com/oauth/token \
  -H 'content-type: application/json' \
  -d '{"grant_type":"client_credentials","client_id":"<M2M client id>","client_secret":"<secret>","audience":"https://heka-identity"}'
```

User token: sign in through the web UI (phase 5) or with `auth0 test token --audience https://heka-identity --scopes openid,profile` (opens a browser). Decode the access token and check `aud` contains `https://heka-identity`, `https://heka/roles` is `["User"]` for `demo` (`["Admin"]` for `admin`), `https://heka/heka_uid` and `https://heka/name` are set. Such a token is accepted by heka-identity-service configured as above.

## Limits to keep in mind

- Access tokens live at most 30 days; the one-year demo token of heka-auth-service has no equivalent. The public demo pages instead fetch a short-lived token of the `heka-demo` application from the identity service's demo-token broker (phase 6).
- There is no in-flow password change; the web UI offers Auth0's password-reset email or an account page instead (phase 5).
- Custom claims in access tokens must stay namespaced; do not rename them to bare `roles` / `name`.

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
| Application `heka-sso-service` (M2M)                     | Client Credentials, granted the API. Application metadata `heka_role=Admin` (plus `org_id`, `heka_uid`, `heka_name` when needed) is what the credentials-exchange Action turns into claims.                                                                                                                                                                                                                       |
| Application `heka-demo` (M2M)                            | Client Credentials, granted the API; the identity service's demo-token broker (`GET /demo/token`, `DEMO_*` settings) hands its token to the web UI's public demo pages. Application metadata `heka_role=Admin`, `heka_uid=e5f6a7b8-c9d0-4e1f-a2b3-c4d5e6f7a8b9` (the same id as the `heka-demo` service account in the Keycloak realm, so the demo tenant and DID are shared across providers), `heka_name=demo`. |
| Roles `Admin` … `User` (optional)                        | Auth0 roles with the Heka names. The post-login Action uses them when a user has exactly one; otherwise it falls back to `app_metadata.heka_role`, and finally to the default role, which it then stores in `app_metadata.heka_role`.                                                                                                                                                                             |
| Action `heka-identity-claims` (post-login)               | Secrets `HEKA_AUDIENCE`, `HEKA_CLAIM_NAMESPACE`, `HEKA_DEFAULT_ROLE`. Only acts when the login requested the Heka API, so other flows in the tenant (e.g. the OID4VP SSO demo) are untouched.                                                                                                                                                                                                                     |
| Action `heka-identity-m2m-claims` (credentials-exchange) | Same secrets; denies the exchange when the application has no valid `heka_role`.                                                                                                                                                                                                                                                                                                                                  |
| Database connection                                      | Username required (`requires_username`), so accounts migrated from heka-auth-service keep logging in by name; password policy `good` with minimum length 7 (closest to the heka-auth-service rule of 7+ characters with upper, lower, digit and symbol); sign-ups enabled.                                                                                                                                        |
| Tenant setting                                           | OIDC RP-Initiated Logout: end session endpoint discovery on, so `oidc-client-ts` can log out.                                                                                                                                                                                                                                                                                                                     |
| User `demo` (dev only)                                   | `demo` / `Password1234!`, `app_metadata.heka_uid = d3a1c2b4-5e6f-4a7b-8c9d-0e1f2a3b4c5d` (the same id as in the Keycloak realm, so the demo tenant is shared across providers), `heka_role = Admin`.                                                                                                                                                                                                              |

## Running the script

```sh
auth0 login                      # interactive; pick the target tenant
./setup-tenant.sh                # from this folder; prints the settings for every component at the end
```

Environment overrides: `HEKA_AUDIENCE`, `HEKA_CLAIM_NAMESPACE`, `HEKA_DEFAULT_ROLE`, `WEB_UI_ORIGIN`, `DB_CONNECTION`, `ACTION_RUNTIME` (default `node22`), `CREATE_DEMO_USER=false`.

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

## Roles and organizations

The identity service requires exactly one Heka role per token and derives the tenant from `(role, user id, org_id)`. With Auth0, choose one of:

- assign exactly one of the Auth0 roles `Admin` … `User` to the user (User Management → Users → Roles), or
- set `app_metadata.heka_role` (and `app_metadata.org_id` for org roles) on the user.

Users with neither get `HEKA_DEFAULT_ROLE` (`Admin`, what the web UI used to register with) on their next login, persisted in `app_metadata.heka_role`. Machine-to-machine applications carry the role in their Application Metadata.

## Migrating users from heka-auth-service

`node export-users.mjs --target auth0 --in auth-users.json --out users.auth0.json` in [`tools/heka-auth-user-export`](../../tools/heka-auth-user-export/README.md) (fed with a JSON dump of the retired service's `auth_user` table, see its README) writes the bulk-import file with, per user: `user_id` = the old UUID (Auth0 stores it as `auth0|<uuid>`), `username`, `app_metadata: { heka_uid: <uuid>, heka_role: <role>, org_id? }`, and `custom_password_hash: { algorithm: "argon2", hash: { value: "<encoded argon2id hash>" } }`. Auth0 **requires an email per imported user**; heka-auth-service accounts have none, so the script synthesizes `<name>@heka.invalid` (`--email-domain` changes the domain) with `email_verified: false`. Login by username keeps working because the connection requires usernames; password reset only works once a real email is set.

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

User token: sign in through the web UI (phase 5) or with `auth0 test token --audience https://heka-identity --scopes openid,profile` (opens a browser). Decode the access token and check `aud` contains `https://heka-identity`, `https://heka/roles` is `["Admin"]`, `https://heka/heka_uid` and `https://heka/name` are set. Such a token is accepted by heka-identity-service configured as above.

## Limits to keep in mind

- Access tokens live at most 30 days; the one-year demo token of heka-auth-service has no equivalent. The public demo pages instead fetch a short-lived token of the `heka-demo` application from the identity service's demo-token broker (phase 6).
- There is no in-flow password change; the web UI offers Auth0's password-reset email or an account page instead (phase 5).
- Custom claims in access tokens must stay namespaced; do not rename them to bare `roles` / `name`.

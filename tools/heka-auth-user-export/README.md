# heka-auth-service user export

heka-auth-service, the platform's former username/password authentication service, was retired in favour of a third-party OpenID Connect provider (plan: [`docs/keycloak-replacement-for-auth-service.md`](../../docs/keycloak-replacement-for-auth-service.md), sections 10 and 11). This tool turns the rows of its `auth_user` table into the import format of the provider, so migrated users keep their **id, username, role and password**. It is plain Node.js (22+) without dependencies, so it keeps working after the service and its database schema are gone.

## 1. Dump the users

From the heka-auth-service PostgreSQL database (defaults were `heka-auth-service` on port 5433, user `heka`), as a JSON array:

```sh
psql -h localhost -p 5433 -U heka -d heka-auth-service -At \
  -c "select coalesce(json_agg(json_build_object('id', id, 'name', name, 'role', role, 'password', password) order by created_at), '[]') from auth_user" \
  > auth-users.json
```

Any other way of producing `[{ "id", "name", "role", "password" }, ...]` works too (`password` is the encoded argon2 hash as stored, `$argon2id$v=19$m=65536,t=3,p=4$...`).

## 2. Decide who stays `Admin`, and check the plan

Every `Admin` acts in the one shared `Administration` wallet of heka-identity-service, and before #215 the web UI registered every account as `Admin`. The tool therefore refuses to export a dump that contains `Admin` accounts until you decide:

- `--keep-admin <name>` (repeatable) keeps the named platform operators as `Admin` and exports **every other `Admin` as `User`**. The heka-auth-service database itself is not changed, so it stays usable for a rollback.
- `--keep-all-admins` keeps every stored role.

`--report` prints what every account becomes and which wallet it acts in afterwards, without writing an import file:

```sh
node export-users.mjs --report --in auth-users.json --org-id <ORG_ID> --keep-admin <operator>
```

```
name      stored role  role            org_id  wallet after migration
--------  -----------  --------------  ------  ---------------------------------
operator  Admin        Admin                   Administration
alice     Admin        User (demoted)          User_b55d270b-…
doctor    Issuer       Issuer          acme    Issuer_c2780ffb-…_in_Organization_acme

3 account(s): Admin 1, OrgAdmin 0, OrgManager 0, OrgMember 0, Issuer 1, Verifier 0, User 1
Admin after migration (shared Administration wallet): operator
Demoted from Admin to User (start in an empty User_<id> wallet): 1
```

A demoted account starts in an empty `User_<id>` wallet. Its earlier data stays where it was: in `Administration_<id>` (deployments before #215) or in the shared `Administration` wallet.

## 3. Convert

```sh
node export-users.mjs --target keycloak --in auth-users.json --org-id <ORG_ID> --keep-admin <operator> --out users.keycloak.json
node export-users.mjs --target auth0    --in auth-users.json --org-id <ORG_ID> --keep-admin <operator> --out users.auth0.json
```

| Flag                  | Default        | Description |
| --------------------- | -------------- | ----------- |
| `--target`            | _(required)_   | `keycloak` (partial-import JSON with `ifResourceExists: SKIP`) or `auth0` (bulk-import JSON). Not needed with `--report`. |
| `--in`                | _(required)_   | The JSON dump, or `-` for stdin. |
| `--keep-admin`        | —              | Repeatable. The accounts that stay `Admin`; every other `Admin` is exported as `User`. Each name must be a stored `Admin`. |
| `--keep-all-admins`   | off            | Keep every stored role. One of `--keep-admin` and `--keep-all-admins` is required when the dump contains `Admin` accounts. |
| `--report`            | off            | Print the migration plan (role, org id and wallet per account) instead of an import file. |
| `--out`               | _(stdout)_     | Output file. |
| `--org-id`            | `ORG_ID`       | `org_id` given to users with an organization role (`OrgAdmin`, `OrgManager`, `OrgMember`, `Issuer`, `Verifier`): heka-auth-service put its single `ORG_ID` setting into their tokens. |
| `--user`              | _(all users)_  | Export or report a single account, e.g. to verify the import with one user first. The `Admin` policy is still checked against the whole dump. |
| `--without-passwords` | off            | Leave the password hashes out. Keycloak users then get the `UPDATE_PASSWORD` required action; on both providers an administrator has to set a temporary password or trigger a reset. |
| `--email-domain`      | `heka.invalid` | Auth0 only: domain of the synthesized e-mail addresses (Auth0 requires one per user; heka-auth-service accounts had none). |

What the files contain, per user:
- **User id:** the original UUID, as the provider's user id **and** as `heka_uid` (Keycloak: user attribute; Auth0: `app_metadata.heka_uid`). heka-identity-service therefore derives the same tenant as before, and existing schemas and DIDs stay reachable.
- **Role, after the `Admin` policy:**
  - Keycloak: `Admin` users join the `heka-admins` group, `User` accounts the `heka-users` default group, and organization roles become the matching client role of `heka-identity-service` with an explicitly empty group list. Each user ends up with exactly one Heka role.
  - Auth0: `app_metadata.heka_role`.
- **Password:** the argon2id hash. Keycloak gets it split into `secretData` / `credentialData` for its built-in `argon2` provider; Auth0 gets the encoded string as `custom_password_hash`.

Organizations: migrated organization members keep `org_id` = `ORG_ID` as a user attribute (Keycloak) or in `app_metadata` (Auth0). The identity service reads it as the fallback organization claim, so they keep their wallet. Neither Keycloak's partial import nor Auth0's bulk import can carry organization memberships. To move them into the provider's Organizations afterwards:
1. Create the organization with `heka_org_id` = `ORG_ID`.
2. Add the members.
3. On Keycloak, the `org_id` attribute can then be removed.

## 4. Import

- **Keycloak** (realm `heka-platform`): `POST /admin/realms/heka-platform/partialImport` with the file as body and an admin token, or Realm settings → Action → Partial import in the console. Existing usernames are skipped. Details in [`heka-sso-service/keycloak/README.md`](../../heka-sso-service/keycloak/README.md#migrating-users-from-heka-auth-service).
- **Auth0**: `auth0 users import -c Username-Password-Authentication --users "$(cat users.auth0.json)" --upsert=false --email-results=false --no-input`, then poll the job with `auth0 api get jobs/<id>`. Files are limited to 500 KB per job. Details in [`heka-sso-service/auth0/README.md`](../../heka-sso-service/auth0/README.md#migrating-users-from-heka-auth-service).

Try one account first (`--user <name>`) and log in with it through the web UI. Verified on 2026-09-21 with one account on each provider: the imported user logged in with the old password, a wrong password was refused, and the access token carried the original id as `heka_uid` and the stored role.

A Keycloak partial import doesn't add users to the realm's default group `heka-users`; they get only the groups listed in the file. This was verified on 2026-10-08 against the local Keycloak.

## 5. Verify

`verify-import.mjs` checks every imported account against the same plan. Each must carry exactly one Heka role, the planned one, its original id as `heka_uid`, and the planned `org_id`, so that it acts in the planned wallet. Pass the same dump, `--org-id` and `Admin` flags as for the export. The command exits with `1` on any mismatch.

```sh
# Keycloak: master-realm admin; uses the admin API's example access token, so no user password is needed
KEYCLOAK_ADMIN_USERNAME=admin KEYCLOAK_ADMIN_PASSWORD=... \
  node verify-import.mjs --target keycloak --in auth-users.json --org-id <ORG_ID> --keep-admin <operator> \
  [--keycloak-url http://localhost:8080] [--realm heka-platform] [--client heka-identity-web-ui]

# Auth0: Management API token with read:users and read:roles; reads app_metadata and the Auth0 roles of auth0|<id>
AUTH0_MGMT_TOKEN=... node verify-import.mjs --target auth0 --in auth-users.json --org-id <ORG_ID> --keep-admin <operator> \
  --auth0-domain <tenant>.<region>.auth0.com
```

```
OK        operator -> Administration
OK        alice -> User_b55d270b-…
MISMATCH  doctor: token carries 2 Heka roles (User, Issuer), exactly one is required; role is missing, planned Issuer

2 of 3 account(s) match the migration plan
```

For Auth0, the check mirrors the post-login Action: exactly one Auth0 role with a Heka name overrides `app_metadata.heka_role`, and a user with neither is reported, because they would only get `HEKA_DEFAULT_ROLE` at their next login.

Rehearsed on 2026-10-08 against the local Keycloak with a synthetic dump: three `Admin`s of which one was kept, plus an `OrgAdmin`, an `Issuer` and a `User`.
- The guard refused the export without an `Admin` policy.
- The report, export and import added all six accounts, and `verify-import` matched 6 of 6.
- Verifying against a different policy, and adding an `Issuer` to `heka-users`, were both reported as mismatches with exit code `1`.

The Auth0 path of `verify-import` is covered by unit tests only.

## Tests

```sh
node --test
```

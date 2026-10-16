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

## 2. Convert

```sh
node export-users.mjs --target keycloak --in auth-users.json --out users.keycloak.json
node export-users.mjs --target auth0 --in auth-users.json --out users.auth0.json
```

| Flag                  | Default        | Description                                                                                                                                                                              |
| --------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--target`            | _(required)_   | `keycloak` (partial-import JSON with `ifResourceExists: SKIP`) or `auth0` (bulk-import JSON).                                                                                             |
| `--in`                | _(required)_   | The JSON dump, or `-` for stdin.                                                                                                                                                         |
| `--out`               | _(stdout)_     | Output file.                                                                                                                                                                             |
| `--org-id`            | `ORG_ID`       | `org_id` given to users with an organization role (`OrgAdmin`, `OrgManager`, `OrgMember`, `Issuer`, `Verifier`): heka-auth-service put its single `ORG_ID` setting into their tokens.    |
| `--user`              | _(all users)_  | Export a single account, e.g. to verify the import with one user first.                                                                                                                  |
| `--without-passwords` | off            | Leave the password hashes out. Keycloak users then get the `UPDATE_PASSWORD` required action; on both providers an administrator has to set a temporary password or trigger a reset.     |
| `--email-domain`      | `heka.invalid` | Auth0 only: domain of the synthesized e-mail addresses (Auth0 requires one per user; heka-auth-service accounts had none).                                                               |

What the files contain, per user: the original UUID as the provider's user id **and** as `heka_uid` (Keycloak: user attribute; Auth0: `app_metadata.heka_uid`), so heka-identity-service derives the same tenant as before and existing schemas and DIDs stay reachable; the role (Keycloak: `Admin` users join the `heka-users` default group, other roles become the matching client role of `heka-identity-service`; Auth0: `app_metadata.heka_role`); and the argon2id password hash (Keycloak: split into `secretData` / `credentialData` for its built-in `argon2` provider; Auth0: the encoded string as `custom_password_hash`).

## 3. Import

- **Keycloak** (realm `heka-platform`): `POST /admin/realms/heka-platform/partialImport` with the file as body and an admin token, or Realm settings → Action → Partial import in the console. Existing usernames are skipped. Details in [`heka-sso-service/keycloak/README.md`](../../heka-sso-service/keycloak/README.md#migrating-users-from-heka-auth-service).
- **Auth0**: `auth0 users import -c Username-Password-Authentication --users "$(cat users.auth0.json)" --upsert=false --email-results=false --no-input`, then poll the job with `auth0 api get jobs/<id>`; files are limited to 500 KB per job. Details in [`heka-sso-service/auth0/README.md`](../../heka-sso-service/auth0/README.md#migrating-users-from-heka-auth-service).

Try one account first (`--user <name>`) and log in with it through the web UI. Verified on 2026-09-21 with one account on each provider: the imported user logged in with the old password, a wrong password was refused, and the access token carried the original id as `heka_uid` and the role `Admin`.

## Tests

```sh
node --test
```

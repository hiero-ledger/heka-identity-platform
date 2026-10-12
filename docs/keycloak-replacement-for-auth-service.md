# Replacing heka-auth-service with a third-party OIDC provider (Keycloak, Auth0, …)

Status: research + plan, 2026-09-21 (revised the same day). Phase 1 (identity service) implemented on 2026-09-21; see section 13.

## 0. Decision

- heka-auth-service is **retired**; there is no dual-mode period with it. It stays in the repo only until the web UI and the SSO service have been switched, then it is removed.
- Authentication moves to **any standards-compliant OIDC provider**. Keycloak and Auth0 are the two profiles that will be configured and verified first; the design must not depend on either.
- The provider is selected **per deployment via environment variables**. Switching from Keycloak to Auth0 (or back) is a configuration change plus a user migration, not a code change.
- Technical path: Authorization Code + PKCE with a generic OIDC client (`oidc-client-ts` / `react-oidc-context`) in the web UI, Client Credentials in the SSO service, JWKS/discovery-based verification with **configurable claim paths** in the identity service, users migrated with a **stable Heka user id** carried as a claim so tenants survive a provider switch.

Sections 1–3 are the analysis of the current state; 4–13 are the design and plan.

## 1. Verdict

Feasible with no loss of user-visible capability. Compared with the Keycloak-only plan, the provider-agnostic version adds three requirements and removes one:

1. **Claim names differ per provider.** Keycloak can emit `roles`, `name`, `org_id` verbatim; Auth0 refuses non-namespaced private claims in access tokens that carry an API audience, so they arrive as `https://<ns>/roles` etc. The identity service therefore reads its claims through configurable paths instead of fixed names.
2. **`sub` differs per provider** (`<uuid>` in Keycloak, `auth0|<id>` in Auth0). Tenant identity is derived from the user id, so a provider switch would orphan every tenant unless the identity service identifies users by a provider-independent claim. The plan introduces one (`heka_uid`) that every provider maps from a user attribute.
3. **Provider quirks live in the UI**: sign-up entry point, password change, logout details and extra authorize parameters (Auth0 `audience`). These are isolated in a small per-provider profile; the OIDC core is shared.
4. **The one-year demo token is not portable** (Auth0 caps access tokens at 30 days). The demo pages get their token from a small server-side broker instead of a build-time constant.

Everything else is standard OIDC and identical across providers.

## 2. What heka-auth-service does today

Source: `heka-auth-service/src`. NestJS + MikroORM + Postgres, port 3004.

### 2.1 API surface

| Endpoint | Auth | Behaviour |
|---|---|---|
| `POST /api/v1/oauth/token` | none | Username + password → `{ access, refresh, token_type, expires_in }`. JSON body, custom field names. |
| `POST /api/v1/oauth/refresh` | Bearer | Refresh JWT must exist in DB and be bound to the presented access token. Old pair revoked, new pair issued. Demo user: pair returned unchanged. |
| `POST /api/v1/oauth/revoke` | Bearer | Revokes both tokens. Demo user: no-op. |
| `POST /api/v1/user/register` | none | `{ name, password, role? }`. Policy: ≥7 chars, upper, lower, digit, symbol. The web UI always sends `role: 'Admin'`. No email. |
| `POST /api/v1/user/password/change-request` + `…/change` | none | Old password → one-time token → new password. Sessions not invalidated. |
| `GET /api/v1/user/profile` | Bearer | `{ name }`. |
| `GET /health` | none | Terminus probe. |

### 2.2 Token contract consumed by heka-identity-service

HS256 JWT signed with shared `JWT_SECRET`; `iss` = `Heka`, `aud` = `Heka Identity Service`, `sub` = user UUID, `roles: [<one role>]`, `name`, optional `org_id`, `type: "access"`. Lifetime 1 h, ~1 year for `DEMO_USER`. Tokens are persisted and revocable in heka-auth-service only; the identity service never checks revocation.

### 2.3 Data

`auth_user(id uuid, name unique, password argon2id, role)` with roles `Admin, OrgAdmin, OrgManager, OrgMember, Issuer, Verifier, User`. Password hashes: Node `argon2` defaults (argon2id, v=19, m=65536, t=3, p=4). **No email addresses.**

## 3. Who depends on it

### 3.1 heka-identity-service-web-ui

`src/shared/api/config/{api,endpoints}.ts`, `src/shared/api/utils/token.ts`, `src/entities/User/model/services/{signIn,signUp,signOut,getProfile,changePassword}.ts`, `src/pages/{SignIn,SignUp,Profile}`, `src/const/user.ts`, `scripts/prepare-demo-user.ts`. Own sign-in/sign-up/change-password forms; tokens in `localStorage`; axios 401 interceptor refreshes once under a mutex; profile shows `name`; demo pages use a build-time token (`REACT_APP_DEMO_USER_ACCESS_TOKEN`) produced by `prepare-demo-user.ts`. The UI never inspects token contents.

### 3.2 heka-sso-service

One touchpoint: `src/oidc/identity-service-token.provider.ts` logs a service account into heka-auth-service, caches the access token and re-acquires it before expiry; used by `verification-session.client.ts` and `identity-service-events.client.ts`. `IDENTITY_SERVICE_AUTH_TOKEN` is a static override for tests. Config validation lives in `oidc.config.ts`. The bridge already runs Keycloak 26.3 in `docker-compose.dev.yml` with `keycloak/realm-heka.json` (the OID4VP SSO demo realm), and heka-sso-web-ui already supports both Keycloak and Auth0 as brokering IdPs.

### 3.3 heka-identity-service (resource server)

`src/config/jwt.ts`, `src/common/auth/{jwt.strategy,auth.service,token-payload.interface,auth-info.interface}.ts`, `src/utils/auth/index.ts`, `src/common/notification/notification.gateway.ts`. Static HS256 secret; `iss`/`aud` exact match; payload must have `sub`, `roles` (exactly one, known), `name`, optional `org_id`. Wallet id is derived from `(roles[0], sub, org_id)` and a `user` row keyed by `sub` (`varchar(255)`) is auto-provisioned. The WebSocket gateway verifies tokens manually with the same secret.

### 3.4 Other references

Root `README.md` (architecture diagram), `heka-identity-service/README.md` and `docs/{setup,demo-flow}.md`, `heka-identity-service-web-ui/README.md`, `heka-sso-service/README.md` + `env/.env.example`, `.github/workflows/heka-auth-service-{verify,publish}.yml`. heka-wallet, heka-sso-web-ui and `demo/` do not reference it.

## 4. Design principles for provider independence

| Concern | Standard across providers (shared code) | Provider-specific (config or profile) |
|---|---|---|
| Discovery, JWKS, signature, `iss`, `exp` | OIDC discovery `/.well-known/openid-configuration`, RS256 | issuer URL |
| `aud` | RFC 7519 | value: Keycloak audience mapper value; Auth0 API identifier |
| Authorization Code + PKCE, refresh, logout | `oidc-client-ts` | extra authorize params (Auth0 `audience`), logout URL discovery toggle, allowed URLs |
| Client Credentials | RFC 6749 §4.4 | Auth0 needs `audience` in the request |
| **Claim names** | none — this is the main divergence | claim paths for user id, roles, name, org id |
| Sign-up entry | none | Keycloak registration page; Auth0 `screen_hint=signup` |
| Password change | none | Keycloak AIA `kc_action=UPDATE_PASSWORD`; Auth0 password-reset email or account page |
| Long-lived tokens | none | Keycloak per-client lifespan; Auth0 ≤ 30 days |
| Password hash import | none | Keycloak partial import; Auth0 bulk import (`custom_password_hash`, requires email) |

Two rules follow:

1. **The identity service defines the claim *contract*, not the claim *names*.** Contract: a stable user id, exactly one Heka role, a display name, an optional org id, and an audience. Names and JSON paths are configuration.
2. **Everything provider-specific is data**, either environment variables or a tiny provider profile object in the web UI. No `if (provider === 'auth0')` in business logic.

## 5. heka-identity-service: generic OIDC resource server

### 5.1 Configuration (replaces the `JWT_*` block)

| Variable | Default | Description |
|---|---|---|
| `OIDC_ISSUER_URL` | required | Exact `iss` value, e.g. `http://localhost:8080/realms/heka-platform` or `https://<tenant>.eu.auth0.com/` (Auth0 issuers end with a slash). Discovery is fetched from `${OIDC_ISSUER_URL}/.well-known/openid-configuration`. |
| `OIDC_JWKS_URI` | from discovery | Override for air-gapped or test setups. |
| `OIDC_AUDIENCE` | required | Accepted `aud` value (array `aud` accepted if it contains it). |
| `OIDC_ALGORITHMS` | `RS256` | Allowed signature algorithms. HMAC algorithms are never allowed. |
| `OIDC_CLAIM_USER_ID` | `sub` | Path of the stable user id claim. Recommended: the `heka_uid` custom claim (5.3). |
| `OIDC_CLAIM_ROLES` | `roles` | Path of the roles claim (string or array). |
| `OIDC_CLAIM_NAME` | `name,preferred_username,nickname` | Ordered fallback list of display-name claims. |
| `OIDC_CLAIM_ORG_ID` | `org_id` | Path of the org id claim. |
| `OIDC_CLOCK_TOLERANCE` | `15` | Seconds, same convention as heka-sso-service. |

A claim path is resolved as a literal top-level key first (so URL-style names such as `https://heka.example/roles` work as-is), then as a JSON pointer when it starts with `/` (`/realm_access/roles`, `/https:~1~1heka.example~1roles`), otherwise as a dotted path (`realm_access.roles`). Startup logs issuer, audience, key source and the resolved claim paths; discovery is fetched lazily on the first token and retried on failure, and a discovery/JWKS failure surfaces as a server error rather than a `401`.

Optional, not in phase 1: `OIDC_TRUSTED_ISSUERS` as a JSON array of `{ issuerUrl, audience, claims }` objects to accept two providers at once during a provider switch. The verifier design below already keys everything by issuer, so this is additive.

### 5.2 Verification

One `TokenVerifier` in `src/common/auth/`, built on `jose` (`createRemoteJWKSet` + `jwtVerify` with `issuer`, `audience`, `algorithms`, `clockTolerance`). Both entry points use it: the passport strategy (replace `passport-jwt` with a thin guard, which also removes the `getSafeStrategyOptions` workaround) and `NotificationGateway.validateRequestToken`. `@nestjs/jwt` and `passport-jwt` are dropped.

Claim extraction (`ClaimMapper`) turns the verified payload into today's `TokenPayload` shape (`sub`, `roles`, `name`, `org_id`), so `AuthService.validateTokenPayload`, `getWalletId`, `@Roles` and the tenant interceptor stay untouched. Rules:

- roles: read the configured path; accept a string or array; keep only values that are known Heka roles; **exactly one must remain**, else 401. This tolerates provider noise (Keycloak default roles, Auth0 permissions) without weakening the single-role invariant.
- name: first non-empty claim from the fallback list; last resort is the user id.
- user id: configured path; must be a non-empty string ≤ 255 chars.

### 5.3 Stable user id across providers

Introduce a custom claim **`heka_uid`** (namespaced for Auth0) whose value is the Heka user id: the original `auth_user.id` UUID for migrated users, and the provider's own user id for users created after migration. Each provider maps it from a user attribute (`heka_uid` attribute in Keycloak, `app_metadata.heka_uid` in Auth0); the identity service is configured with `OIDC_CLAIM_USER_ID` pointing at it. Result: wallets, DIDs and credentials follow the user across providers, and the provider's `sub` format is irrelevant.

If a deployment prefers plain `sub`, it works too; a later provider switch then starts every user in a fresh tenant.

### 5.4 Tests and docs

- Test helper: generate an RS256 keypair per run, sign tokens with it, and inject the JWK set into the verifier (test override) or serve it from an in-process HTTP stub; replace `test/helpers/jwt.ts` accordingly. Run the existing auth tests with a Keycloak-shaped payload and an Auth0-shaped payload (namespaced claims, `aud` array, `auth0|` subject).
- Negatives: HS256 token, wrong `iss`, wrong `aud`, unknown `kid`, zero or two known roles, missing user id claim.
- `docs/setup.md`: replace the "Authentication (JWT)" section with the table above plus one "claim recipe" per provider (section 8).

## 6. heka-identity-service-web-ui: generic OIDC client with provider profiles

### 6.1 Structure

```
src/shared/auth/
  session.ts               AuthSession contract, context, useAuthSession()
  OidcAuthProvider.tsx     react-oidc-context configured from env + profile; bridges to AuthSession
  profiles/
    index.ts               resolves REACT_APP_AUTH_PROVIDER → profile
    keycloak.ts            quirks for Keycloak
    auth0.ts               quirks for Auth0
    generic.ts             no quirks (any other OIDC provider)
```

`AuthSession` (same idea as `heka-sso-web-ui/src/auth/session.ts`, extended for an app that calls an API):

```ts
interface AuthSession {
  isAuthenticated: boolean
  isLoading: boolean
  error?: string
  userName?: string                          // from ID-token claims via the profile's nameClaims
  getAccessToken(): Promise<string | null>
  signIn(): void                             // signinRedirect()
  signUp?(): void                            // present only if the profile has a sign-up entry
  changePassword?(): void                    // present only if the profile has one
  signOut(): void                            // signoutRedirect()
}
```

A **provider profile** is a plain object, no SDK:

```ts
interface ProviderProfile {
  extraAuthorizeParams?: Record<string, string>      // auth0: { audience }
  signUp?: (auth) => void                            // keycloak: signinRedirect({ extraQueryParams: { kc_action: 'register' } }) or the /registrations URL
                                                     // auth0:    signinRedirect({ extraQueryParams: { screen_hint: 'signup' } })
  changePassword?: (auth, claims) => void            // keycloak: signinRedirect({ extraQueryParams: { kc_action: 'UPDATE_PASSWORD' } })
                                                     // auth0:    open REACT_APP_AUTH_ACCOUNT_URL, or trigger the reset-password email flow
  nameClaims: string[]                               // ['preferred_username','name'] / ['nickname','name','email']
}
```

### 6.2 Wiring

- `api.ts`: request interceptor takes the token from the session (demo token fallback for the demo pages, see section 9); the 401 handler tries one `signinSilent()` (refresh-token based) under the existing mutex, retries once, otherwise signs out. The auth-service axios instance and `authEndpoints` are deleted.
- Redux `userSlice`: `data.tokens` removed; `getUserIsSignedIn` / `getUserName` come from the session; `signIn/signUp/signOut/getProfile/changePassword` thunks and `token.ts` are deleted or reduced to demo-token helpers.
- Pages: `SignIn` becomes a "Sign in" screen with one button (and "Create account" only if `signUp` exists); `SignUp` page is removed; `Profile` shows "Change password" only if `changePassword` exists. Routes: `/sign-up` redirects to `/sign-in`.
- `Router.tsx` is wrapped in `<OidcAuthProvider>`; the redirect callback is handled like heka-sso-web-ui's `onSigninCallback`.
- Refresh tokens instead of iframe silent renew: request `offline_access` (Auth0 requires it; Keycloak issues refresh tokens by default) and enable rotation on the provider. Storage: `oidc-client-ts` default (sessionStorage).

### 6.3 Configuration

| Variable | Description |
|---|---|
| `REACT_APP_AUTH_PROVIDER` | `keycloak` \| `auth0` \| `generic` — selects the profile only. |
| `REACT_APP_OIDC_AUTHORITY` | Issuer URL (discovery base). |
| `REACT_APP_OIDC_CLIENT_ID` | Public SPA client. |
| `REACT_APP_OIDC_SCOPE` | Default `openid profile offline_access`. |
| `REACT_APP_OIDC_AUDIENCE` | Auth0 API identifier (sent as `audience`); ignored by Keycloak. |
| `REACT_APP_AUTH_ACCOUNT_URL` | Optional account/password page for profiles without an in-flow password change. |
| `REACT_APP_DEMO_TOKEN_URL` | Demo-token broker endpoint (section 9). |

`REACT_APP_AUTH_SERVICE_ENDPOINT` and `REACT_APP_DEMO_USER_*_TOKEN` are removed.

Alternative considered: one vendor SDK per provider as heka-sso-web-ui does (`@auth0/auth0-react`). Rejected for this app because the profile object is a few lines and a third provider then needs no new dependency; the sso-web-ui pattern can still be adopted for the `AuthSession` bridge itself.

## 7. heka-sso-service: generic Client Credentials

`IdentityServiceTokenProvider.login()` posts `grant_type=client_credentials` (form-encoded, HTTP Basic client auth) to `IDENTITY_SERVICE_TOKEN_URL` and reads `access_token` / `expires_in`; caching and re-acquire logic unchanged.

| Variable | Description |
|---|---|
| `IDENTITY_SERVICE_TOKEN_URL` | Provider token endpoint. |
| `IDENTITY_SERVICE_CLIENT_ID` / `IDENTITY_SERVICE_CLIENT_SECRET` | Confidential client with a service account. |
| `IDENTITY_SERVICE_TOKEN_PARAMS` | Optional extra form fields as JSON, e.g. `{"audience":"https://heka-identity"}` for Auth0; `scope` if the provider needs it. |
| `IDENTITY_SERVICE_AUTH_TOKEN` | Static override for tests (kept). |

`AUTH_SERVICE_BASE_URL`, `IDENTITY_SERVICE_AUTH_NAME`, `IDENTITY_SERVICE_AUTH_PASSWORD` are removed. `oidc.config.ts` production guards: token URL, client id, secret ≥ 16 chars and not a known default; redact `identityService.clientSecret`. Unit tests cover success, 401, malformed response, extra params, re-acquire timing.

The service-account user must carry the Heka claims (role `Verifier` + `org_id`, or `Admin`, plus name and `heka_uid`); how each provider does that is in section 8. Its tenant is new (different user id from the current `demo` account); after switching, run wallet preparation once for it and update `IDENTITY_SERVICE_PUBLIC_VERIFIER_ID` / `IDENTITY_SERVICE_REQUEST_SIGNER_DID`.

## 8. Provider recipes

Each recipe produces the same contract: `aud` contains the configured audience; claims for user id, one role, name, org id.

### 8.1 Keycloak (`heka-sso-service/keycloak/realm-heka-platform.json`)

The platform gets its **own realm, `heka-platform`**, next to the existing `heka` realm of the OID4VP SSO demo; both files are imported by the same dev Keycloak. They are separate security domains: the `heka` realm holds users federated from the `heka-sso` wallet IdP for a demo relying party, the `heka-platform` realm holds the identity-service operators. Sharing one realm would give every brokered wallet user the default group (and so the `Admin` role) of the platform, would let one Keycloak SSO cookie log a password-authenticated operator into the demo RP without a credential presentation (and a wallet user into the platform UI without a password), and would force one set of realm-wide settings (registration, password policy, email handling, theme, token lifetimes) on both. In production the demo realm stands in for a customer's IdP while the platform realm is Heka's own, so the split also mirrors the intended topology.

| Item | Detail |
|---|---|
| Client `heka-identity-service` (bearer-only) | Client roles `Admin`, `OrgAdmin`, `OrgManager`, `OrgMember`, `Issuer`, `Verifier`, `User`. |
| Protocol mappers on the two clients below | User Client Role → `roles` (multivalued, access token); User Attribute `org_id` → `org_id`; User Property `id` → `heka_uid` (in Keycloak the Heka user id is the Keycloak user id, which imports preserve, so the claim is always present); Audience `heka-identity-service`. They sit on the clients rather than in a custom client scope because a `clientScopes` array in an imported realm file suppresses Keycloak's built-in scopes (`profile`, `email`, `basic`, …). The display name needs no mapper: the built-in `profile` scope emits `name` / `preferred_username`, which the identity service's default fallback list reads. |
| Client `heka-identity-web-ui` | Public, Standard flow, PKCE S256, no direct grants, redirect URIs / Web Origins for the UI origin; refresh-token rotation on. |
| Client `heka-sso-service` | Confidential, Service accounts on; service-account user holds `Admin` (same tenant shape as today's `demo` account; dev secret in the realm file). |
| User `demo` (dev only) | Fixed id, password `Password1234!`, role `Admin`: the account `prepare-demo-user` used to create in heka-auth-service, so the dev chain has a login before phase 5. |
| Realm | `registrationAllowed: true`; password policy `length(7) and upperCase(1) and lowerCase(1) and digits(1) and specialChars(1)`; refresh-token rotation on; default group `heka-users` carrying `heka-identity-service.Admin`, so every new user (self-registered included) is an `Admin` of their own tenant, as with heka-auth-service (a default-role composite cannot be used: an imported `roles.realm` entry suppresses Keycloak's built-in realm roles). Because the identity service requires exactly one role, a user must leave the group before getting an org role (documented in `heka-sso-service/keycloak/README.md`). User Profile unchanged (email optional, unmanaged attributes allowed, so `org_id` can be set per user). `KC_HOSTNAME` fixed in dev compose so `iss` is stable; a containerised identity service keeps `OIDC_ISSUER_URL` at the browser-facing value and sets `OIDC_JWKS_URI` through `host.docker.internal`. |
| Identity-service env | `OIDC_ISSUER_URL=http://localhost:8080/realms/heka-platform`, `OIDC_AUDIENCE=heka-identity-service`, claim paths at defaults plus `OIDC_CLAIM_USER_ID=heka_uid`. |
| Password change | AIA `kc_action=UPDATE_PASSWORD`. |
| Import | Partial import with preserved `id`, attribute `heka_uid` = same id, argon2 credential with explicit parameters (m=65536, t=3, p=4, hashLength 32, argon2id v1.3); verify one user first; fallback `requiredActions: ["UPDATE_PASSWORD"]`. |

### 8.2 Auth0

| Item | Detail |
|---|---|
| API `heka-identity-service` | Identifier = audience (e.g. `https://heka-identity`), RS256, RBAC on with roles `Admin`, …, `User` (or `app_metadata.heka_role` if RBAC is not wanted). Token lifetime ≤ 30 days. |
| Application `heka-identity-web-ui` (SPA) | Callback / logout / web origins = UI origin; refresh-token rotation on; Database connection with sign-ups enabled; tenant setting "RP-Initiated Logout End Session Endpoint Discovery" on so `oidc-client-ts` can log out. |
| Application `heka-sso-service` (M2M) | Authorized for the API; `app_metadata` on the client is not available, so the credentials-exchange Action sets fixed claims per `client_id`. |
| Post-login Action (`onExecutePostLogin`) — `heka-sso-service/auth0/actions/post-login.js` | Only when the login requested the Heka API audience: `https://heka/roles` = the user's single Heka role (Auth0 role → `app_metadata.heka_role` → default `Admin`, which is then persisted), `…/name` = `username ?? nickname ?? name ?? email`, `…/org_id` from `app_metadata`, `…/heka_uid` = `app_metadata.heka_uid ?? user_id`. Namespaced names are mandatory in access tokens with an API audience. |
| Credentials-exchange Action (`onExecuteCredentialsExchange`) — `…/actions/credentials-exchange.js` | Same claims for M2M clients, taken from the application metadata (`heka_role`, `org_id`, `heka_uid`, `heka_name`); denies the exchange when `heka_role` is missing or invalid. |
| Identity-service env | `OIDC_ISSUER_URL=https://<tenant>.<region>.auth0.com/`, `OIDC_AUDIENCE=https://heka-identity`, `OIDC_CLAIM_ROLES=/https:~1~1heka~1roles`, `OIDC_CLAIM_NAME=/https:~1~1heka~1name,name,nickname`, `OIDC_CLAIM_ORG_ID=/https:~1~1heka~1org_id`, `OIDC_CLAIM_USER_ID=/https:~1~1heka~1heka_uid`. |
| Web-UI env | `REACT_APP_OIDC_AUDIENCE=https://heka-identity` (without it Auth0 issues an opaque access token). |
| Sign-up | `screen_hint=signup` on the authorize request. |
| Password change | No in-flow action. Profile button triggers `POST /dbconnections/change_password` (reset email) or opens an account page; requires a real email on the user. |
| Import | Bulk import with `user_id` (becomes `auth0\|<id>`), `custom_password_hash: { algorithm: 'argon2', hash: { value: '<encoded>' } }`, `app_metadata.heka_uid` = original UUID. **`email` is required per user**; heka-auth users have none → synthesize `<name>@<placeholder-domain>` with `email_verified: false`, enable "Requires Username" on the connection so login by username keeps working, and ask users to set a real email before they can use password reset. |

### 8.3 Any other provider (`generic` profile)

Works if it offers discovery, RS256 JWKS, Authorization Code + PKCE with refresh tokens, Client Credentials, and a way to add the four claims. Sign-up and password change buttons are hidden unless `REACT_APP_AUTH_ACCOUNT_URL` is set.

## 9. Demo user and demo token

Today: a one-year access token is baked into the web bundle at build time. Auth0 cannot issue that, and a year-long bearer in a public bundle is a weak practice anyway.

Plan: a **demo-token broker** endpoint, `GET /demo/token`, added to heka-identity-service as an optional module enabled by `DEMO_TOKEN_URL`, `DEMO_CLIENT_ID`, `DEMO_CLIENT_SECRET`, `DEMO_TOKEN_PARAMS`. It obtains a short-lived access token for a dedicated demo service account via Client Credentials (same provider-neutral logic as section 7; the token provider can be shared as a small package or duplicated), caches it, and returns it to the browser. The web UI's demo pages call it instead of reading `REACT_APP_DEMO_USER_ACCESS_TOKEN`; `refreshTokens()`'s demo special case disappears. Exposure is unchanged from today (anyone could read the bundled token), lifetime drops from a year to minutes, and it works on every provider.

`prepare-demo-user.ts` becomes provider-neutral: it no longer creates users or tokens; it only calls `/prepare-wallet` with a token from the broker (or a user token) and records the demo DID. Creating the demo service account is part of the provider recipe.

Fallback if the broker is not wanted: keep the build-time token and rebuild within the provider's lifetime cap (Keycloak: configurable; Auth0: ≤ 30 days).

Implemented 2026-09-21 (phase 6): `src/demo/` in the identity service (`DemoModule`, `DemoTokenProvider` duplicating the section-7 grant logic, `DemoController`), config `src/config/demo.ts` with `DEMO_CLIENT_AUTH_METHOD` and `DEMO_TOKEN_RATE_LIMIT` added to the four variables above; the endpoint is rate-limited with `@nestjs/throttler` scoped to that module (the identity service had no throttler before) and answers `404` while disabled. The demo account is a dedicated service-account client `heka-demo` in both recipes with the fixed Heka user id `e5f6a7b8-c9d0-4e1f-a2b3-c4d5e6f7a8b9` (distinct from the `demo` login user), so the demo tenant is the same on Keycloak and Auth0. The web UI keeps only `REACT_APP_DEMO_USER_DID` at build time; the build-time-token fallback was removed rather than kept.

## 10. User migration

One export script in heka-auth-service (`scripts/export-users.ts`) reading `auth_user` and emitting the provider's import format, selected by `--target keycloak|auth0`:

- Common fields: original id, username, role, `heka_uid` = original id, argon2 encoded hash.
- Keycloak: partial-import JSON, `ifResourceExists: SKIP`.
- Auth0: bulk-import JSON (`user_id`, placeholder `email`, `custom_password_hash`, `app_metadata`), uploaded with the Management API job.

Migration order per deployment: import users → deploy identity service with `OIDC_*` for the provider → deploy SSO service and web UI → prepare the SSO service's verifier tenant and the demo tenant. Existing tokens/sessions end; users log in again with their old password (or reset it if hash import failed).

Implemented 2026-09-21 (phase 7): `heka-auth-service/scripts/export-users.ts` over `src/migration/user-export.ts`, flags `--target`, `--out`, `--org-id` (default `ORG_ID`), `--user` (one account, for the verification), `--without-passwords` (Keycloak: `requiredActions: ["UPDATE_PASSWORD"]`), `--email-domain` (Auth0). The Keycloak credential is emitted in the built-in `argon2` provider's representation (`secretData` with base64 hash and salt, `credentialData` with iterations, memory, parallelism, hash length, type `id`, version `1.3`); the argon2 parameters of section 8.1 were confirmed against Keycloak 26.3. Import instructions live in the auth-service README and in both recipe READMEs. Password hashes were verified on both providers with one account each.

Switching providers later (Keycloak → Auth0 or back): export from the old provider (both can export users; password hashes are exportable from Keycloak, **not** from Auth0, which only exports hashes via a support request), import into the new one keeping `heka_uid`, then flip the env vars. Tenants are preserved through `heka_uid`.

## 11. Retirement of heka-auth-service

After the web UI and the SSO service are on the OIDC path and one provider recipe is verified end to end: delete `heka-auth-service/`, its two workflows, its mention in the root README and architecture diagram, `heka-identity-service/README.md` line 13 and the `setup.md` paragraphs pointing to it, and the compose comments in `heka-sso-service`. The user export script (section 10) is the last thing that needs the service's database; run it before removal or keep it as a standalone SQL-to-JSON tool.

Implemented 2026-09-22 (phase 8): the export script was kept as the standalone tool `tools/heka-auth-user-export/` (plain Node.js, reads a `psql` JSON dump of `auth_user`, so it survives the service and its schema; the in-service `scripts/export-users.ts` of phase 7 goes with the folder). The deletions listed above were applied to every file except the folder and the two workflows themselves, whose removal (`git rm -r heka-auth-service .github/workflows/heka-auth-service-verify.yml .github/workflows/heka-auth-service-publish.yml`, then deleting the untracked leftovers of the folder) is left to the maintainer. The identity-service verify workflow gained the non-blocking `keycloak-live` job.

## 12. Risks and open questions

1. **Claim-path configuration errors** are silent 401s. Mitigation: startup log of resolved paths, a `/auth/whoami`-style debug endpoint returning the mapped `TokenPayload` for the caller, and per-provider test payloads.
2. **Role value shape**: Keycloak role mappers have a known single-vs-multivalued quirk; Auth0 RBAC puts roles in `permissions` unless an Action copies them. The tolerant extraction (5.2) absorbs both, but each recipe must be verified with a real token.
3. **Auth0 email requirement** for imported users (8.2). Placeholder emails work for login; password reset needs a real email first.
4. **Password-change UX differs per provider** (in-flow for Keycloak, email-based for Auth0). Acceptable; the profile decides what the button does.
5. **Demo broker exposes a token to anyone** — same as today, shorter lifetime. Rate-limit the endpoint (throttler already present) and give the demo account the minimum role.
6. **Issuer URL consistency** in dev (browser vs containers) for Keycloak; Auth0 issuer ends with `/`.
7. **argon2 import parameters** for Keycloak: plausible, verify with one user. Auth0 documents argon2 import explicitly.
8. **Default role for self-registration** stays `Admin` to match the web UI today; revisit before any non-demo deployment.
9. **Two providers at once** is out of scope for phase 1; `OIDC_TRUSTED_ISSUERS` is the extension point if a zero-downtime provider switch is ever needed.

None of these blocks the plan.

## 13. Work plan

| Phase | Deliverable | Done when |
|---|---|---|
| 1. Identity service — **done 2026-09-21** | `OIDC_*` config (`src/config/oidc.ts`), `TokenVerifier` (jose, lazy discovery, JWKS) and `mapClaims` (`src/common/auth/`), guard rewritten without passport, gateway unchanged (goes through `AuthService`), `passport-jwt`/`@nestjs/jwt`/`jsonwebtoken` removed, unit tests with Keycloak- and Auth0-shaped payloads, e2e tests moved to RS256 with an inline test JWKS, `docs/setup.md` "Authentication (OIDC)". | All tests green; a real Keycloak token and a real Auth0 token are both accepted with only env changes (real-provider check happens in phases 2 and 3). |
| 2. Keycloak recipe — **done 2026-09-21** | Separate realm (8.1) in `heka-sso-service/keycloak/realm-heka-platform.json`, `KC_HOSTNAME` pinned in the SSO dev compose, `OIDC_ISSUER_URL`/`OIDC_JWKS_URI` split in the identity-service dev compose, `heka-sso-service/keycloak/README.md`. | Verified against Keycloak 26.3 with `--import-realm`: a Client Credentials token for `heka-sso-service` and a `demo` user token from the `heka-identity-web-ui` code flow both carry `aud`, `roles: ["Admin"]`, `heka_uid`, `preferred_username`, and both are accepted by the phase-1 `TokenVerifier` through discovery; a wrong audience is rejected. |
| 3. Auth0 recipe — **done 2026-09-21, verified live** | `heka-sso-service/auth0/`: README (tenant guide, 8.2), `setup-tenant.sh` (Auth0 CLI, re-runnable, prints the env values for every component), Actions `post-login.js` (`onExecutePostLogin`) and `credentials-exchange.js` with unit tests (`test/unit/auth0-actions.spec.ts`), Auth0 block in the identity-service `.env.example`. | Ran the script against the dev tenant `dev-hqu665l167ea0ye3.eu.auth0.com` (API, SPA + M2M apps, roles, both Actions bound, connection with username login and password rule, logout discovery, `demo` user). A live M2M token and a live `demo` user token both carry the namespaced contract claims and are accepted by the phase-1 `TokenVerifier` with the recipe's env values; 10 Action unit tests green. |
| 4. SSO service — **done 2026-09-21** | `IdentityServiceTokenProvider` runs an OAuth 2.0 Client Credentials grant (`IDENTITY_SERVICE_TOKEN_URL`, `_CLIENT_ID`, `_CLIENT_SECRET`, optional `_CLIENT_AUTH_METHOD` = `client_secret_post` \| `client_secret_basic`, optional `_TOKEN_PARAMS` JSON such as Auth0's `audience`); the heka-auth-service login and `AUTH_SERVICE_BASE_URL`, `IDENTITY_SERVICE_AUTH_NAME`, `IDENTITY_SERVICE_AUTH_PASSWORD` are removed; `IDENTITY_SERVICE_AUTH_TOKEN` static override kept. Config validation (settings set together, auth method, params JSON, production: known dev secret and short secrets refused), `clientSecret` redacted from logs, README / `env/.env.example` / both compose files point at the Keycloak realm client by default. Unit tests: 12 for the provider, 3 for the config. | Provider and config unit tests green. Live check against the identity service on Keycloak / Auth0 happens with the end-to-end flows of phase 5 (the same Client Credentials tokens were already verified against the identity service in phases 2 and 3). |
| 5. Web UI — **done 2026-09-21, browser flows to be exercised** | `src/shared/auth/`: `config.ts` (`REACT_APP_AUTH_PROVIDER`, `REACT_APP_OIDC_AUTHORITY`, `_CLIENT_ID`, `_SCOPE`, `_AUDIENCE`, `REACT_APP_AUTH_ACCOUNT_URL`), `profiles/{keycloak,auth0,generic}.ts` (Keycloak: `prompt=create` sign-up and `kc_action=UPDATE_PASSWORD`; Auth0: `audience`, `offline_access`, `screen_hint=signup`, account page; generic: account page only), `session.ts` (`AuthSession` contract), `sessionBridge.ts` (token / refresh / drop / sign-out for axios and thunks), `OidcAuthProvider.tsx` (`react-oidc-context` + `oidc-client-ts`, mirrors the session into the user slice). Sign-in page is a redirect button plus "Create account" when the profile supports it; the sign-up page, the in-app password form and the `heka-auth-service` thunks/endpoints are deleted; the profile page offers "Change password" only when the profile has a flow. `api.ts` takes the token from the session (demo token fallback for the public demo pages) and renews once on 401 via `signinSilent`. README and `.env.example` updated. | `tsc`, `eslint`, 9 Jest suites / 47 tests (incl. profile, claim and bridge tests) and `webpack` build (circular-dependency check on) pass. Still to do in a browser against the Keycloak realm and the Auth0 tenant: sign in, create account, silent renew, change password, sign out, then the issuance and verification flows; the demo pages keep using the build-time token until phase 6. |
| 6. Demo broker — **done 2026-09-21, browser check pending** | Identity service: `src/demo/` (`DemoModule`, `DemoTokenProvider` with cached Client Credentials grant, `DemoController` serving `GET /demo/token` as `{ access_token, token_type, expires_in }`, `404` while disabled, `502` when the provider refuses, per-IP rate limit via `@nestjs/throttler` scoped to the module), `src/config/demo.ts` (`DEMO_TOKEN_URL`, `_CLIENT_ID`, `_CLIENT_SECRET`, optional `_CLIENT_AUTH_METHOD`, `_TOKEN_PARAMS`, `_TOKEN_RATE_LIMIT`; set-together and production-secret checks), `docs/setup.md` "Demo token broker", `.env.example`, dev compose defaults. Recipes: Keycloak client `heka-demo` (service account with fixed user id `e5f6a7b8-…`, `Admin`) in the realm file and README; Auth0 `setup-tenant.sh` creates the `heka-demo` M2M application with the same `heka_uid` in its metadata and prints the `DEMO_*` values. Web UI: `shared/api/config/demoToken.ts` (runtime fetch, cached, deduplicated, refreshed before expiry), `$agencyDemoApi` authenticates with it and retries once on `401`, `REACT_APP_DEMO_USER_ACCESS_TOKEN` and the `api.ts` demo fallback removed, `scripts/prepare-demo-user.ts` rewritten (`yarn prepare-demo-user`: broker token or `DEMO_ACCESS_TOKEN` → `/prepare-wallet` → `REACT_APP_DEMO_USER_DID`), README and `.env.example`. | Unit tests green: identity service 23 (config, provider, controller), web UI 7 for the token cache plus the existing suites. Still to do in a browser: start Keycloak with the updated realm (re-import needed: delete the `keycloak` container), enable `DEMO_*` on the identity service, run `yarn prepare-demo-user`, open the Demo and Age verification pages signed out and complete an issuance and a verification; then the same against the Auth0 tenant after re-running `setup-tenant.sh`. |
| 7. Migration tooling — **done 2026-09-21, verified live** | `heka-auth-service/scripts/export-users.ts` (`yarn export-users --target keycloak\|auth0 [--out] [--org-id] [--user] [--without-passwords] [--email-domain]`) over the pure `src/migration/user-export.ts`: parses the argon2 encoded hash; Keycloak partial import (`ifResourceExists: SKIP`, preserved `id`, `heka_uid` attribute, `secretData`/`credentialData` for the built-in `argon2` provider, `heka-users` group for `Admin` or the `heka-identity-service` client role plus `org_id` for the others, `UPDATE_PASSWORD` fallback); Auth0 bulk import (`user_id`, synthesized e-mail, `custom_password_hash`, `app_metadata.heka_uid` / `heka_role` / `org_id`). 16 unit tests. Import steps in the auth-service README and both recipe READMEs. | One throwaway account exported and imported on each provider: Keycloak 26.3 partial import `ADDED` it with the original id, a password grant with the old password succeeded (wrong password: 401) and the token carried `heka_uid` = original id, `roles: ["Admin"]`, `aud`; the Auth0 job `inserted: 1`, the password-realm grant with the old password succeeded (wrong: 403) and the token carried `https://heka/heka_uid` = original id and the role. Same `heka_uid` means the same identity-service tenant, hence the same schemas and DIDs; test users removed afterwards. |
| 8. Retirement and docs — **done 2026-09-22, deletion staged by hand** | The phase-7 export tool moved out of the service as the dependency-free `tools/heka-auth-user-export/` (`export-users.mjs` over a `psql` JSON dump of `auth_user`, `node --test` suite, README with the dump, convert and import steps); both recipe READMEs point at it. Root README: component list and diagram show "OIDC provider (Keycloak / Auth0 / …)" with PKCE login and JWKS verification. References removed from `.coderabbit.yaml`, the SSO README, the wallet-integration nginx sample and the test OIDC config comment. CI: `keycloak-live` job in the identity-service verify workflow (non-blocking) boots Keycloak 26.3 with `--import-realm` and runs `test/keycloak-live.test.ts`, which verifies real service-account tokens of `heka-sso-service` and `heka-demo` through discovery and the claim mapping and rejects wrong audience, wrong issuer and a tampered token; the test is skipped without `KEYCLOAK_LIVE_URL`. | Live test: 6/6 against the local Keycloak. Tool tests 15/15; the documented `psql` dump → tool pipeline ran against the real auth database. The `git rm -r heka-auth-service .github/workflows/heka-auth-service-*.yml` step (plus removing the untracked phase-7 files under the folder) could not be executed by the assistant and is left to the maintainer; once done, heka-auth-service is gone from the repository and CI. |

Order: 1 → 2 → 4 and 5 in parallel (on Keycloak) → 3 (validate Auth0 against the same code) → 6 → 7 → 8.

## 14. Sources

Repository files are cited inline. External references checked on 2026-09-21:

- Keycloak securing-apps guide, OIDC layers and deprecation of Direct Access Grants: https://www.keycloak.org/securing-apps/oidc-layers
- Keycloak Application Initiated Actions: https://github.com/keycloak/keycloak-community/blob/main/design/application-initiated-actions.md
- Keycloak account REST password endpoint removed: https://forum.keycloak.org/t/keycloak-account-api-password-endpoint-removed-why/5274
- Keycloak argon2 credential import: https://github.com/keycloak/keycloak/issues/38177 and https://github.com/inventage/keycloak-password-hashprovider-extension/blob/main/USER_MIGRATION_GUIDE.md
- Keycloak role mapper multivalued behaviour: https://github.com/keycloak/keycloak/issues/20218
- Keycloak protocol mappers: https://www.keycloak.org/admin-api/protocol-mappers
- Auth0 custom claims (non-namespaced claims not allowed in access tokens with an API audience): https://auth0.com/docs/secure/tokens/json-web-tokens/create-custom-claims and https://support.auth0.com/center/s/article/Add-custom-claims-to-access-token-without-a-namespace
- Auth0 access-token lifetime (max 2,592,000 s): https://auth0.com/docs/secure/tokens/access-tokens/update-access-token-lifetime
- Auth0 bulk user import schema (`user_id`, `email`, `custom_password_hash` incl. argon2): https://auth0.com/docs/manage-users/user-migration/bulk-user-import-schema

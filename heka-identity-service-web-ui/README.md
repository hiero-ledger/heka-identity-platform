# Heka Identity Service Web UI

An example web application that demonstrates the capabilities of [Heka Identity Service](https://github.com/hiero-ledger/heka-identity-platform/tree/main/heka-identity-service) and [Heka Wallet](https://github.com/hiero-ledger/heka-identity-platform/tree/main/heka-wallet) reference implementations.

The application currently supports issuance and verification of multiple types of verifiable credentials using OID4VC and DIDComm protocols.

## Design and Project Structure

The application structure is inspired by [Feature-Sliced Design](https://feature-sliced.design/).

## Capabilities

- [Hyperledger AnonCreds](https://hyperledger.github.io/anoncreds-spec/)
  - [AnonCreds Indy](https://hyperledger.github.io/anoncreds-spec/) — AnonCreds credentials and presentations
    represented in legacy Indy format
  - [AnonCreds W3C](https://hyperledger.github.io/anoncreds-spec/#w3c-verifiable-credentials-representation) —
    AnonCreds credentials and presentations represented in W3C format
- [OpenID4VC](https://openid.net/sg/openid4vc/)
  - [vc+sd-jwt](https://datatracker.ietf.org/doc/draft-ietf-oauth-sd-jwt-vc/) — VC as a JWT supporting selective
    disclosure
  - [jwt_vc_json](https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html) — VC signed as a JWT, not
    using JSON-LD
  - [jwt_vc_json-ld](https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html) — VC signed as a JWT,
    using JSON-LD
  - [ldp_vc](https://www.w3.org/TR/vc-data-model/) — VC/VP signed with Linked Data Proof formats
  - [mso_mdoc](https://www.iso.org/standard/69084.html) — ISO mDoc (mDL)

## Flows

- **Demo** — Demonstration of issuance and verification of predefined `vc+sd-jwt` credentials.
- **Issuance** — Issuance of all supported credentials types.
  - In addition to predefined credential schemas, this flow also provides an ability to create custom one tied to the user.
- **Verification** — Verification of all supported credential types.
  - Currently, verification requests are tightly tied to credential schemes created under the user.

> **Note:** Issuance and Verification flows work only for **authorized** users, but **Demo** can be run without authorization.

### Creation of Pre-Defined Demo User

As mentioned above, **Demo** flow can be run under an unauthorized user. The pages act as a dedicated demo service account whose short-lived access token they fetch at runtime from the identity service's **demo-token broker** (`GET /demo/token`); nothing secret is baked into the bundle. Before running or deploying the application:

1. Create the demo service account at the OpenID Connect provider. The shipped Keycloak realm already contains the `heka-demo` client and the Auth0 tenant script creates the `heka-demo` application, see [heka-sso-service/keycloak](../heka-sso-service/keycloak/README.md) and [heka-sso-service/auth0](../heka-sso-service/auth0/README.md).
2. Enable the broker in the identity service with `DEMO_TOKEN_URL`, `DEMO_CLIENT_ID` and `DEMO_CLIENT_SECRET` (plus `DEMO_TOKEN_PARAMS={"audience":"..."}` for Auth0), see [Demo token broker](../heka-identity-service/docs/setup.md#demo-token-broker).
3. Run `yarn prepare-demo-user` with the identity service up. [`scripts/prepare-demo-user.ts`](./scripts/prepare-demo-user.ts) takes a token from the broker, calls `/prepare-wallet` (demo schemas, logos, DID) and writes the DID into `REACT_APP_DEMO_USER_DID` in [.env](./.env). Set `DEMO_ACCESS_TOKEN` to use another token instead of the broker's; the DID then belongs to that token's tenant.

The DID must belong to the tenant of the account the broker hands out, which is why the script uses the broker's token by default. Re-run the script after switching providers unless both carry the same Heka user id for the demo account (the shipped recipes do).

## Configuration

The Web UI is configured via environment variables read by webpack at build time. Copy [.env.example](./.env.example) to `.env` at the package root and set them there.

| Variable                            | Default                 | Description                                                                                                                                                                                                        |
| ----------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `REACT_APP_AGENCY_ENDPOINT`         | `http://localhost:3000` | Heka Identity Service base URL.                                                                                                                                                                                    |
| `REACT_APP_AUTH_PROVIDER`           | `keycloak`              | Provider profile: `keycloak`, `auth0` or `generic`. Only the provider's quirks depend on it (sign-up entry, password change, extra authorize parameters); the OIDC flow is the same.                                |
| `REACT_APP_OIDC_AUTHORITY`          | _(required)_            | Issuer URL of the OpenID Connect provider, e.g. `http://localhost:8080/realms/heka-platform` or `https://<tenant>.<region>.auth0.com/`.                                                                                     |
| `REACT_APP_OIDC_CLIENT_ID`          | _(required)_            | Public client registered for this web UI (`heka-identity-web-ui` in the shipped Keycloak realm; the SPA application's client id in Auth0).                                                                          |
| `REACT_APP_OIDC_SCOPE`              | _(profile default)_     | Scope override. Keycloak profile: `openid profile`; Auth0 and generic: `openid profile offline_access` (refresh tokens).                                                                                            |
| `REACT_APP_OIDC_AUDIENCE`           | _(empty)_               | Auth0 only: API identifier sent as `audience` (`https://heka-identity`); without it Auth0 issues an opaque access token that the identity service cannot verify.                                                   |
| `REACT_APP_AUTH_ACCOUNT_URL`        | _(empty)_               | Account page opened by "Change password" for profiles without an in-flow password change (Auth0, generic). Keycloak uses its `UPDATE_PASSWORD` action and needs nothing here.                                      |
| `REACT_APP_DEMO_USER_DID`           | _(empty)_               | DID of the pre-provisioned demo account, written by `yarn prepare-demo-user` — see [Creation of Pre-Defined Demo User](#creation-of-pre-defined-demo-user). Its access token is fetched at runtime from the identity service's demo-token broker. |

The Web UI signs users in at the OpenID Connect provider (Authorization Code + PKCE via `oidc-client-ts`), keeps the session in the browser's session storage, renews it with the refresh token, and calls the [Heka Identity Service](../heka-identity-service/README.md) with the access token. The identity service must be configured for the same provider (its `OIDC_ISSUER_URL` / `OIDC_AUDIENCE`, see [Authentication (OIDC)](../heka-identity-service/docs/setup.md#authentication-oidc)). Registration and password changes happen on the provider's own pages: the sign-in page offers "Create account" when the profile supports it (Keycloak via `prompt=create`, Auth0 via `screen_hint=signup`), and the profile page offers "Change password" when the profile has a flow for it. The provider-specific code lives in [`src/shared/auth/profiles`](./src/shared/auth/profiles); everything else is plain OIDC.

### Digital Credentials API (DC API)

When the browser supports the W3C Digital Credentials API, the verification flow offers it alongside the legacy QR code option (these correspond to the OpenID4VP `dc_api` and `direct_post` response modes).
The same `navigator.credentials.get()` call works **same-device** (the OS picker opens a wallet on this device) and **cross-device** (on desktop, the browser itself shows a QR and runs a Bluetooth handshake to a wallet on a phone) — no app-rendered QR is involved for DC API.
Cross-device on desktop Chrome may require the `chrome://flags#web-identity-digital-credentials` flag or a per-origin trial token; see the commented placeholder in [`public/index.html`](./public/index.html).

## Development

### Prerequisites

- **Node.js** — version that supports Corepack (Node 22 LTS recommended).
- **Yarn 4** via Corepack — this package pins `yarn@4.16.0` in `package.json`. Enable Corepack so the correct Yarn version runs automatically:

  ```bash
  corepack enable
  corepack prepare yarn@4.16.0 --activate
  ```

  Without this, the system Yarn 1.x may run instead and produce unexpected lockfile behavior.

- [Heka Identity Service](https://github.com/hiero-ledger/heka-identity-platform/tree/main/heka-identity-service) is running
  on `http://localhost:3000`
- An OpenID Connect provider with the Heka recipe, e.g. the Keycloak `heka-platform` realm from
  [heka-sso-service](../heka-sso-service/keycloak/README.md) on `http://localhost:8080`
  (`docker compose --profile keycloak up -d keycloak` at the repository root, see
  [docs/root-docker-compose.md](../docs/root-docker-compose.md))
- Mobile phone with installed [Heka Wallet](https://github.com/hiero-ledger/heka-identity-platform/tree/main/heka-wallet)

### How to Start

- Update [environment variables defining the identity service and the OpenID Connect provider](./.env) if needed
  ```
  REACT_APP_AGENCY_ENDPOINT=http://localhost:3000
  REACT_APP_AUTH_PROVIDER=keycloak
  REACT_APP_OIDC_AUTHORITY=http://localhost:8080/realms/heka-platform
  REACT_APP_OIDC_CLIENT_ID=heka-identity-web-ui
  ```
- Install dependencies:
  ```
  yarn install
  ```
- Run application:
  ```
  yarn start
  ```
- Client starts on http://localhost:8000

## How to Deploy

- Update [environment variables defining the identity service and the OpenID Connect provider](./.env) if needed
  ```
  REACT_APP_AGENCY_ENDPOINT=http://localhost:3000
  REACT_APP_AUTH_PROVIDER=keycloak
  REACT_APP_OIDC_AUTHORITY=http://localhost:8080/realms/heka-platform
  REACT_APP_OIDC_CLIENT_ID=heka-identity-web-ui
  ```
  The web UI origin must be registered at the provider as redirect URI, post-logout redirect URI and web origin (the shipped realm and the Auth0 script register `http://localhost:8000`).
- Prepare Demo user as described [above](#creation-of-pre-defined-demo-user)
- Build package
  ```
  yarn build:prod
  ```

## Technologies

- [TypeScript](https://www.typescriptlang.org/docs/home.html)
- [React](https://reactjs.org/)
- [Redux](https://redux.js.org/)
- [Sass](https://sass-lang.com/)
- [Joi](https://joi.dev/api/)
- [webpack](https://webpack.js.org/)

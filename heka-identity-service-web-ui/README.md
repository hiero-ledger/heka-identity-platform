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

As mentioned above, **Demo** flow can be run under an unauthorized user, but you must perform the next preparation
steps before running or deploying the application:

- Update values of predefined constants if needed: [authServiceEndpoint, agencyEndpoint, userCredentials](./scripts/prepare-demo-user.ts)
- Initialize Demo user running the following command:
  ```
  npx ts-node  scripts/prepare-demo-user.ts
  ```
- Update `REACT_APP_DEMO_*` environment variables in [.env](./.env) file with generated values.

## Configuration

The Web UI is configured via environment variables read by webpack at build time. Set them in the `.env` file at the package root.

| Variable | Default | Description |
|---|---|---|
| `REACT_APP_AGENCY_ENDPOINT` | `http://localhost:3000` | Heka Identity Service base URL. |
| `REACT_APP_AUTH_SERVICE_ENDPOINT` | `http://localhost:3004` | Heka Auth Service base URL. JWT login and token refresh go here. |
| `REACT_APP_DEMO_USER_DID` | _(empty)_ | DID of the pre-provisioned demo user. Filled in by `scripts/prepare-demo-user.ts` — see [Creation of Pre-Defined Demo User](#creation-of-pre-defined-demo-user). |
| `REACT_APP_DEMO_USER_ACCESS_TOKEN` | _(empty)_ | JWT access token for the demo user. Filled in by the script above. |
| `REACT_APP_DEMO_USER_REFRESH_TOKEN` | _(empty)_ | Refresh token for the demo user. Filled in by the script above. |

The Web UI authenticates against [Heka Auth Service](../heka-auth-service/README.md) for login and token refresh, and calls the [Heka Identity Service](../heka-identity-service/README.md) with the resulting JWT. Both services must be running and reachable from the browser at the configured endpoints.

## Development

### Prerequisites

- **Node.js** — version that supports Corepack (Node 20+ recommended).
- **Yarn 4** via Corepack — this package pins `yarn@4.9.4` in `package.json`. Enable Corepack so the correct Yarn version runs automatically:

  ```bash
  corepack enable
  corepack prepare yarn@4.9.4 --activate
  ```

  Without this, the system Yarn 1.x may run instead and produce unexpected lockfile behavior.

- [Heka Identity Service](https://github.com/hiero-ledger/heka-identity-platform/tree/main/heka-identity-service) is running
  on `http://localhost:3000`
- [Heka Auth Service](https://github.com/hiero-ledger/heka-identity-platform/tree/main/heka-auth-service) is running
  on `http://localhost:3004`
- Mobile phone with installed [Heka Wallet](https://github.com/hiero-ledger/heka-identity-platform/tree/main/heka-wallet)

> Update [api](./src/shared/api/config/api.ts) constants if you change one of service endpoints.

### How to Start

- Update [environment variables defining the endpoints of Agency and Auth services](./.env) if needed
  ```
  REACT_APP_AGENCY_ENDPOINT=http://localhost:3000
  REACT_APP_AUTH_SERVICE_ENDPOINT=http://localhost:3004
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

- Update [environment variables defining the endpoints of Agency and Auth services](./.env) if needed
  ```
  REACT_APP_AGENCY_ENDPOINT=http://localhost:3000
  REACT_APP_AUTH_SERVICE_ENDPOINT=http://localhost:3004
  ```
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

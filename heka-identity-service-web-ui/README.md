# Heka Identity Web App

An example web application that demonstrates capabilities
of [Heha Identity Service](https://github.com/hiero-ledger/heka-identity-platform/tree/main/heka-identity-service)
and [Heka Identity Wallet](https://github.com/hiero-ledger/heka-identity-platform/tree/main/heka-wallet) reference implementations.

The application currently supports issuance and verification of multiple types of verifiable credentials using OID4VC and DidComm protocols.

### Design and project structure

The application structure is inspired by [Feature-Sliced Design](https://feature-sliced.design/).

### Capabilities

- [Hyperledger Aries](https://github.com/hyperledger/aries)
  - [Anoncreds Indy](https://hyperledger.github.io/anoncreds-spec/) - AnonCreds credentials and presentations
    represented in legacy Indy format
  - [Anoncreds W3C](https://hyperledger.github.io/anoncreds-spec/#w3c-verifiable-credentials-representation) -
    AnonCreds credentials and presentations represented in W3C format. W3C
- [OpenId4Vc](https://openid.net/sg/openid4vc/)
  - [sd+jwt_vc](https://datatracker.ietf.org/doc/draft-ietf-oauth-sd-jwt-vc/) - VC as a JWT and supporting selective
    disclosure
  - [jwt_vc_json](https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html) - VC signed as a JWT, not
    using JSON-LD
  - [jwt_vc_json-ld](https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html) - VC signed as a JWT,
    using JSON-LD
  - [ldp_vc](https://www.w3.org/TR/vc-data-model/) - VC/VP signed with Linked Data Proof formats

### Flows

- **Demo** - Demonstration of issuance and verification of predefined `sd+jwt_vc` credentials.
- **Issuance** - Issuance of all supported credentials types.
  - In addition to predefined credential schemas, this flow also provides an ability to create custom one tied to the user.
- **Verification** - Verification of all supported credential types.
  - Currently, verification requests are tightly tied to credential schemes created under the user.

> **Note:** Issuance and Verification flows work only for **authorized** users, but **Demo** can be run without
> authorization.

#### Creation of pre-defined Demo user

As mentioned above, **Demo** flow can be run under an unauthorized user, but you must perform the next preparation
steps before running or deploying the application:

- Update values of predefined constants if needed: [authServiceEndpoint, agencyEndpoint, userCredentials](./scripts/prepare-demo-user.ts)
- Initialize Demo user running the following command:
  ```
  npx ts-node  scripts/prepare-demo-user.ts
  ```
- Update `REACT_APP_DEMO_*` environment variables in [.env](./.env) file with generated values.

### Development

#### Prerequisites

- Node >18.18.2
- NPM or Yarn
- [Heka Identity Service](https://github.com/hiero-ledger/heka-identity-platform/tree/main/heka-identity-service) is running
  on `http://localhost:3000`
- [Heka Auth Service](https://github.com/hiero-ledger/heka-identity-platform/tree/main/heka-auth-service) is running
  on `http://localhost:3004`
- Mobile phone with installed [Heka Identity Wallet](https://github.com/hiero-ledger/heka-identity-platform/tree/main/heka-wallet)

> Update [api](./src/shared/api/config/api.ts) constants if you change one of service endpoints.

#### How to start

- Update [environment variables defining the endpoints of Agency and Auth services](./.env) if needed
  ```
  REACT_APP_AGENCY_ENDPOINT=http://localhost:3000
  REACT_APP_AUTH_SERVICE_ENDPOINT=http://localhost:3004
  ```
- Install dependencies:
  ```
  $ yarn install
  ```
- Run application:
  ```
  $ yarn start
  ```
- Client starts on http://localhost:8000

### How to deploy

- Update [environment variables defining the endpoints of Agency and Auth services](./.env) if needed
  ```
  REACT_APP_AGENCY_ENDPOINT=http://localhost:3000
  REACT_APP_AUTH_SERVICE_ENDPOINT=http://localhost:3004
  ```
- Prepare Demo user as described [above](#creation-of-predefined-demo-user):
- Build package
  ```
  yarn build:prod
  ```

### Technologies

- [TypeScript](https://www.typescriptlang.org/docs/home.html)
- [React](https://reactjs.org/)
- [Redux](https://redux.js.org/)
- [SaSS](https://sass-lang.com/)
- [Joi](https://joi.dev/api/)

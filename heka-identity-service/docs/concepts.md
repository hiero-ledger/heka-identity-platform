# Concepts and Glossary

This page introduces the model and terminology used by the Heka Identity Service. It's the recommended starting point after [Setup and Configuration](setup.md) and before working with the API.

## Roles

Verifiable credential ecosystems define three roles. The Identity Service can play any of them:

- **Issuer** — creates and signs verifiable credentials. The Identity Service is most commonly deployed as an Issuer.
- **Verifier** — requests and validates presentations of credentials. The Identity Service can also act as a Verifier.
- **Holder** — receives, stores, and presents credentials. End users use the [Heka Wallet](../../heka-wallet) for this. The Identity Service can also act as a **cloud (custodial) Holder** when deployed for use cases that don't involve a mobile device.

A single Identity Service instance can serve all three roles simultaneously across different tenants.

## Multi-Tenancy

The Identity Service is multi-tenant. A single deployment hosts many independent Issuer / Verifier / Holder agents, each with their own wallet, DIDs, and credentials.

### Tenant lifecycle

- **Tenants are created on first authenticated request.** When a JWT arrives whose `(role, sub, org_id)` triple maps to a previously unseen wallet, the service creates a wallet record and provisions a Credo sub-agent for it (`src/common/auth/auth.service.ts`).
- **Tenant identity is derived from the JWT, not carried as a claim.** The wallet ID is computed from the token's single role (`roles` must contain exactly one entry), `sub` and `org_id` as described in [Role model](#role-model) (`getWalletId(...)` in `src/utils/auth/index.ts`). The internal `tenantId` is then looked up from the wallet record and used by the `TenantAgentInterceptor` to load the correct tenant-scoped Credo agent for every request (`src/common/agent/tenant-agent.interceptor.ts`). See [Setup — Required JWT claims](setup.md#required-jwt-claims) for the full claim set.
- **Wallets are isolated.** Each tenant has its own Askar wallet (stored in PostgreSQL) holding that tenant's keys, DIDs, connections, and credentials. Cross-tenant access is not possible through the API.
- **One agent process, many tenants.** The service runs a single Credo agency that holds per-tenant sub-agents (via Credo's `TenantsModule`). Tenant context is established per-request from the JWT, not through process isolation.

### Role model

The role model is optional and controlled by [`ROLE_MODEL_ENABLED`](setup.md#role-model). Roles and wallets are the same in both modes; the flag only decides whether role restrictions are enforced. Existing deployments must follow [Upgrading an existing deployment](setup.md#upgrading-an-existing-deployment).

| Role         | Scope        | Wallet                                                          | Can create a public DID (role model enabled)      |
| ------------ | ------------ | --------------------------------------------------------------- | ------------------------------------------------- |
| `Admin`      | Global       | `Administration`: the platform identity, shared by all `Admin`s | Yes                                               |
| `User`       | Global       | `User_<sub>`: a personal wallet                                 | No                                                |
| `OrgAdmin`   | Organization | `Organization_<org_id>`: the organization identity              | Yes                                               |
| `OrgManager` | Organization | `Organization_<org_id>`                                         | No                                                |
| `OrgMember`  | Organization | `Organization_<org_id>`                                         | No                                                |
| `Issuer`     | Organization | `Issuer_<sub>_in_Organization_<org_id>`                         | Yes                                               |
| `Verifier`   | Organization | `Verifier_<sub>_in_Organization_<org_id>`                       | `did:key` only (self-controlled, no ledger write) |

- **Organization roles require `org_id`** (`401` without it). For `Admin` and `User` an organization in the token is ignored: they act in `Administration` and `User_<sub>`.
- **Roles come from the OIDC provider.**
  - **Defaults in the shipped recipes:** every sign-up becomes a `User`; operators get `Admin` explicitly; the SSO service account is `OrgAdmin` of its own organization, and the demo account is a `User`.
  - **Assigning other roles** is done in the provider. See [Setup — Managing roles](setup.md#managing-roles).
  - **A role change** reaches the service with the user's next access token and gives the user a different wallet; the data of the previous wallet stays with it.
- **Role model disabled (default):** roles aren't checked. Every user can call every endpoint in the wallet they act in, and no DID controller is set. This is the self-service Web UI mode.
- **Role model enabled:** each endpoint allows only the roles in its `@Roles` decorator, or every authenticated role when it is marked `@AnyRole()`. A route with neither is denied (fail closed), and a unit test checks that every route has one of the two. Reads are open to every role, because their data is confined to the caller's wallet. Writes follow their purpose: issuing (`Admin`, `OrgAdmin`, `OrgManager`, `Issuer`) or verifying (the same plus `Verifier`). A role that can't create a public DID gets `403` from `POST /dids`, and from `POST /prepare-wallet` unless its wallet is already prepared. A `Verifier` may create a `did:key`, so it can prepare its own wallet.

#### DID controller

With the role model enabled, a public DID created by an `OrgAdmin` names a DID of `Administration` as its controller, and a DID created by an `Issuer` names a DID of its organization. The controller DID has the same method and is set as the `controller` of the new DID's document ([W3C DID](https://www.w3.org/TR/did-1.1/#did-controller)). `Admin` DIDs are their own controllers. The DID is always created in the caller's own wallet, which holds its keys.

| Method     | Controller                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------ |
| `hedera`   | Set on the ledger when the DID is created. Until the controller wallet has a `hedera` DID, creation fails (`422`). |
| `key`      | Not possible: a `did:key` document is derived from the key, so it is always its own controller.                    |
| `indy`     | Not supported: Credo's Indy registrar always makes the DID its own controller.                                     |
| `indybesu` | Not supported yet: whether the ledger accepts another controller hasn't been verified.                             |

DIDs of the methods without a controller are created without one. `POST /prepare-wallet` creates the DIDs of all configured methods and skips a DID whose controller doesn't exist yet.

**The controller is informational.** It publishes the organization hierarchy, but proves and enforces nothing:

- **It is a self-declaration.** The new DID's own key writes the `controller` to the ledger; the controller DID neither signs nor approves it. A relying party can't conclude from it that the platform approved an organization, or that an organization approved an issuer.
- **It gives the controller no power.** On Hedera, only the DID's own root key can update or deactivate it; a message signed by the controller DID is ignored by resolvers. The Identity Service also has no API to update or deactivate a DID.

So the platform can't revoke an organization's DID through it, and an organization can't revoke an issuer's DID. Control over who acts for an organization comes from role assignment in the OIDC provider. Making the hierarchy verifiable, for example with accreditation credentials signed by the parent, is planned in [docs/role-model-and-oidc-providers.md](../../docs/role-model-and-oidc-providers.md) (phases 7 and 9).

#### Ownership

- **Schemas belong to the wallet,** so everyone acting in a shared wallet (for example, the members of an organization) sees the same schemas, with the same visibility and order. The user who created a schema is shown as its issuer (`issuerId`, `issuerName`).
- **Templates and credential status lists belong to the user** who created them.

### Quick tenant setup for use (optional)

The `POST /prepare-wallet` endpoint bootstraps a tenant for Web UI use. It creates one public DID per configured method (the `key` DID becomes the wallet's primary DID), OID4VC issuer and verifier records for each DID, and the issuer display. It also registers requested schemas if needed. Once the wallet has a primary DID, it is prepared; a concurrent call for the same wallet returns that DID. See `src/prepare-wallet/`.

## Core Abstractions

### DID (Decentralized Identifier)

A DID is the public identifier the tenant signs with. The Identity Service can create DIDs against several methods (`did:key`, `did:peer`, `did:indy`, `did:hedera`, `did:indybesu`) — see [Supported Identity Standards](../../README.md#supported-identity-standards) for the full list. Most Issuer flows need at least one **public DID** (a DID with a published DID document) to anchor the credential signature.

### Schema

A schema describes the _shape_ of a credential — the set of attribute names a credential of this type contains. Schemas are written to a verifiable data registry (Hyperledger Indy, Hedera, Indy Besu) and referenced by ID from credential definitions and credential offers.

The service exposes schemas through two API generations: `/schemas` (legacy, AnonCreds-focused) and `/schemas/v2` (newer, format-aware). Use v2 for new integrations.

### Credential Definition

A credential definition binds a **schema** + **issuer DID** + **signing keys** + **revocation registry** (optional) into a reusable signing template. It's the AnonCreds-flavored concept; OID4VC issuance uses the OpenID4VCI Issuer record (`/openid4vc/issuer`) instead, which plays a similar role.

### Issuance and Verification Templates

Templates are higher-level reusable definitions of a _credential offer_ or _proof request_. They encapsulate "what we issue / verify and how" so that callers (e.g. the Web UI) can issue or verify against a template by ID rather than building the offer payload from scratch each time.

- `POST /credentials/v2/offer-by-template` — issue a credential using a saved issuance template
- `POST /credentials/v2/proof-by-template` — request a proof using a saved verification template

See `src/issuance-template/` and `src/verification-template/`.

## Credential Formats and How to Choose

The Identity Service supports multiple credential formats. Pick the one that matches your ecosystem requirement.

| Format                                        | Spec / Profile               | When to use                                                                                  |
| --------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------- |
| **SD-JWT VC**                                 | IETF `vc+sd-jwt`             | EUDI Wallet, modern OID4VC ecosystems with selective disclosure as a first-class requirement |
| **mDoc / mDL**                                | ISO/IEC 18013-5 (`mso_mdoc`) | Mobile driving licences, ISO-aligned government deployments                                  |
| **W3C VC-JWT (`jwt_vc_json`)**                | OpenID4VCI profile           | Legacy W3C VCDM ecosystems where JSON-LD is not required                                     |
| **W3C VC-JWT JSON-LD (`jwt_vc_json-ld`)**     | OpenID4VCI profile           | W3C VCDM with semantic JSON-LD contexts; JWT signature                                       |
| **W3C VC with Linked Data Proofs (`ldp_vc`)** | OpenID4VCI profile           | W3C VCDM with embedded Data Integrity proofs                                                 |
| **AnonCreds (W3C representation)**            | Hyperledger AnonCreds        | ZKP-based selective disclosure, large existing AnonCreds ecosystem (W3C wrapping)            |
| **AnonCreds (legacy Indy)**                   | Hyperledger AnonCreds        | Same as above, legacy Indy DIDComm clients                                                   |

See `src/config/agent.ts` (`credentialsConfiguration`) for the canonical mapping of format to supported registry network.

## Protocols: DIDComm vs. OpenID4VC

Two transport stacks coexist. The choice of stack is largely independent of the credential format, with one constraint: AnonCreds primarily flows over DIDComm in this service.

### DIDComm

- Persistent peer-to-peer messaging between agents over an established **connection**.
- Required for AnonCreds (legacy Indy and W3C representations).
- Best for: AnonCreds, agent-to-agent flows, mediated wallets.
- Endpoints: `/connections/*`, `/credentials/*` (v1), `/proofs/*`.

### OpenID4VC (OID4VCI for issuance, OID4VP for presentation)

- Stateless web-based flows, anchored by credential offer URIs / QR codes.
- Used for SD-JWT VC, mDoc, and W3C VC-JWT family.
- Best for: cross-organization issuance, browser-driven flows, EUDI-aligned use cases.
- Endpoints: `/openid4vc/issuer`, `/openid4vc/issuance-session/*`, `/openid4vc/verification-session/*`, `/openid4vc/verifier`.

### Choosing

| Need                                                          | Use                |
| ------------------------------------------------------------- | ------------------ |
| AnonCreds credentials with predicate-based claim verification | DIDComm            |
| Secure peer-to-peer connection between agents                 | DIDComm            |
| Mobile-driving-licence (mDoc)                                 | OID4VC (mso_mdoc)  |
| EUDI Wallet interop                                           | OID4VC (SD-JWT VC) |
| One-shot QR-code-based issuance to a public wallet            | OID4VC             |

## See Also

- [Setup and Configuration](setup.md) — how to bring the service up
- [Demo flow](demo-flow.md) — end-to-end AnonCreds example over DIDComm
- [Local Configuration for Heka Wallet Integration](local-config-for-heka-wallet-integration.md) — exposing a local instance to the mobile wallet
- [Hedera Integration](hedera.md) — operating against Hiero / Hedera ledger

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
- **Tenant identity is derived from the JWT, not carried as a claim.** The wallet ID is computed from the token's `sub`, `roles[0]`, and optional `org_id` (`getWalletId(...)` in `src/common/auth/auth.service.ts`). The internal `tenantId` is then looked up from the wallet record and used by the `TenantAgentInterceptor` to load the correct tenant-scoped Credo agent for every request (`src/common/agent/tenant-agent.interceptor.ts`). See [Setup — Required JWT claims](setup.md#required-jwt-claims) for the full claim set.
- **Wallets are isolated.** Each tenant has its own Askar wallet (stored in PostgreSQL) holding that tenant's keys, DIDs, connections, and credentials. Cross-tenant access is not possible through the API.
- **One agent process, many tenants.** The service runs a single Credo agency that holds per-tenant sub-agents (via Credo's `TenantsModule`). Tenant context is established per-request from the JWT, not through process isolation.

### Quick tenant setup for use (optional)

The `POST /prepare-wallet` endpoint bootstraps a tenant for typical Issuer use: it creates a public DID and registers default schemas / credential definitions / templates if needed. After this, the tenant can issue credentials immediately. See `src/prepare-wallet/`.

## Core Abstractions

### DID (Decentralized Identifier)

A DID is the public identifier the tenant signs with. The Identity Service can create DIDs against several methods (`did:key`, `did:peer`, `did:indy`, `did:hedera`, `did:indybesu`) — see [Supported Identity Standards](../../README.md#supported-identity-standards) for the full list. Most Issuer flows need at least one **public DID** (a DID with a published DID document) to anchor the credential signature.

### Schema

A schema describes the *shape* of a credential — the set of attribute names a credential of this type contains. Schemas are written to a verifiable data registry (Hyperledger Indy, Hedera, Indy Besu) and referenced by ID from credential definitions and credential offers.

The service exposes schemas through two API generations: `/schemas` (legacy, AnonCreds-focused) and `/schemas/v2` (newer, format-aware). Use v2 for new integrations.

### Credential Definition

A credential definition binds a **schema** + **issuer DID** + **signing keys** + **revocation registry** (optional) into a reusable signing template. It's the AnonCreds-flavored concept; OID4VC issuance uses the OpenID4VCI Issuer record (`/openid4vc/issuer`) instead, which plays a similar role.

### Issuance and Verification Templates

Templates are higher-level reusable definitions of a *credential offer* or *proof request*. They encapsulate "what we issue / verify and how" so that callers (e.g. the Web UI) can issue or verify against a template by ID rather than building the offer payload from scratch each time.

- `POST /credentials/v2/offer-by-template` — issue a credential using a saved issuance template
- `POST /credentials/v2/proof-by-template` — request a proof using a saved verification template

See `src/issuance-template/` and `src/verification-template/`.

## Credential Formats and How to Choose

The Identity Service supports multiple credential formats. Pick the one that matches your ecosystem requirement.

| Format                                        | Spec / Profile               | When to use                                                                                  |
|-----------------------------------------------|------------------------------|----------------------------------------------------------------------------------------------|
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
|---------------------------------------------------------------|--------------------|
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

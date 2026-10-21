# Heka Identity Platform

[![Commit activity](https://img.shields.io/github/commit-activity/m/hiero-ledger/heka-identity-platform)](https://github.com/hiero-ledger/heka-identity-platform/commits/main)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/hiero-ledger/heka-identity-platform/badge)](https://scorecard.dev/viewer/?uri=github.com/hiero-ledger/heka-identity-platform)
[![CII Best Practices](https://bestpractices.coreinfrastructure.org/projects/10697/badge)](https://bestpractices.coreinfrastructure.org/projects/10697)
[![License](https://img.shields.io/github/license/hiero-ledger/heka-identity-platform)](https://github.com/hiero-ledger/heka-identity-platform/blob/main/LICENSE)

The **Heka Identity Platform** is a ready-to-use decentralized identity (aka Self-Sovereign Identity or SSI) solution for the Hiero ecosystem. The project delivers a complete set of applications and tools that enable issuance, management, and verification of verifiable credentials using global identity standards, while serving as a baseline reference implementation for Hiero / Hedera-based identity solutions.

The Heka Identity Platform is intended to speed up adoption of decentralized identity within the Hiero ecosystem and provide a practical, standards-aligned example for developers, integrators, and community members.

## Core Components

The platform is composed of the following components:

- **[Heka Wallet](./heka-wallet)** (Verifiable Credentials Holder): Cross-platform mobile application (built with React Native) for end users to receive, store, and present verifiable credentials.
- **[Identity Service](./heka-identity-service)**: Backend service (built with NestJS) that primarily acts as a Verifiable Credentials Issuer and Verifier, while also supporting Holder capabilities for cloud (custodial) wallet scenarios.
- **[Identity Service Web UI](./heka-identity-service-web-ui)**: Web UI application for Identity Service — allows managing schemas, credential templates, and issuance / verification flows.
- **OIDC provider** (Keycloak, Auth0 or any standards-compliant provider, not part of the repository): authenticates Identity Service users and tenants; the ready-made recipes live in [heka-sso-service/keycloak](./heka-sso-service/keycloak) and [heka-sso-service/auth0](./heka-sso-service/auth0).

The implementation is based on the **DSR SSI Toolkit** and leverages well-established open-source frameworks: **OWF Credo** and **OWF Bifold**.

## High-level Architecture

```mermaid
flowchart LR
    Wallet[Heka Wallet<br/>Holder]
    WebUI[Identity Service Web UI<br/>Issuer / Verifier Client]
    OIDC[OIDC provider<br/>Keycloak / Auth0 / …]
    IS[Identity Service<br/>Issuer / Verifier Wallet]
    Hedera[(Hiero / Hedera Ledger)]

    WebUI -->|login / register<br/>Authorization Code + PKCE| OIDC
    WebUI -->|REST API + access token| IS
    OIDC -.->|JWKS: tokens verified by| IS
    Wallet <-->|OID4VC / DIDComm| IS
    IS -->|DIDs / AnonCreds Resources| Hedera
    Wallet -->|DIDs and AnonCreds Resources resolution| Hedera
```

## Getting Started

Each component is set up and run independently. For specific setup and configuration steps, please refer to specific README files in component folders.

To run the web-facing components together, use the Compose project at the repository root. The `<profile>` below is the identity provider: `keycloak` (started by Compose) or `auth0` (your own tenant, see [heka-sso-service/auth0](./heka-sso-service/auth0)).

1. Start Docker Desktop (or another Docker engine with Compose v2).
2. Only when a phone wallet or Auth0 has to reach the services from outside your machine: start an https tunnel (e.g. ngrok) to the identity service's OID4VC port 3003, which serves credential offers, presentation requests and logos, and to `heka-sso-service` (port 3005) when Auth0 brokers to it. DIDComm flows with a remote wallet also need ports 3001 and 3002; a free ngrok account exposes one port, see the nginx recipe in [local-config-for-heka-wallet-integration.md](./heka-identity-service/docs/local-config-for-heka-wallet-integration.md). For a desktop-only run skip this step.
3. Copy `.env.example` to `.env` and set the variables: the tunnel URLs from step 2 (leave them empty without a tunnel) and the identity provider block for the chosen profile.
4. Copy the OIDC client configuration of the SSO service: `cp heka-sso-service/env/oidc-clients.example.json heka-sso-service/env/oidc-clients.json`.
5. Create or adjust the verifiable credentials the SSO service requests at login in `heka-sso-service/env/oidc-login-configs.json`. The committed file asks for the given name, family name and the age-over-18 flag from an SD-JWT mDL credential, the same credential `heka-sso-service/env/.env.example` configures for a host-run service:

   ```json
   [
     {
       "id": "default",
       "verificationTemplate": "default",
       "dcqlQuery": {
         "credentials": [
           {
             "id": "mdl",
             "format": "dc+sd-jwt",
             "meta": { "vct_values": ["mDL"] },
             "claims": [{ "path": ["given_name"] }, { "path": ["family_name"] }, { "path": ["age_over_18"] }]
           }
         ]
       },
       "claimMapping": {
         "mdl.given_name": "given_name",
         "mdl.family_name": "family_name",
         "mdl.age_over_18": "age_over_18"
       },
       "subStrategy": "derived",
       "issuerAllowlist": []
     }
   ]
   ```

   `dcqlQuery` is the DCQL query the SSO service sends to the Identity Service when it creates the verification session; `claimMapping` maps the disclosed claims (`<credential query id>.<claim path>`) to OIDC claims; `subStrategy` selects how the OIDC `sub` is derived; `issuerAllowlist` lists the trusted credential issuers. The entry's `id` is referenced by `loginConfigId` in `oidc-clients.json`. See the [SSO service README](./heka-sso-service/README.md#oidc-provider) for the full format.
6. Run `docker compose --profile <profile> up -d --build`.
7. Prepare the SSO verifier wallet and record its DID in `.env`: `./docker/prepare-sso-verifier.ps1 -Provider <profile>` on Windows, `bash docker/prepare-sso-verifier.sh --provider <profile>` on Linux / macOS.
8. Restart the SSO service with the new DID: `docker compose --profile <profile> up -d heka-sso-service`.
9. Optional, for the public demo pages of the identity web UI: run `yarn install && yarn prepare-demo-user` in `heka-identity-service-web-ui` (it talks to the identity service on `localhost:3000` and uses the demo-token broker the stack enables), copy the printed DID into `IDENTITY_WEBUI_DEMO_USER_DID` in `.env`, then rebuild the UI image: `docker compose --profile <profile> up -d --build heka-identity-web-ui`. The script also writes the DID into that package's own `.env`, which only a host-run `yarn start` uses.

The recommended approach for exploring the platform is the following:
- Set up and get familiar with core functional components - [Identity Service](./heka-identity-service) and [Heka Wallet (Mobile application)](./heka-wallet)
- Explore the [Identity Service Web UI](./heka-identity-service-web-ui) together with an OIDC provider set up from the [Keycloak](./heka-sso-service/keycloak) or [Auth0](./heka-sso-service/auth0) recipe. The Web UI is a more general-purpose application that still represents a crucial piece for complete experience and testing capabilities
- Once you get familiar with the baseline functionality of a platform, feel free to check out the [demo folder](./demo) to explore various decentralized identity use cases implemented with Heka Identity Platform

## Supported Identity Standards

The platform supports a wide range of global decentralized identity standards, including:

- **Credential Exchange Protocols**: OpenID for Verifiable Credentials (OID4VC), DIDComm
- **Credential Formats**: W3C VC-JWT, W3C VC-JWT JSON-LD, W3C VC with Linked Data Proofs, IETF SD-JWT VC, ISO mDoc (mDL), Hyperledger AnonCreds
- **DID Methods**: `did:key`, `did:peer`, `did:jwk`, `did:web`, `did:indy` (Hyperledger Indy), `did:hedera` (Hiero / Hedera), `did:indybesu` (Indy Besu ledger)

## Agentic AI Integration

Apart from providing support for standard decentralized identity flows, the platform aims to enable use cases that emerge from synergy between identity and Agentic AI.
This includes (but is not limited to) VC-based trust models for AI agents and the Agentic Economy.

Initial supported use cases:

- **VC-based authorization for agents**: [OID4VP In-Task Authorization Extension for Agent2Agent (A2A) protocol](https://github.com/DSRCorporation/a2a-oid4vp-in-task-auth-extension/blob/main/v1/spec.md)

## Roadmap

See [roadmap](./ROADMAP.md) for the platform's planned scope and timeline — covering core maintenance, emerging protocol support, AI / agentic economy integrations, and other development directions.

## Demos

Please see the [demo folder](./demo) to explore demos showcasing various decentralized identity use cases implemented with Heka Identity Platform.

- [Agent-to-Agent (A2A) + OID4VP integration](./demo/a2a-oid4vp): A demo showcasing OID4VP-based authentication for AI agents leveraging Agent2Agent (A2A) protocol

Also, feel free to explore Heka-based demos available on YouTube:

- [Agent2Agent interactions with Just-In-Time authorization via OpenID for Verifiable Credentials](https://www.youtube.com/watch?v=3JgFZBGXXXI)

## Hiero Identity Community

For details and references on how to engage with the Hiero Identity community, please see [Hiero Identity Collaboration Hub repo](https://github.com/hiero-ledger/identity-collaboration-hub).

### LFDT mentorship program

Heka Identity Platform is a core component for an upcoming LFDT mentorship project - [Hiero Contributor Identity Verification Prototype](https://mentorship.lfx.linuxfoundation.org/project/64c64daa-ffdb-4871-82f5-01c1bdc7fecc/).

## Governance

The Heka Identity Platform operates under the governance of the **Hiero Technical Steering Committee (TSC)**, in alignment with existing Hiero project policies.

- Maintainers are nominated and approved according to Hiero governance rules.
- All code and documentation follow LF and Hiero licensing and compliance requirements.

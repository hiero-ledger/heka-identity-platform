# Heka Identity Platform

[![Commit activity](https://img.shields.io/github/commit-activity/m/hiero-ledger/heka-identity-platform)](https://github.com/hiero-ledger/heka-identity-platform/commits/main)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/hiero-ledger/heka-identity-platform/badge)](https://scorecard.dev/viewer/?uri=github.com/hiero-ledger/heka-identity-platform)
[![CII Best Practices](https://bestpractices.coreinfrastructure.org/projects/10697/badge)](https://bestpractices.coreinfrastructure.org/projects/10697)
[![License](https://img.shields.io/github/license/hiero-ledger/heka-identity-platform)](https://github.com/hiero-ledger/heka-identity-platform/blob/main/LICENSE)

The **Heka Identity Platform** is a ready-to-use decentralized identity (aka Self-Sovereign Identity or SSI) solution for the Hiero ecosystem. The project delivers a complete set of applications and tools that enable issuance, management, and verification of verifiable credentials using global identity standards, while serving as a baseline reference implementation for Hiero / Hedera-based identity solutions.

The Heka Identity Platform is intended to accelerate adoption of decentralized identity within the Hiero ecosystem and provide a practical, standards-aligned example for developers, integrators, and community members.

## Core Components

The Heka Identity Platform delivers a complete decentralized identity solution composed of two primary applications:

1.  **Mobile Wallet (Verifiable Credentials Holder)**: A cross-platform mobile application (built with React Native) for end users to receive, store, and present verifiable credentials.
2.  **Identity Service**: A backend service (built with NestJS) that primarily acts as a Verifiable Credentials Issuer and Verifier, while also supporting Holder capabilities for cloud (custodial) wallet scenarios.

The implementation is based on the **DSR SSI Toolkit** and leverages well-established open-source frameworks: **OWF Credo** and **OWF Bifold**.

## Scope and Supported Standards

The platform supports a wide range of global decentralized identity standards, including:

- **Protocols**: OpenID4VC, DIDComm
- **Credential Formats**: W3C Verifiable Credentials, SD-JWT VC, ISO mDL, Hyperledger AnonCreds
- **DID Methods**: Multiple DID methods, including Hiero / Hedera-based DIDs

## Governance

The Heka Identity Platform operates under the governance of the **Hiero Technical Steering Committee (TSC)**, in alignment with existing Hiero project policies.

- Maintainers are nominated and approved according to Hiero governance rules.
- All code and documentation follow LF and Hiero licensing and compliance requirements.

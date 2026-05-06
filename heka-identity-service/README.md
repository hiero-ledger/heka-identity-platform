# Heka Identity Service

## Description

Heka Identity Service is a reference implementation of a server-side Decentralized Identity application supporting Hiero / Hedera ledger that provides services for issuing and verifying credentials based on the [Credo Framework JavaScript](https://github.com/openwallet-foundation/credo-ts) and [DSR SSI Toolkit](https://en.dsr-corporation.com/news/decentralized-digital-wallet-and-toolkit/). It uses
Hiero Ledger for storing DIDs, schemas and credential definitions.
The solution is designed as a multi-tenant system, meaning that a single instance of Identity Service can serve multiple agents. When an agent requests access to the system, a unique wallet is created for that agent. This approach provides a scalable and efficient solution for managing multiple agents within the same system.

## Configuration

The service is configured via environment variables. The full reference (~30 variables across HTTP server, agent transports, persistence, JWT, ledger / DID methods, mDoc, logging, and health) lives in [Setup — Environment Variables](docs/setup.md#environment-variables). The most commonly customized are:

- `JWT_SECRET`, `JWT_VERIFY_OPTIONS_ISSUER`, `JWT_VERIFY_OPTIONS_AUDIENCE` — must align with the [Heka Auth Service](../heka-auth-service/README.md#jwt-alignment-with-identity-service).
- `HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_KEY`, `HEDERA_NETWORK` — see [Hedera Integration](docs/hedera.md).
- `MIKRO_ORM_HOST`, `MIKRO_ORM_PORT`, `MIKRO_ORM_USER`, `MIKRO_ORM_PASSWORD`, `MIKRO_ORM_DATABASE` — application database connection.
- `DID_METHODS` — comma-separated list of enabled DID methods (default `indy,key,hedera`).

## Documentation

**Getting Started**
- [Setup and Configuration](docs/setup.md) — install, configure, and run the service locally or in Docker
- [Concepts and Glossary](docs/concepts.md) — roles, multi-tenancy, core abstractions, credential formats
- [Demo flow](docs/demo-flow.md) — end-to-end AnonCreds issuance and verification example

**How-To Guides**
- [How to Issue an SD-JWT VC](docs/how-to-issue-sd-jwt-vc.md) — Basic example flow for OID4VCI-based issuance with SD-JWT format
- [Local Configuration for Heka Wallet Integration](docs/local-config-for-heka-wallet-integration.md) — exposing a local instance to the mobile wallet

**Integration**
- [Hedera Integration](docs/hedera.md) — operator credentials, network selection, what gets written on-chain
- [Heka Identity Service API](docs/api.md) — REST API and webhook / WebSocket notifications

We recommend reading [Setup and Configuration](docs/setup.md) first to get a working instance, then [Concepts and Glossary](docs/concepts.md) to orient yourself in the model. From there, [Demo flow](docs/demo-flow.md) walks through a complete example, and the how-to guides cover format-specific issuance.

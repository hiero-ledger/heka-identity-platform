# Heka Identity Service

## Description

Heka Identity Service is a reference implementation of a server-side Decentralized Identity application supporting Hiero / Hedera ledger that provides services for issuing and verifying credentials based on the [Credo Framework JavaScript](https://github.com/openwallet-foundation/credo-ts) and [DSR SSI Toolkit](https://en.dsr-corporation.com/news/decentralized-digital-wallet-and-toolkit/). It uses
Hiero Ledger for storing DIDs, schemas and credential definitions.
The solution is designed as a multi-tenant system, meaning that a single instance of Identity Service can serve multiple agents. When an agent requests access to the system, a unique wallet is created for that agent. This approach provides a scalable and efficient solution for managing multiple agents within the same system.

## Documentation

- [Setup and Configuration](docs/setup.md)
- [Heka Identity Service API](docs/api.md)
- [Demo flow](docs/demo-flow.md)

We recommend that you read the setup and configuration instructions first to ensure that you have a working instance of Heka Identity Service. Once you have a working instance, you can use the API documentation to develop custom integrations with Heka Identity Service. Finally, the demo flow provides a practical example of how Heka Identity Service can be used in a real-world scenario.

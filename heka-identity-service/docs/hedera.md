# Hedera Integration

The Heka Identity Service integrates with the [Hiero / Hedera](https://hedera.com) ledger to register DIDs and AnonCreds resources (schemas, credential definitions, and revocation registry resources).
This page covers configuration, operator credentials, and operational considerations.

## Overview

When the `hedera` DID method is enabled (default), the service can:

- Create and resolve `did:hedera` DIDs.
- Publish AnonCreds schemas, credential definitions, and revocation registries to Hedera (via the `HederaAnonCredsRegistry`).
- Resolve AnonCreds resources written by other Hedera-based issuers.

Hedera support is provided by the [`@credo-ts/hedera`](https://github.com/openwallet-foundation/credo-ts/tree/main/packages/hedera) Credo module.
The integration is configured in `src/common/agent/agent-modules.provider.ts` and `src/config/agent.ts`.

## Required Configuration

The service needs a Hedera **operator account** to submit transactions to the network. Configure it via environment variables:

| Variable              | Required                    | Default                        | Notes                                                                                        |
|-----------------------|-----------------------------|--------------------------------|----------------------------------------------------------------------------------------------|
| `HEDERA_NETWORK`      | No                          | `testnet`                      | One of `testnet`, `mainnet`, `previewnet`.                                                   |
| `HEDERA_OPERATOR_ID`  | **Yes for non-trivial use** | A built-in testnet account ID  | The Hedera account that pays for and signs ledger transactions. Format: `0.0.<account-num>`. |
| `HEDERA_OPERATOR_KEY` | **Yes for non-trivial use** | A built-in testnet private key | DER-encoded Ed25519 private key for the operator account.                                    |

> **Security note:** The defaults baked into `src/config/agent.ts` are shared development credentials checked into the repository. They are convenient for local exploration but **MUST NOT be used outside testnet** — anyone with the source can submit transactions on that account. Set your own values in any environment that handles production data.

## Getting Operator Credentials

### Testnet

1. Create a Hedera Portal account at [portal.hedera.com](https://portal.hedera.com)
2. Open the **Testnet** dashboard. A funded testnet account is provisioned automatically
3. Copy the **Account ID** (`0.0.X`) and the **DER Encoded Private Key** for use as `HEDERA_OPERATOR_ID` / `HEDERA_OPERATOR_KEY`
4. Testnet HBAR can be refilled — no purchase is required (the process is manual and done on Hedera Portal)

### Mainnet

1. Open a Hedera Portal account and complete KYC if required
2. Create a mainnet account (this requires HBAR, either purchased or transferred)
3. Use the resulting Account ID and DER-encoded private key

For programmatic account creation (CI / multiple environments), see the [Hedera SDK documentation](https://docs.hedera.com/hedera/sdks-and-apis/sdks).

## What Gets Written to Hedera

The service writes the following resource types when Hedera is the active registry:

| Resource                                                   | When written                                                                                    |
|------------------------------------------------------------|-------------------------------------------------------------------------------------------------|
| **DID document**                                           | When a tenant creates a `did:hedera` (e.g. via `POST /dids` or via `prepare-wallet`).           |
| **AnonCreds schema**                                       | When a tenant publishes a schema against a Hedera-based issuer DID.                             |
| **AnonCreds credential definition**                        | When a credential definition is registered against a Hedera schema.                             |
| **AnonCreds revocation registry definition / status list** | If revocation is enabled for a credential definition; updated whenever credentials are revoked. |

Each of these is a real Hedera transaction and consumes HBAR. Plan operator-account funding accordingly for production deployments — especially revocation, which writes on every revocation event.

## Verifying the Setup

After configuring the operator credentials and restarting the service:

1. Authenticate against the API (see [Demo flow](demo-flow.md)).
2. Call `POST /dids` with body `{"method": "hedera"}` to create a public `did:hedera` for the calling tenant. The service should return a `did:hedera:<network>:<account-id>_<topic-id>` style DID and a corresponding DID document. (Omitting the `method` field falls back to the registrar default — `did:key` — even when `hedera` is enabled in `DID_METHODS`.)
3. If the operator key is misconfigured or under-funded, the call will fail with a transaction error from `@hashgraph/sdk`. Inspect the logs to see whether the failure is on signing (key format) or on submission (insufficient balance, invalid account).

## See Also

- [`@credo-ts/hedera`](https://github.com/openwallet-foundation/credo-ts/tree/main/packages/hedera) — upstream Credo module
- [`@hiero-did-sdk/client`](https://www.npmjs.com/package/@hiero-did-sdk/client) — Hiero DID SDK used under the hood
- [Setup and Configuration](setup.md) — full env var reference
- [Concepts and Glossary](concepts.md) — where DIDs / schemas / credential definitions fit in the model

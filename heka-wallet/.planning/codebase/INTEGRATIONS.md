# External Integrations

**Analysis Date:** 2026-03-27

## APIs & External Services

**Wallet Backup Service:**
- Service: Custom backup provider
- What it's used for: Secure wallet seed/key backup and recovery via passkeys
- SDK/Client: `axios` HTTP client
- Endpoint: `walletProviderURL` (default: `https://backup.ssi-agency.dsr-corporation.com/api/v1`)
- Implementation: `app/src/utils/useWalletBackupHelpers.ts`
- Auth: None (direct backup upload to `/backup` endpoint)

**Agency/Identity Service:**
- Service: Identity agency provider
- What it's used for: Credential offer retrieval, invitation handling, agency-mediated protocols
- SDK/Client: Credo-TS modules
- Endpoint: `agencyProviderURL` (default: `https://api.ssi-agency.dsr-corporation.com`)
- Implementation: Bifold core integrations

**OAuth Provider:**
- Service: Generic OAuth 2.0 provider
- What it's used for: User authentication and profile retrieval
- SDK/Client: `react-native-app-auth` 6.4.3
- Default Config Location: `app/src/config.ts` - `oauthStoreConfig`
- Default Endpoints:
  - Authorization: 'default-authorization-endpoint'
  - Token: 'default-token-endpoint'
  - Revocation: 'default-revocation-endpoint'
  - User Info: 'default-user-info-endpoint'
- Implementation: `app/src/stores/OAuthStore.ts`
- Auth: OAuth 2.0 with PKCE and client credentials
- Features:
  - Token refresh on expiration
  - User info retrieval via `getUserInfo()`
  - Account deletion support

**Keplr Wallet Integration (Optional):**
- Service: Cosmos wallet for chain interaction
- What it's used for: Multi-chain Cosmos token/asset management
- SDK/Client: Custom `@heka-wallet/keplr` package
- Chain: Osmosis Testnet (`osmo-test-5`)
- RPC: `https://rpc.osmotest5.osmosis.zone`
- REST: `https://lcd.osmotest5.osmosis.zone`
- Feature Flag: `ENABLE_KEPLR_INTEGRATION` environment variable
- Implementation: `packages/keplr/` workspace

## Data Storage

**Databases:**
- **Credo Wallet Storage**: Askar-based secure storage
  - Connection: Local file system (encrypted)
  - Client: `@openwallet-foundation/askar-react-native` 0.5.0-alpha
  - Features: Key derivation with Argon2, wallet backup/restore
  - Implementation: `app/src/utils/useWalletBackupHelpers.ts`

**Key-Value Storage:**
- **React Native AsyncStorage**
  - Purpose: Local preference and state storage
  - Client: `@react-native-async-storage/async-storage` 2.2.0
  - Usage locations:
    - `PUBLIC_DID_KEY` - Stored public DID
    - `PUBLIC_INVITATION_ID_KEY` - Stored invitation ID
    - `OAUTH_TOKEN_KEY` - OAuth tokens
    - `OAUTH_USER_INFO_KEY` - User profile info
    - `APP_LAUNCHED_KEY` - First launch detection

**Secure Credential Storage:**
- **React Native Keychain**
  - Purpose: Secure OS-level credential storage
  - Client: `react-native-keychain` 10.0.0
  - Storage types: RSA (biometric) or AES-GCM (passcode)
  - Implementation: `app/src/utils/keychain.ts`

**Encrypted Local Storage:**
- **React Native Encrypted Storage**
  - Purpose: Encrypted local file storage
  - Client: `react-native-encrypted-storage` 4.0.2
  - Usage: Wallet-related sensitive data

**File Storage:**
- Local filesystem only (no cloud storage integration)
- Uses: `react-native-fs` 2.20.0 for file operations
- Backup/restore: Zip archive support via `react-native-zip-archive`

**Caching:**
- In-memory mobx stores for application state
- No distributed cache (Redis, Memcached, etc.)

## Authentication & Identity

**Auth Provider:**
- **Custom OAuth 2.0 + Passkeys**
  - OAuth Implementation: `react-native-app-auth` handles OAuth flow
  - Passkey Support: `react-native-passkey` 2.1.1 for WebAuthn
  - Biometric Auth: `react-native-fingerprint-scanner` 6.0.0
  - Storage: `react-native-keychain` for credential storage

**Local Authentication:**
- PIN-based unlock (screens: `PINCreate.tsx`, `PINEnter.tsx`)
- Biometric unlock (screens: `UseBiometry.tsx`)
- Passkey authentication for wallet backup recovery

**Internal Identity Management:**
- DID-based identity (Peer DIDs, Key DIDs, Hedera DIDs)
- Holder/Subject identity stored in wallet
- Verifiable credential exchange via Credo-TS

## Ledgers & Blockchain Integration

**Hedera Testnet:**
- Network: Hedera testnet
- Purpose: Decentralized identifier and credential storage
- SDK/Client: `@credo-ts/hedera` 0.6.1
- Default Operator: ID `0.0.5065521`, configurable via `HEDERA_OPERATOR_ID/KEY`
- Implementation: `app/src/utils/agent.ts`
- Features: HederaDidRegistrar, HederaDidResolver, HederaAnonCredsRegistry

**Indy VDR (Multiple Ledgers):**
- Purpose: AnonCreds schema/credential definition storage
- SDK/Client: `@credo-ts/indy-vdr` 0.6.1
- Implementation: `app/src/utils/agent.ts`
- Features: Ledger pooling, registry support

**Indy Besu (EVM-based):**
- Purpose: Smart contract-based DID/credential registry
- Purpose: Ethereum-compatible Indy implementation
- SDK/Client: Custom `IndyBesuDidResolver`, `IndyBesuAnoncredsRegistry`
- RPC URL: Configurable (default: `http://192.168.1.145:8545/`)
- Smart Contracts:
  - DID Registry: `0x0000000000000000000000000000000000003333` (configurable)
  - Schema Registry: `0x0000000000000000000000000000000000005555` (configurable)
  - Credential Definition Registry: `0x0000000000000000000000000000000000004444` (configurable)
- Signer Private Key: Configurable environment variable
- Implementation: `app/src/indy-besu/` directory

## DID Communication & Messaging

**DID Comm Mediator:**
- Purpose: Route DID Comm messages for wallet
- Endpoint: `MEDIATOR_URL` environment variable
- SDK/Client: `@credo-ts/didcomm` 0.6.1
- Features: Mediation recipient, pickup strategy V2
- Implementation: `app/src/utils/agent.ts`

**Message Protocols:**
- DID Comm v2 for peer communication
- Basic message invitations (simple connections)
- Credential offer/request (ARIES)
- Presentation request/submission (ARIES)
- OpenID4VC flows (modern credential protocols)

## Credential Protocols

**AnonCreds (Anonymous Credentials):**
- SDK: `@credo-ts/anoncreds` 0.6.1
- Registries: Indy VDR, Indy Besu, Hedera
- Features: Schema/CredDef management, zero-knowledge proofs
- Tails Service: Custom `TailsService` in `app/src/utils/revocation/`

**OpenID4VC:**
- SDK: `@credo-ts/openid4vc` 0.6.1
- Support for:
  - OpenID4VCI (credential issuance)
  - OpenID4VP (presentation requests)
  - OID4VP metadata endpoints
- Metadata: Logo URI support in credential metadata
- Implementation: `app/src/credentials/useOpenIdHandlers.ts`

**SD-JWT (Selective Disclosure JWT):**
- SDK: `@sd-jwt/decode` 0.7.2, `@sd-jwt/jwt-status-list` 0.17.0
- Purpose: Selective disclosure credentials
- Mappers: `app/src/credentials/mappers/sd-jwt.ts`

**Mobile Driver License (mDL):**
- SDK: `@credo-ts/core` (Mdoc support)
- Purpose: ISO 18013-5 compliant mobile ID
- Mappers: `app/src/credentials/mappers/mdoc.ts`

**W3C Verifiable Credentials:**
- SDK: `@credo-ts/webvh` 0.6.1
- Purpose: W3C VC data model support
- Status: Integrated in core

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry, DataDog, etc.)

**Logs:**
- Bifold/Credo logging via `ConsoleLogger`
- Custom wrapper: `CredoLogger` in `app/src/logger`
- Log levels: DEBUG, INFO, WARN, ERROR
- Runtime log provider: `@heka-wallet/shared` - `GlobalLogger`
- No centralized log aggregation

## Push Notifications

**Push Notifications:**
- SDK: `@credo-ts/push-notifications` 0.7.1
- Purpose: Wallet notifications (credentials, presentations)
- Implementation: Integrated via Bifold core
- Configuration: Feature flag or explicit setup

## DID Resolution

**DID Methods Supported:**
- `did:peer` - Peer DIDs (created in wallet)
- `did:key` - Key DIDs
- `did:jwk` - JWK DIDs
- `did:web` - Web DIDs
- `did:hedera` - Hedera DIDs
- Custom Indy Besu DIDs

**Resolvers:**
- `WebDidResolver` - HTTP resolution
- `KeyDidResolver` - Key DID expansion
- `PeerDidResolver` - Peer DID resolution
- `JwkDidResolver` - JWK DID resolution
- `HederaDidResolver` - Hedera resolution
- `IndyBesuDidResolver` - Indy Besu custom resolver

## Environment Configuration

**Required env vars:**
- `MEDIATOR_URL` - DID Comm mediator
- `WALLET_PROVIDER_URL` - Backup service
- `AGENCY_PROVIDER_URL` - Agency API
- `HEDERA_OPERATOR_ID` - Hedera testnet operator
- `HEDERA_OPERATOR_KEY` - Hedera signing key
- `INDY_BESU_*` - Smart contract addresses and RPC
- `OAUTH_STORE_CONFIG` - OAuth configuration (JSON)
- `ENABLE_*` feature flags

**Secrets location:**
- `.env` file in `app/` directory (not committed to git)
- Runtime via `react-native-config`
- Secure storage in OS keychain

## Webhooks & Callbacks

**Incoming:**
- OAuth redirect URI: `com.heka.wallet.auth:/oauthredirect`
- Deep links for credential offers and presentation requests
- Push notification callbacks (if enabled)

**Outgoing:**
- Wallet backup uploads to backup provider endpoint
- Account deletion requests to OAuth provider
- No other explicit webhook support detected

---

*Integration audit: 2026-03-27*

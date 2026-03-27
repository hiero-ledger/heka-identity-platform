# External Integrations

## Databases

### PostgreSQL
- **Used by:** heka-identity-service, heka-auth-service
- **ORM:** MikroORM (v5 in identity-service, v6 in auth-service)
- **Migrations:** `mikro-orm migration:*` commands
- **Docker:** `postgres:15` image, port 5432
- **Config:** `MIKRO_ORM_HOST`, `WALLET_POSTGRES_HOST` env vars

### Aries Askar (Wallet Storage)
- **Used by:** heka-identity-service, heka-wallet
- **Purpose:** Secure key and credential storage for SSI agents
- **Packages:** `@openwallet-foundation/askar-nodejs` (server), `@openwallet-foundation/askar-react-native` (mobile)
- **Config:** `WALLET_POSTGRES_HOST` for server-side wallet DB

## Object Storage

### MinIO (S3-compatible)
- **Used by:** heka-identity-service
- **Purpose:** File storage (credential schemas, tails files, static assets)
- **Package:** `minio`
- **Config:** `fileStorageConfigDefaults` in `heka-identity-service/src/config/file-storage`

## Distributed Ledgers

### Hyperledger Indy (via Indy VDR)
- **Purpose:** AnonCreds credential definitions, schemas, revocation registries
- **Packages:** `@credo-ts/indy-vdr`, `@hyperledger/indy-vdr-nodejs` / `indy-vdr-react-native`
- **Config:** Pool configurations for Indy networks

### Hedera Hashgraph
- **Purpose:** DID registration and resolution on Hedera network
- **Packages:** `@credo-ts/hedera`, `HederaModule`
- **Config:** Hedera network credentials and DID method configuration

### Indy-Besu (Ethereum-based)
- **Purpose:** Indy-compatible ledger on Besu (Ethereum) network
- **Packages:** Local `indybesu-vdr` (file: reference), custom `IndyBesuDidResolver`, `IndyBesuAnoncredsRegistry`
- **Location:** `heka-identity-service/indy-besu-vdr-pkg/`, `heka-wallet/app/src/indy-besu/`

## Identity Protocols

### DIDComm v2
- **Package:** `@credo-ts/didcomm`
- **Features:** Connections, credential exchange, proof exchange, mediation
- **Transport:** HTTP and WebSocket endpoints
- **Ports:** 3001 (HTTP agent), 3002 (WS agent)

### OpenID4VC (OpenID for Verifiable Credentials)
- **Package:** `@credo-ts/openid4vc`
- **Features:** OID4VCI (issuance), OID4VP (verification/presentation)
- **Modules:** `OpenId4VcIssuerModule`, `OpenId4VcVerifierModule`
- **Sessions:** Tracked via `OpenId4VcIssuanceSessionModule`, `OpenId4VcVerificationSessionModule`

### AnonCreds
- **Package:** `@credo-ts/anoncreds`, `@hyperledger/anoncreds-*`
- **Features:** Schema creation, credential definition, issuance, proof presentation, revocation
- **Native bindings:** `anoncreds-react-native` (mobile), `anoncreds-nodejs` (server)

## Authentication

### JWT Authentication
- **Used by:** heka-identity-service, heka-auth-service
- **Packages:** `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`
- **Pattern:** Bearer token auth with JWT strategy

### OAuth (Mobile Wallet)
- **Location:** `heka-wallet/app/src/stores/OAuthStore.ts`
- **Purpose:** OAuth flow for wallet authentication against backend services

### Passkeys / WebAuthn (Mobile Wallet)
- **Location:** `heka-wallet/app/src/stores/PasskeysStore.ts`
- **Purpose:** Biometric/passkey authentication for wallet access

## APIs

### REST APIs
- **heka-identity-service:** NestJS controllers with Swagger docs (port 3000)
  - Credential management, DID operations, schema management, proof verification
  - OpenID4VC issuance and verification endpoints
- **heka-auth-service:** User management, OAuth endpoints
  - Port configured via env

### WebSocket
- **heka-identity-service:** `@nestjs/platform-ws`, `@nestjs/websockets`
- **Purpose:** Real-time agent event notifications (port 3002)

### OCA (Overlay Capture Architecture)
- **Module:** `heka-identity-service/src/common/oca/oca.module.ts`
- **Purpose:** Credential display branding and overlay bundles
- **Client:** `RemoteOCABundleResolver` in wallet resolves overlays from service

## Push Notifications
- **Package:** `@credo-ts/push-notifications`
- **Purpose:** Notify wallet of incoming credentials/proofs via push

## Third-Party Services

### Cosmos / Keplr Integration
- **Location:** `heka-wallet/packages/keplr/`
- **Purpose:** Cosmos blockchain wallet functionality
- **State:** MobX-based `KeplrStore`

## Demo / A2A
- **Location:** `demo/a2a-oid4vp/`
- **Purpose:** Agent-to-Agent OpenID4VP demonstration
# Technology Stack

## Languages & Runtime

| Language | Version | Usage |
|----------|---------|-------|
| TypeScript | ~5.5 | Primary language across all services |
| Node.js | >=20.19.2 <23.0.0 | Backend services runtime |
| React Native | 0.81.x | Mobile wallet (iOS + Android) |
| React | 18.3.x | Web UI |

## Package Managers

- **heka-wallet**: Yarn 4.9.4 (Berry) with workspaces
- **heka-identity-service**: Yarn 4.9.4
- **heka-auth-service**: npm/yarn (no lockfile constraint)
- **heka-identity-service-web-ui**: npm/yarn with Husky git hooks

## Core Frameworks

### Backend Services
- **NestJS** — heka-identity-service (v11.x), heka-auth-service (v10.x)
- **MikroORM** — ORM for PostgreSQL; identity-service uses v5, auth-service uses v6
- **Passport + JWT** — Authentication in both services
- **Pino** — Structured logging (via nestjs-pino)

### Mobile Wallet (`heka-wallet/`)
- **React Native 0.81** with Expo modules
- **@bifold/core** — Aries Bifold fork (migrating from `@hyperledger/aries-bifold-core`)
- **@credo-ts/*@0.6.1** — SSI/DIDComm agent framework (anoncreds, askar, core, didcomm, openid4vc, hedera, etc.)
- **MobX** — State management for Keplr cosmos wallet integration
- **React Navigation 6.x** — Screen navigation (stack + bottom tabs)

### Web UI (`heka-identity-service-web-ui/`)
- **React 18** with Webpack 5
- **Redux Toolkit** — State management
- **React Router DOM 6** — Routing
- **React Hook Form + Joi** — Form handling and validation
- **Storybook 8** — Component development
- **SCSS Modules** — Styling

## Key Dependencies

### SSI / Identity
- `@credo-ts/core@0.6.1-0.6.2` — Core SSI agent (DID, credentials, proofs)
- `@credo-ts/didcomm` — DIDComm v2 messaging protocol
- `@credo-ts/anoncreds` — AnonCreds credential format
- `@credo-ts/openid4vc` — OpenID4VC issuance and verification
- `@credo-ts/hedera` — Hedera DID method support
- `@credo-ts/indy-vdr` — Indy VDR ledger integration
- `@credo-ts/webvh` — WebVH DID method
- `@bifold/core` — Aries Bifold mobile wallet framework (forked)
- `@bifold/oca` — Overlay Capture Architecture for credential display
- `@hyperledger/anoncreds-react-native` — Native AnonCreds bindings
- `@openwallet-foundation/askar-*` — Secure key storage (Aries Askar)
- `indybesu-vdr` — Local Indy-Besu VDR package (Rust → WASM/native)
- `@sd-jwt/decode` — SD-JWT decoding for selective disclosure

### Blockchain / Cosmos (Keplr)
- `ethers@6` — Ethereum interactions
- `mobx` — Keplr state management
- `@cosmjs/*` (via keplr integration) — Cosmos SDK interaction

### Infrastructure
- `@mikro-orm/postgresql` — PostgreSQL ORM
- `minio` — S3-compatible object storage (identity service)
- `axios` — HTTP client
- `swagger-ui-express` + `@nestjs/swagger` — API documentation

## Configuration

- **Environment variables** via `.env` files and `react-native-config`
- **NestJS ConfigModule** for backend services
- **MikroORM CLI** config for database migrations
- **Webpack** for web UI bundling
- **Metro** for React Native bundling
- **ESLint + Prettier** across all projects
- **Jest** for testing across all projects
- **Docker Compose** for local development (PostgreSQL)

## Build & Deploy

- `tsc` — TypeScript compilation for backend
- `webpack` — Web UI bundling (dev/prod modes)
- `react-native` CLI — Mobile builds (android/ios)
- `Gradle` — Android builds
- `CocoaPods` — iOS dependency management
- `patch-package` — Post-install dependency patching
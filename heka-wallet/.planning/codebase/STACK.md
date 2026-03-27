# Technology Stack

**Analysis Date:** 2026-03-27

## Languages

**Primary:**
- TypeScript 5.9.2 - All source code, type-safe development
- JavaScript (ES2020) - Config files, Babel/Metro setup

**Secondary:**
- Java - Android native code
- Swift - iOS native code
- Kotlin - Android native code (MainApplication)

## Runtime

**Environment:**
- React Native 0.81.5 - Cross-platform mobile framework
- Node.js 20.19.2 to <23.0.0 - Development and build environment
- Hermes JS Engine - Android (enabled in Gradle)

**Package Manager:**
- Yarn 4.9.4 - Workspace and dependency management
- Lockfile: Present (`yarn.lock`)

## Frameworks

**Core:**
- Bifold/Aries - DSR Corporation fork (`@bifold/core@1.0.0-alpha-heka.3`) - SSI wallet framework
- Credo-TS 0.6.1 - Credential handling and identity protocols
- React 19.1.4 - UI framework
- React Navigation 6.x - Navigation/routing

**Testing:**
- Jest 29.6.4 - Unit/integration testing
- Testing Library (React Native) 13.3.0 - Component testing
- MockDate 3.0.5 - Time mocking

**Build/Dev:**
- Metro - React Native bundler
- Expo - Native module support (patches applied)
- Babel 7.28.6 - JavaScript transpilation
- react-native-config 1.5.5 - Environment configuration
- Nerdbank.GitVersioning 3.5.107 - Semantic versioning

## Key Dependencies

**Critical (Identity/Credential Stack):**
- `@credo-ts/core` 0.6.1 - Core credential management
- `@credo-ts/didcomm` 0.6.1 - DID communication protocol
- `@credo-ts/anoncreds` 0.6.1 - Anonymous credentials
- `@credo-ts/indy-vdr` 0.6.1 - Indy ledger support
- `@credo-ts/hedera` 0.6.1 - Hedera ledger support
- `@credo-ts/openid4vc` 0.6.1 - OpenID4VC credential issuance/presentation
- `@credo-ts/askar` 0.6.1 - Secure wallet storage
- `@credo-ts/webvh` 0.6.1 - W3C Verifiable Credentials support
- `@credo-ts/hedera` 0.6.1 - Hedera blockchain integration
- `@bifold/oca` 3.0.0 - Overlay Capture Architecture for credential display
- `@bifold/verifier` 3.0.0 - Presentation verification

**Native Bindings:**
- `@hyperledger/anoncreds-react-native` 0.3.4 - AnonCreds native module
- `@hyperledger/indy-vdr-react-native` 0.2.3 - Indy VDR native module
- `@openwallet-foundation/askar-react-native` 0.5.0-alpha - Askar secure storage
- `react-native-fingerprint-scanner` 6.0.0 - Biometric auth (patched)
- `react-native-keychain` 10.0.0 - Secure credential storage
- `react-native-passkey` 2.1.1 - WebAuthn passkey support
- `react-native-encrypted-storage` 4.0.2 - Encrypted local storage
- `react-native-user-identity` 1.5.2 - User identity (patched)
- `react-native-vision-camera` 4.7.3 - QR code scanning (patched)

**Infrastructure:**
- `axios` 1.13.6 - HTTP client for API calls
- `react-native-app-auth` 6.4.3 - OAuth 2.0 support
- `ethers` 6.16.0 - Ethereum/blockchain interaction
- `mobx` 6.12.3 - State management
- `tsyringe` 4.7.0 - Dependency injection container

**Storage & Async:**
- `@react-native-async-storage/async-storage` 2.2.0 - Local async storage
- `react-native-fs` 2.20.0 - File system access
- `react-native-zip-archive` 7.0.1 - Zip/unzip operations

**Utilities:**
- `lodash` 4.17.21 - Utility functions
- `moment` 2.29.4 - Date/time handling
- `i18next` 22.0.4 - Internationalization
- `react-i18next` 11.18.6 - React i18n integration
- `uuid` 9.0.1 - UUID generation
- `query-string` 7.0.1 - Query parameter parsing
- `react-hook-form` 7.43.1 - Form state management

**Crypto & Security:**
- `react-native-quick-crypto` 0.7.17 - Fast cryptographic operations
- `expo-crypto` 14.1.5 - Crypto utilities
- `react-native-argon2` 2.0.1 - Password hashing
- `react-native-scrypt` 1.2.1 - Key derivation (patched)
- `reflect-metadata` 0.1.13 - Decorator support

**UI Components:**
- `react-native-paper` 5.12.5 - Material Design components
- `react-native-vector-icons` 10.3.0 - Icon library
- `react-native-svg` 15.12.1 - SVG rendering
- `react-native-qrcode-svg` 6.2.0 - QR code generation
- `react-native-toast-message` 2.1.10 - Toast notifications
- `react-native-reanimated` 3.19.5 - Gesture/animation library
- `react-native-gesture-handler` 2.28.0 - Gesture support
- `react-native-gifted-chat` 2.4.1 - Chat UI component

**Polyfills:**
- `ethers` 6.16.0 - Blockchain utilities
- `stream-browserify`, `http-browserify`, `https-browserify` - Node.js module shims
- `buffer`, `process`, `path-browserify`, `url`, `querystring` - CommonJS polyfills

## Configuration

**Environment Variables:**
Environment configuration via `react-native-config`. All required env vars listed in `app/src/config.ts`:
- `MEDIATOR_URL` - DID Comm mediator endpoint
- `HEDERA_OPERATOR_ID` - Hedera testnet operator ID (default: 0.0.5065521)
- `HEDERA_OPERATOR_KEY` - Hedera operator key
- `ENABLE_KEPLR_INTEGRATION` - Enable Cosmos chain integration
- `ENABLE_EXTERNAL_AUTH` - Enable OAuth login
- `ENABLE_WALLET_BACKUP` - Enable wallet backup via passkeys
- `ENABLE_EXAMPLE_CREDENTIAL` - Enable test credential flow
- `ENABLE_PUBLIC_INVITATION` - Enable public invitation generation
- `WALLET_PROVIDER_URL` - Backup service endpoint (default: https://backup.ssi-agency.dsr-corporation.com/api/v1)
- `AGENCY_PROVIDER_URL` - Agency API endpoint (default: https://api.ssi-agency.dsr-corporation.com)
- `INDY_BESU_DID_REGISTRY_CONTRACT_ADDRESS` - Smart contract address
- `INDY_BESU_SCHEMA_REGISTRY_CONTRACT_ADDRESS` - Smart contract address
- `INDY_BESU_CRED_DEF_REGISTRY_CONTRACT_ADDRESS` - Smart contract address
- `INDY_BESU_RPC_URL` - Indy Besu RPC endpoint (default: http://192.168.1.145:8545/)
- `INDY_BESU_SIGNER_PRIVATE_KEY` - Private key for contract interactions
- `OAUTH_STORE_CONFIG` - OAuth configuration (JSON string)
- `CERTIFICATE_HASH` - Android app certificate hash for passkey requests
- `ENABLE_EXAMPLE_CREDENTIAL` - Enable demo credential
- `ENABLE_PUBLIC_INVITATION` - Enable public DID invitations

**Build Configuration:**
- `.prettierrc.js` - Code formatting (120 char width, no semicolons, single quotes)
- `.eslintrc.js` - Linting rules
- `tsconfig.json` - TypeScript compilation settings
- `babel.config.js` - Babel transpilation
- `metro.config.js` - React Native bundler config
- `jest.config.js` - Test runner configuration
- `android/gradle.properties` - Android build settings (Hermes enabled, x86/ARM architectures)
- `app/app.json` - Expo app metadata

## Platform Requirements

**Development:**
- Node.js 20.19.2 to <23.0.0
- Yarn 4.9.4
- TypeScript 5.9.2
- Android SDK (for Android builds) or Xcode (for iOS builds)
- Ruby (for iOS CocoaPods)

**Production:**
- **Android:** SDK 26+ (from `AndroidManifest.xml` and gradle settings)
- **iOS:** iOS 14+
- **Deployment:** EAS (Expo Application Services) or native builds

## Workspace Structure

Monorepo with Yarn workspaces:
- `app/` - Main Heka Wallet React Native app
- `packages/shared/` - Shared UI components and utilities (`@heka-wallet/shared`)
- `packages/keplr/` - Cosmos chain integration (`@heka-wallet/keplr`)

---

*Stack analysis: 2026-03-27*

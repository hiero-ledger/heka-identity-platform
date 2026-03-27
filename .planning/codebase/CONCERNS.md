# Concerns

## Active Migration (HIGH PRIORITY)

### Bifold Core Migration
- **From:** `@hyperledger/aries-bifold-core` → **To:** `@bifold/core`
- **Status:** In progress (documented in `heka-wallet/CLAUDE.md`)
- **Impact:** Many wallet source files need import updates
- **Risk:** Breaking changes between Bifold versions, API surface changes
- **Related:** OCA package also migrated (`@hyperledger/aries-oca` → `@bifold/oca`)

### Credo-TS API Changes
- **Context:** `@credo-ts/*@0.6.x` introduced breaking changes
- **Key change:** `ConnectionRecord` → `DidCommConnectionRecord`, `CredentialExchangeRecord` → `DidCommCredentialExchangeRecord`
- **Key change:** Agent API namespace shift: `agent.connections.*` → `agent.didcomm.connections.*`
- **Key change:** `BifoldAgent` → custom `HekaWalletAgent` type
- **Affected:** `credential-display.ts`, `credential.ts`, `presentation.ts`, all files using agent APIs
- **Risk:** Partially migrated — some files updated, others still using old APIs

## Tech Debt

### Type Safety Violations
- **29 occurrences** of `@ts-expect-error`, `@ts-ignore`, and `as any` across 15 wallet files
- **Hotspots:**
  - `credential-display.ts` (4 occurrences) — external type mismatches
  - `hooks/chat-messages.tsx` (4 occurrences)
  - `screens/Home.tsx` (3 occurrences)
  - `screens/Onboarding.tsx` (3 occurrences)
  - `components/cards/NotificationCard.tsx` (3 occurrences)
- **Root cause:** Bifold and Credo type definitions don't always match actual runtime behavior

### TODO/FIXME Items
- **40 occurrences** across 26 wallet source files
- **Notable:**
  - `useOpenIdHandlers.ts` (7 TODOs) — Multiple unfinished OpenID4VC flows
  - `credentials/mappers/mdoc.ts` (3 TODOs) — Incomplete mDL support
  - `screens/CredentialDetails.tsx` (2 TODOs)
  - `screens/OpenIdCredentialOffer.tsx` (2 TODOs)
  - `screens/Settings.tsx` (2 TODOs)
  - `stores/OAuthStore.ts` (3 TODOs)
  - `navigators/types.ts` (2 TODOs)

### MikroORM Version Split
- Identity service uses MikroORM **v5**, auth service uses **v6**
- Different API surfaces, migration patterns may diverge
- Risk of confusion when working across services

## Known Bugs / Fragile Areas

### Credential Display Mapper
- `credential-display.ts` has complex type juggling with `@ts-expect-error` for AnonCreds data integrity format
- `findDisplay()` function assumes English locale or no-locale fallback — may break for non-English users
- `flaggedAttributeNames` access via `(bundleOverlay as any).bundle.bundle.flaggedAttributes` is deeply nested unsafe access

### OpenID4VC Handlers
- `useOpenIdHandlers.ts` has 7 TODOs indicating incomplete error handling and edge case coverage
- OpenID4VC session management spans multiple modules with complex state

### iOS/Android Native Configuration
- iOS project recently migrated from Obj-C (`AppDelegate.m`) to Swift (`AppDelegate.swift`)
- Entitlements files renamed from `HieroWallet*` to `HekaWallet*`
- Bridging header changes may affect native module integration
- Multiple deleted iOS files (`HekaWallet.swift`, test files, `main.m`)

## Security Considerations

### Wallet Credential Storage
- Credentials stored via Aries Askar — industry standard but complex
- PIN and biometric auth flow through custom code (`PINCreate.tsx`, `PINEnter.tsx`, `UseBiometry.tsx`)
- Keychain utilities in `utils/keychain.ts` handle sensitive operations

### Authentication
- JWT tokens used for service authentication
- OAuth store has TODOs around token refresh and error handling
- Passkeys implementation relatively new (store exists but integration depth unclear)

### Tails File Handling
- Custom `TailsService` in wallet for AnonCreds revocation
- Downloads tails files from remote — potential MITM vector if not over HTTPS

## Performance Considerations

### Credential Mapping
- Multiple credential format mappers run synchronously
- OCA bundle resolution (`resolveOverlay`) makes HTTP call per credential
- No caching strategy visible for OCA bundles or credential displays

### React Native Bundle
- Large dependency tree (Credo, AnonCreds native bindings, Ethers, Expo modules)
- Metro bundler config customized for monorepo workspace resolution
- Multiple polyfills (`http-browserify`, `https-browserify`, `os-browserify`, `buffer`)

## Test Coverage Gaps

- **Wallet screens:** 26 screens, 0 component tests
- **Credential mappers:** Complex business logic with no direct unit tests
- **Auth service:** Minimal test coverage
- **Web UI:** Only 1 test file (`classNames.test.ts`)
- **Wallet navigation:** No integration tests for navigation flows
- **OpenID4VC flows:** Complex handler with only 1 test file

## Dependencies at Risk

### @bifold/core (Forked)
- Pulled from Git tag: `dsrcorporation/aries-mobile-agent-react-native#tag=1.0.0-alpha-heka.4`
- Fork-based dependency — upstream changes need manual sync
- Breaking if GitHub reference becomes unavailable

### @credo-ts/* Version Mismatch
- Wallet uses `@credo-ts/*@0.6.1`
- Identity service uses `@credo-ts/*@0.6.2`
- Minor version difference but could cause type mismatches in shared types

### Native Bindings
- `@hyperledger/anoncreds-react-native@0.3.4` — Native C library, platform-specific
- `@hyperledger/indy-vdr-react-native@0.2.3` — Has yarn patch applied
- `@openwallet-foundation/askar-react-native@0.5.0-alpha` — Alpha version in production
- `react-native-vision-camera@4.7.3` — Has yarn patch applied
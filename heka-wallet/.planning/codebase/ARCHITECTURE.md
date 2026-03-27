# Architecture

**Analysis Date:** 2026-03-27

## Pattern Overview

**Overall:** Layered React Native + Bifold Framework Architecture with Dependency Injection

**Key Characteristics:**
- Bifold-based wallet framework extended with custom Heka-specific screens and logic
- Multi-credential format support (W3C VC, SD-JWT, AnonCreds, mDoc)
- OpenID4VC and DIDComm protocol support for credential exchange
- Dependency injection via tsyringe for plugin architecture
- React Context + MobX for state management
- Stack-based navigation with deep-linking support

## Layers

**Presentation Layer (UI/Screens):**
- Purpose: React Native screens and components rendering user interface
- Location: `app/src/screens/`, `app/src/components/`, `app/src/navigators/`
- Contains: Screen components, UI components (cards, modals, inputs), navigation stacks
- Depends on: React Navigation, React Native Paper, shared theme, context hooks
- Used by: Navigation layer and app entry point

**Navigation Layer:**
- Purpose: Orchestrates screen transitions and stack management
- Location: `app/src/navigators/`
- Contains: Root, Auth, Bifold, Settings, OpenId, Backup stacks
- Depends on: React Navigation, Screens, RootStore context
- Used by: App entry point, inter-screen routing

**Business Logic Layer:**
- Purpose: Handles credentials, OpenID flows, wallet operations
- Location: `app/src/credentials/`, `app/src/utils/`, `app/src/hooks/`
- Contains: Credential mappers, OpenID handlers, agent utilities, contact/invitation handlers
- Depends on: Credo agent, Bifold core, Contexts
- Used by: Screens and components

**State Management Layer:**
- Purpose: Manages application state (OAuth, Passkeys, credentials)
- Location: `app/src/stores/`, `app/src/contexts/`
- Contains: RootStore (OAuth, Passkeys), Context providers (W3C, SD-JWT, Mdoc credentials)
- Depends on: MobX, React Context, configuration
- Used by: Screens, Navigators, hooks

**Agent/Protocol Layer:**
- Purpose: Integrates Credo agent for DIDComm, credential, and OpenID4VC operations
- Location: `app/src/utils/agent.ts`, `app/src/indy-besu/`
- Contains: Agent initialization, DID resolution, ledger configurations
- Depends on: @credo-ts/*, Hedera modules, Indy-Besu resolvers
- Used by: Business logic hooks and utilities

**Infrastructure Layer:**
- Purpose: Configuration, logging, crypto, keychain access
- Location: `app/src/config.ts`, `app/src/logger/`, `app/src/utils/keychain.ts`, `app/src/utils/crypto.ts`
- Contains: Environment config, logger implementation, secure storage
- Depends on: React Native Keychain, react-native-config, Crypto libraries
- Used by: All layers

**Shared/Cross-Platform Layer:**
- Purpose: Reusable components and utilities shared across workspaces
- Location: `packages/shared/`, `packages/keplr/`
- Contains: Theme, shared UI components, Keplr integration
- Depends on: React Native, React Navigation
- Used by: Main app and other packages

## Data Flow

**Credential Discovery & Display Flow:**

1. App initializes agent via `createAgent()` in `app/src/utils/agent.ts`
2. W3cCredentialRecordProvider, SdJwtVcRecordProvider, MdocRecordProvider start listening to agent updates
3. `useCredentials()` hook aggregates all credential formats via context hooks
4. Home screen and CredentialList display credentials via `useCredentials()` hook
5. Screens map records to UI via credential mappers (`app/src/credentials/mappers/`)

**OpenID4VC Credential Offer Flow:**

1. Deep link or QR scan triggers credential offer handling
2. `useOpenIdHandlers.resolveOpenId4VciOffer()` parses offer URI
3. Agent resolves authorization requirements
4. User accepts credential via modal (OpenIdCredentialOffer screen)
5. Agent executes token request and credential request with `openId4VcHolder` module
6. Credential stored in appropriate record type (W3C, SD-JWT, mDoc)

**Presentation Request Flow:**

1. Deep link or QR scan triggers presentation request handling
2. `useOpenIdHandlers.resolveOpenId4VciPresentationRequest()` validates request
3. App presents compatible credentials to user
4. User selects and confirms credentials
5. Agent creates presentation with `openId4VcHolder` or presentation exchange
6. Response submitted back to verifier

**Authentication Flow (External OAuth):**

1. If `EXTERNAL_AUTH_ENABLED` and user not logged in, show AuthStack
2. OAuth store manages login state
3. On successful login, RootStack transitions to main app
4. Passkeys store handles biometric authentication if enabled

**State Management Flow:**

1. RootStore created once at app initialization (App.tsx)
2. RootStoreProvider wraps entire app via Context
3. Screens access RootStore via `useRootStore()` hook
4. OAuthStore and PasskeysStore update independently
5. isLoading flag blocks rendering until keychain reset completes on iOS

**State Management Flow:**

1. RootStore created once at app initialization (App.tsx)
2. RootStoreProvider wraps entire app via Context
3. Screens access RootStore via `useRootStore()` hook
4. OAuthStore and PasskeysStore update independently
5. isLoading flag blocks rendering until keychain reset completes on iOS

## Key Abstractions

**Container (Dependency Injection):**
- Purpose: Manages component lifecycle and DI resolution
- Examples: `app/container-impl.tsx`, AppContainer class
- Pattern: Implements `Container` interface, registers screens/stacks via TOKENS from @bifold/core
- Entry point: Both Bifold MainContainer and HekaWallet AppContainer composed hierarchically

**Credential Record:**
- Purpose: Unified interface for different credential formats
- Examples: `W3cCredentialRecord`, `SdJwtVcRecord`, `MdocRecord` from @credo-ts/core
- Pattern: Agent stores records; contexts provide reactive updates; mappers convert to UI display types

**Store (State Management with MobX):**
- Purpose: Observable state containers for app state
- Examples: `OAuthStore` (login state), `PasskeysStore` (biometric keys)
- Pattern: Classes with @observable fields, @action methods, computed getters
- Usage: Screens subscribe via hooks or direct context access

**Mapper (Data Transformation):**
- Purpose: Transform internal records to UI-displayable credentials
- Examples: `app/src/credentials/mappers/credential.ts`, `mdoc.ts`, `sd-jwt.ts`
- Pattern: Functions that accept record types and return normalized Credential or CredentialDisplay
- Usage: `useCredentials()` applies mappers to unify different formats

**Navigator (Stack-based Navigation):**
- Purpose: Encapsulates navigation logic for screen groups
- Examples: AuthStack, HomeStack, CredentialStack, OpenIdStack
- Pattern: Stack navigators wrap screens and handle navigation params
- Composition: RootStack conditionally routes to AuthStack or BifoldStack based on auth state

## Entry Points

**App Entry (React Native):**
- Location: `app/index.js`
- Triggers: App launch via react-native metro bundler
- Responsibilities: Sets up global polyfills, registers app root component

**App Root Component:**
- Location: `app/App.tsx`
- Triggers: Rendered by AppRegistry in index.js
- Responsibilities:
  - Initializes Bifold and Heka containers via tsyringe
  - Creates provider hierarchy (theme, auth, network, credentials)
  - Manages keychain reset on iOS first launch
  - Renders RootStack navigator

**Root Navigation:**
- Location: `app/src/navigators/RootStack.tsx`
- Triggers: Mounted in App.tsx
- Responsibilities:
  - Routes to AuthStack if external auth enabled and not logged in
  - Routes to BifoldStack (main app) otherwise
  - Handles deeplinks via useDeeplinks() hook
  - Handles basic message invitations

**Bifold Stack (from @bifold/core):**
- Purpose: Core wallet navigation from Bifold framework
- Wraps: HomeStack, TabStack, Settings
- Customized via AppContainer token registration

**Home Stack:**
- Location: `app/src/navigators/HomeStack.tsx`
- Wraps home screen with notifications support

**Tab Stack:**
- Location: `app/src/navigators/TabStack.tsx`
- Purpose: Bottom tab navigation for main app sections
- Tabs: Home, Contacts, Settings, optional Keplr

## Error Handling

**Strategy:** Layered error handling with ErrorModal fallback

**Patterns:**
- Agent operations wrapped in try-catch with user-facing error messages
- ErrorModal component (`app/src/components/modals/ErrorModal.tsx`) captures uncaught errors from RootStore
- Toast notifications for user feedback (Toast.tsx integration)
- Logger (CredoLogger from @credo-ts/core) captures debug information
- Credential acceptance modals handle offer/request validation errors

## Cross-Cutting Concerns

**Logging:** CredoLogger instance (`app/src/logger/CredoLogger.ts`) configured at agent initialization, logs to console with context

**Validation:** Input validation in forms (PINCreate, PINEnter), credential acceptance modals validate offers before user confirmation

**Authentication:**
- Optional external OAuth (managed by OAuthStore)
- PIN-based wallet unlock (PINEnter screen)
- Biometric unlock (UseBiometry screen)
- Passkeys authentication (PasskeysStore)

**Localization:** i18next with multi-language support (en, fr, pt-BR); translations merged from @bifold/core + app-specific in `app/src/localization/`

**Theme Management:** HekaTheme + React Native Paper theme provider; custom theme in `packages/shared/src/theme.ts`

---

*Architecture analysis: 2026-03-27*

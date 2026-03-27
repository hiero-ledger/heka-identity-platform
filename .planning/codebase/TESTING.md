# Testing

## Framework

- **Jest** — Universal test runner across all projects
- **Version:** Jest 29.x
- **Config:** Per-project `jest.config.ts` files + shared base in `heka-wallet/jest-helpers/jest.config-base.js`

## Test Structure

### heka-identity-service
- **Location:** `test/` directory (top-level)
- **Type:** Primarily E2E tests
- **Unit tests:** `src/**/__tests__/` (sparse — `user.service.test.ts`, `auth.service.test.ts`)
- **Pattern:** `*.e2e.test.ts` for E2E, `*.test.ts` / `*.spec.ts` for unit
- **Runner:** `node --experimental-vm-modules` + `jest --runInBand --forceExit`

**E2E test files:**
- `dids.e2e.test.ts` — DID operations
- `schema.e2e.test.ts` — Schema management
- `schema-register.e2e.test.ts` — Schema registration
- `connection.e2e.test.ts` — DIDComm connections
- `credential-issuance-and-proof-presentation.e2e.test.ts` — Full flow
- `authorization.e2e.test.ts` — Auth guards
- `http-authentication.e2e.test.ts` — HTTP auth
- `ws-authentication.e2e.test.ts` — WebSocket auth
- `revocation.e2e.test.ts` — Credential revocation
- `user-profile.e2e.test.ts` — User management
- `wallet-scope.e2e.test.ts` — Multi-tenant wallet scope
- `issuance-template.e2e.test.ts` — Issuance templates
- `verification-template.e2e.test.ts` — Verification templates
- `openid4vc-issuer.test.ts` — OID4VCI issuer
- `openid4vc-verifier.test.ts` — OID4VP verifier
- `openid4vc-issuance-session.test.ts` — Issuance sessions
- `openid4vc-verification-session.test.ts` — Verification sessions
- `credential-v2.test.ts` — V2 credential operations

### heka-auth-service
- **Config:** Standard Jest setup
- **Tests:** Minimal (not many test files found)

### heka-wallet
- **Location:** `app/__tests__/` and `packages/*/` __tests__
- **Type:** Unit tests
- **Mocking:** Extensive mocks in `jest.setup.js` (React Native modules, async-storage, etc.)
- **Config:** `jest-helpers/jest.config-base.js` shared across workspace packages

**Wallet test files:**
- `app/__tests__/stores/OAuthStore.spec.ts`
- `app/__tests__/stores/PasskeysStore.spec.ts`
- `app/__tests__/utils/keychain.spec.ts`
- `app/__tests__/credentials/useOpenIdHandlers.spec.ts`
- `packages/shared/__tests__/utils/sort.spec.ts`
- `packages/shared/__tests__/utils/string.spec.ts`
- `packages/shared/__tests__/utils/number.spec.ts`
- `packages/shared/__tests__/utils/url.spec.ts`
- `packages/keplr/__tests__/utils/useZeroOrPositiveIntegerString.spec.ts`

### heka-identity-service-web-ui
- **Config:** `config/jest/jest.config.ts`
- **Tests:** Minimal (`shared/lib/classNames/classNames.test.ts`)
- **Storybook:** Component development via Storybook 8

## Testing Libraries

| Library | Used In | Purpose |
|---------|---------|---------|
| `jest` | All projects | Test runner |
| `@testing-library/react-native` | heka-wallet | Component testing |
| `@testing-library/jest-native` | heka-wallet | Native component matchers |
| `supertest` | heka-identity-service | HTTP E2E testing |
| `superwstest` | heka-identity-service | WebSocket E2E testing |
| `jest-when` | heka-identity-service | Conditional mock returns |
| `@golevelup/ts-jest` | heka-identity-service | NestJS test utilities |
| `@nestjs/testing` | heka-identity-service | NestJS test module builder |
| `@storybook/*` | web-ui | Visual component testing |

## Mocking Strategy

### Wallet (`jest.setup.js`)
Heavy mocking of React Native modules:
- `react-native-config` — Mock environment variables
- `@react-native-async-storage/async-storage` — In-memory mock
- `react-native-camera` — Stubbed
- `react-native-permissions` — Stubbed
- Navigation mocks for React Navigation
- Bifold core mocks

### Identity Service
- `jest-when` for conditional mock behavior
- `@golevelup/ts-jest` for NestJS provider mocking
- `@mikro-orm/sqlite` for in-memory database testing
- `@nestjs/testing.Test.createTestingModule()` for module setup

## Coverage

### Well-tested areas:
- Identity service E2E flows (18 test files covering major features)
- Shared utility functions (string, URL, number, sort)
- Wallet stores (OAuth, Passkeys)
- Keychain utilities

### Under-tested areas:
- Wallet screens and components (no component tests found)
- Wallet credential mappers (complex logic, no direct tests)
- Auth service (minimal tests)
- Web UI (only 1 test file)
- Wallet hooks (only `useOpenIdHandlers` has tests)

## Running Tests

```bash
# Identity service
cd heka-identity-service && yarn test

# Auth service
cd heka-auth-service && yarn test

# Wallet (all workspace packages)
cd heka-wallet && yarn test

# Web UI
cd heka-identity-service-web-ui && yarn test:unit

# Type checking (wallet)
cd heka-wallet && yarn typecheck
```
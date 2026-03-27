# Testing Patterns

**Analysis Date:** 2026-03-27

## Test Framework

**Runner:**
- Jest `^29.6.4`
- Configuration: `jest-helpers/jest.config-base.js` (base config), `jest.setup.js` (setup file)
- Babel transpilation: `babel-jest` `^29.7.0`
- Metro bundler: `metro-react-native-babel-preset` `^0.77.0`

**Assertion Library:**
- Jest's built-in matchers
- `@testing-library/jest-native` `^5.4.3` for React Native component testing
- `@testing-library/react-native` `^13.3.0` for rendering hooks and components

**Run Commands:**
```bash
yarn test                # Run all tests
yarn test --watch       # Watch mode
yarn test --coverage    # Generate coverage report
```

## Test File Organization

**Location:**
- Tests co-located with source code in `__tests__` directories at same level
- Path pattern: `app/__tests__/` for main app tests
- Workspace tests: `packages/keplr/__tests__/` for keplr package tests

**Naming:**
- Test files use `.spec.ts` extension (e.g., `keychain.spec.ts`, `OAuthStore.spec.ts`)
- Test names placed in directories matching their source structure (e.g., `__tests__/stores/OAuthStore.spec.ts` for `src/stores/OAuthStore.ts`)

**Structure:**
```
app/
├── src/
│   ├── stores/OAuthStore.ts
│   ├── utils/keychain.ts
│   └── credentials/useOpenIdHandlers.ts
└── __tests__/
    ├── stores/OAuthStore.spec.ts
    ├── utils/keychain.spec.ts
    └── credentials/useOpenIdHandlers.spec.ts
```

## Test Structure

**Suite Organization:**
```typescript
describe('OAuthStore', () => {
  beforeAll(() => {
    // One-time setup before all tests
    mockFunction(Keychain.getGenericPassword).mockResolvedValue({
      password: JSON.stringify(mockAuthState),
    } as UserCredentials)
  })

  describe('logIn method', () => {
    it('should log in and save auth state to Keychain', async () => {
      // Test body
    })
  })
})
```

**Patterns:**
- Nested `describe()` blocks for logical grouping (feature > method > scenario)
- `beforeAll()` for expensive one-time setup
- `beforeEach()` for test-specific mocks and state reset
- `afterEach()` not heavily used (Jest's `clearMocks: true` in config handles it)
- Async tests marked with `async` and use `await` with `waitFor()`

**Example Test Suite (from `app/__tests__/utils/keychain.spec.ts`):**
```typescript
describe('Keychain Utils', () => {
  describe('useiOSKeychainResetOnFirstLaunch', () => {
    beforeEach(() => {
      Platform.OS = 'ios'
    })

    it('should reset keychain and set flag in AsyncStorage', async () => {
      const { result } = renderHook(() => useIOSKeychainResetOnFirstLaunch())

      await waitFor(() => expect(result.current.inProgress).toBe(false))

      expect(AsyncStorage.getItem).toBeCalledTimes(1)
      expect(AsyncStorage.getItem).toBeCalledWith(APP_LAUNCHED_KEY)
      expect(Keychain.resetGenericPassword).toBeCalled()
    })
  })
})
```

## Mocking

**Framework:** Jest mocking system with `jest.mock()` and `jest.fn()`

**Global Mocks (in `jest.setup.js`):**
- `react-native/Libraries/Animated/NativeAnimatedHelper`
- `react-native/Libraries/EventEmitter/NativeEventEmitter`
- `react-native/Libraries/Linking/Linking`
- `axios` - mocked globally
- `@react-native-async-storage/async-storage` - async-storage mock
- `@react-native-community/netinfo` - netinfo mock
- `react-native-permissions` - permissions mock
- `react-native-keychain` - custom mock with `jest.requireActual()`
- `@bifold/core` and `@bifold/core/src/utils/crypto` - mocked as functions
- `@react-navigation/elements` - mocked as function
- Custom logger mock: `@heka-wallet/shared/src/logger/Logger.ts`

**Example Global Mock (jest.setup.js):**
```typescript
jest.mock('react-native-keychain', () => jest.requireActual('./jest-helpers/__mocks__/react-native-keychain').default)

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage)
```

**Test-Level Mocking Patterns:**

1. **Mock Function Casting** - Use helper for type-safe mock access:
```typescript
import { mockFunction } from '../../../jest-helpers/helpers'

mockFunction(Keychain.getGenericPassword).mockResolvedValue({
  password: JSON.stringify(mockAuthState),
} as UserCredentials)
```

2. **Resolved Values**:
```typescript
mockFunction(mockAgent.modules.openId4VcHolder.resolveCredentialOffer).mockResolvedValueOnce(
  fixture.resolvedCredentialOfferPreAuth
)
```

3. **Rejected Values**:
```typescript
mockFunction(Auth.revoke).mockRejectedValueOnce(new Error())
mockFunction(axios.get).mockRejectedValueOnce(new Error())
```

4. **Module-Level Mocks**:
```typescript
jest.mock('react-native-app-auth', () => ({
  authorize: jest.fn(() => Promise.resolve(mockAuthState)),
  refresh: jest.fn(() => Promise.resolve({ ...mockAuthState, accessToken: refreshedAuthToken })),
  revoke: jest.fn(() => Promise.resolve()),
}))
```

**What to Mock:**
- External APIs (network calls via axios)
- Native modules (Keychain, AsyncStorage, Platform)
- Async operations requiring specific return values
- Navigation and routing
- Third-party libraries that aren't needed for unit test

**What NOT to Mock:**
- Application logic (business functions should be tested)
- Utility functions from shared packages
- Type definitions
- Pure functions without side effects

## Fixtures and Factories

**Test Data:**
```typescript
const mockAuthState: AuthorizeResult = {
  authorizationCode: 'authorization-code',
  accessTokenExpirationDate: moment().add(1, 'day').toISOString(),
  refreshToken: 'refresh-token',
  scopes: [],
  accessToken: 'access-token',
  idToken: 'null',
  tokenAdditionalParameters: {},
  tokenType: 'bearer',
  authorizeAdditionalParameters: {},
}

const expiredAuthState: AuthorizeResult = {
  ...mockAuthState,
  accessTokenExpirationDate: moment().add(-1, 'hours').toISOString(),
}
```

**Location:**
- Mock data defined at top of test file near imports
- Fixtures organized in `fixtures.ts` files (e.g., `app/__tests__/credentials/fixtures.ts`)
- Factory functions used for creating test data with variations

**Example Factory Pattern (from `OAuthStore.spec.ts`):**
```typescript
// Helper function for store initialization with mocked state
async function createAndInitializeStore(): Promise<OAuthStore> {
  const oauthStore = new OAuthStore(mockConfig)
  await waitFor(() => expect(oauthStore.isLoading).toBe(false))
  return oauthStore
}
```

## Coverage

**Requirements:** No enforced coverage targets detected in configuration

**View Coverage:**
```bash
yarn test --coverage
```

Coverage reports generated in `.jest/cache` directory.

## Test Types

**Unit Tests:**
- Focus: Individual functions, utilities, hooks
- Example: `keychain.spec.ts` tests `getKeychainAccessOptions()`, `resetKeychainData()` functions
- Scope: Single module, all dependencies mocked
- Approach: Test inputs → outputs with various scenarios

**Integration Tests:**
- Focus: Store initialization, state transitions, side effects
- Example: `OAuthStore.spec.ts` tests full store lifecycle (init → login → token refresh → logout)
- Scope: Multiple interacting modules, some external dependencies mocked
- Approach: Test state changes across method calls

**E2E Tests:**
- Framework: Not detected in current test suite
- Implementation: Would use React Native testing tools for full app scenarios

## Common Patterns

**Async Testing:**
```typescript
it('should log in and save auth state to Keychain', async () => {
  mockFunction(Keychain.getGenericPassword).mockResolvedValueOnce(false)

  const oauthStore = await createAndInitializeStore()

  expect(oauthStore.isLoggedIn).toBe(false)

  await oauthStore.logIn()

  expect(oauthStore.isLoggedIn).toBe(true)
  expect(Auth.authorize).toBeCalledTimes(1)
})
```

**Hook Testing:**
```typescript
import { renderHook, waitFor } from '@testing-library/react-native'

it('should resolve credential offer', async () => {
  const { result } = renderHook(() => useOpenIdHandlers())

  // Trigger async operation
  const promise = result.current.resolveOpenId4VciOffer({ offer: { uri: 'test-uri' } })

  // Wait for completion
  await waitFor(() => {
    // Assertions after waitFor
  })
})
```

**Error Testing:**
```typescript
it('should throw error if not logged in', async () => {
  mockFunction(Keychain.getGenericPassword).mockResolvedValueOnce(false)

  const oauthStore = await createAndInitializeStore()

  await expect(oauthStore.logOut()).rejects.toThrow()
})

it('should throw if no authorization params', async () => {
  const { resolveOpenId4VciOffer } = renderOpenIdHandlersHookValue()
  await expect(
    resolveOpenId4VciOffer({ offer: { uri: 'test-uri' } })
  ).rejects.toThrow()
})
```

**Parametrized Tests:**
```typescript
it.each(['android', 'ios'] as const)('should return correct options for %s', (platform) => {
  Platform.OS = platform

  const options = getKeychainAccessOptions(testKeychainServiceName)

  expect(options.service).toBe(testKeychainServiceName)
  if (platform === 'android') {
    expect(options.securityLevel).toBe(Keychain.SECURITY_LEVEL.ANY)
  }
})
```

**Mock Verification:**
```typescript
expect(Keychain.setGenericPassword).toBeCalledTimes(1)
expect(Keychain.setGenericPassword).toBeCalledWith(
  OAUTH_TOKEN_KEY,
  JSON.stringify(mockAuthState),
  authKeychainOptions
)

expect(mockAgent.modules.openId4VcHolder.resolveIssuanceAuthorizationRequest).toHaveBeenCalledWith(
  resolvedCredentialOffer,
  expectedParams
)
```

## Key Testing Utilities

**Helper Function (`jest-helpers/helpers.ts`):**
```typescript
export function mockFunction<T extends (...args: any[]) => any>(fn: T): jest.MockedFunction<T> {
  return fn as jest.MockedFunction<T>
}
```

**Jest Configuration:**
```javascript
preset: '@testing-library/react-native',
testTimeout: 10000,
setupFiles: ['<rootDir>/jest.setup.js'],
setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
transform: {
  '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
},
transformIgnorePatterns: ['node_modules/(?!.*react-native|@bifold/core.*)'],
testRegex: '(/__tests__/.*(\\.|/)(test|spec))\\.[jt]sx?$',
clearMocks: true,
cacheDirectory: '.jest/cache',
```

---

*Testing analysis: 2026-03-27*

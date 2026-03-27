# Coding Conventions

**Analysis Date:** 2026-03-27

## Naming Patterns

**Files:**
- React component files: PascalCase with `.tsx` extension (e.g., `CredentialCard.tsx`, `OAuthStore.ts`)
- Utility and helper files: camelCase with `.ts` extension (e.g., `useOpenIdHandlers.ts`, `keychain.ts`)
- Type definition files: camelCase with `.ts` extension in `types/` directory (e.g., `keychain.ts`, `auth.ts`)
- Test files: `*.spec.ts` or `*.test.ts` suffix in `__tests__` directories (e.g., `keychain.spec.ts`, `OAuthStore.spec.ts`)
- Custom hooks: `use` prefix followed by camelCase (e.g., `useOpenIdHandlers`, `useCredentials`, `useRootStore`)

**Functions:**
- camelCase for all function declarations
- Getter methods use `get` prefix (e.g., `getAccessToken()`, `getKeychainAccessOptions()`)
- Private properties prefixed with underscore (e.g., `_authState`, `_isInitialized`, `_config`)
- Constants in UPPER_SNAKE_CASE (e.g., `OAUTH_TOKEN_KEY`, `PUBLIC_DID_KEY`, `PUBLIC_INVITATION_ID_KEY`)

**Variables:**
- camelCase for all variables and parameters
- Private fields in classes prefixed with underscore (e.g., `_authState`, `_userInfo`, `_isInitialized`)
- Underscore prefix in parameter destructuring to ignore unused variables (e.g., `walletName: _`)
- Boolean variables often prefixed with `is` or similar (e.g., `isLoading`, `isLoggedIn`, `inProgress`)

**Types:**
- PascalCase for all type/interface names (e.g., `AuthState`, `OAuthStoreConfig`, `UserInfo`)
- Type definitions organized in dedicated `types/` directories under their parent module
- Interface prefix for contracts: `interface NameOfInterface { ... }`
- Type suffix for unions: `type NameOfType = A | B`

## Code Style

**Formatting:**
- Prettier version `^3.4.2` configured with:
  - Print width: 120 characters
  - No semicolons
  - Single quotes
  - Trailing commas in ES5+ (objects, arrays, function parameters)

**Linting:**
- ESLint version `^8.57.1` with TypeScript support
- Configuration: `.eslintrc.js` at root
- Parser: `@typescript-eslint/parser` with TypeScript strict mode
- Extends: `plugin:@typescript-eslint/recommended`, `plugin:react/recommended`, `plugin:react-hooks/recommended`

**Key Linting Rules:**
- `no-console`: warns on console usage (errors in test files allowed)
- `@typescript-eslint/no-explicit-any`: warn only (not error due to early development)
- `@typescript-eslint/ban-ts-comment`: warn (future: move to error with proper refactoring)
- `@typescript-eslint/no-unused-vars`: error with `_` prefix ignored pattern for unused parameters
- `import/order`: enforced with groups [type, builtin/external, parent, sibling, index], alphabetized
- `import/no-cycle`: error (no circular imports allowed)
- `react-hooks/exhaustive-deps`: error (required dependencies in effect hooks)
- `react/prop-types`: off (TypeScript provides sufficient type validation)
- `react-native/no-raw-text`: warn (text must be wrapped in Text component)
- `@typescript-eslint/camelcase`: off (Aries protocols define attributes with snake_case)

**Test Files Override:**
- `no-console`: off in test files
- `import/no-extraneous-dependencies`: off in test files (allows testing libraries)

## Import Organization

**Order:**
1. Type imports (from `type` keyword)
2. Built-in and external imports (React, React Native, third-party libraries)
3. Parent directory imports (../)
4. Sibling and same-directory imports (./)
5. Index imports

**Example:**
```typescript
import type { PropsWithChildren } from 'react'

import { createContext, useContext } from 'react'

import { RootStore } from '../stores'

import { useRootStore } from './RootStore'
```

**Path Aliases:**
- No path aliases configured beyond standard Node resolution
- Relative imports preferred within same workspace
- Workspace package imports using `@heka-wallet/*` or `@bifold/*` prefixes for monorepo packages

## Error Handling

**Patterns:**
- Explicit `throw new Error(message)` for validation and runtime errors with descriptive messages
- MobX stores use `makeAutoObservable()` for reactive state management
- Async operations wrapped in try-catch blocks with logger calls
- Error logging uses `GlobalLogger` context (e.g., `logger.error('message:', error)`)
- Bifold provides `BifoldError` for framework-specific error handling
- Custom error boundaries for React components (using Bifold framework)

**Error Messages:**
- Descriptive messages indicating what went wrong and why (e.g., "Credo agent is not initialized")
- Context included when helpful (e.g., "Token refresh failed with error: {error}")
- Fallback patterns with recovery attempts (e.g., auto-refresh attempts before login fallback)

**Example Pattern:**
```typescript
try {
  const state = await authorize(this._config.oauthConfig)
  logger.debug('Logged in with auth state:', state)
  await this.saveAuthState(state)
} catch (error) {
  logger.error('Logging in failed with error:', error)
  throw error
}
```

## Logging

**Framework:** Custom logger using `GlobalLogger` from `@heka-wallet/shared`

**Patterns:**
- Context loggers created with `GlobalLogger.createContextLogger('ModuleName')`
- Severity levels: `debug`, `info`, `warn`, `error`
- Used in async operations for debugging and error tracking
- Credo framework uses dedicated `CredoLogger` class for agent logging
- Logger calls include context (e.g., `logger.debug('Resolved credential offer:', offer)`)

**Example:**
```typescript
const logger = GlobalLogger.createContextLogger('OAuth')

logger.warn('Token refresh failed, falling back to login...')
logger.error('Token refresh failed with error:', error)
```

## Comments

**When to Comment:**
- TODOs for known issues or future improvements (e.g., `// TODO: Find a proper way to...`)
- Complex logic requiring explanation
- Workarounds documented with reasoning (e.g., `// Workaround for imports related issue`)
- Non-obvious design decisions explained

**JSDoc/TSDoc:**
- Not extensively used; TypeScript types provide most documentation
- Interface and type definitions are self-documenting
- Complex utility functions may have brief descriptions

**Example:**
```typescript
// Just in case - we want to update mocks before init that will be called in constructor
// OAuthStore is a MobX store with async initialization
async function createAndInitializeStore(): Promise<OAuthStore> {
  const oauthStore = new OAuthStore(mockConfig)
  await waitFor(() => expect(oauthStore.isLoading).toBe(false))
  return oauthStore
}
```

## Function Design

**Size:** Functions kept concise with single responsibility
- Smaller functions preferred for testability
- Async functions use try-catch for error handling
- Return early pattern used to reduce nesting

**Parameters:**
- Destructuring used in function signatures for object parameters
- Parameters ordered: required before optional
- Interfaces defined for complex parameter objects
- Underscore prefix for unused parameters (e.g., `walletName: _`)

**Return Values:**
- Explicit return types in most cases (TypeScript strict mode)
- Promises returned for async operations
- Getters for computed properties (prefixed with `get`)
- Observable state returned from MobX stores

**Example:**
```typescript
async getAccessToken(): Promise<string> {
  if (!this._authState) {
    await this.logIn()
  } else if (this.isTokenExpired) {
    await this.refreshToken().catch(async () => {
      logger.warn('Token refresh failed, falling back to login...')
      await this.logIn()
    })
  }

  return this._authState!.accessToken
}
```

## Module Design

**Exports:**
- Named exports preferred for better tree-shaking and clarity
- Default exports used for components in some cases
- Barrel files (index.ts) used to re-export from subdirectories (e.g., `contexts/index.ts`)

**Example Barrel File:**
```typescript
export { RootStoreProvider } from './contexts'
export const localization = merge({}, translationResources, {
  en: { translation: en },
  fr: { translation: fr },
  'pt-BR': { translation: ptBr },
})
```

**Stores & State Management:**
- MobX used for reactive state in application stores (e.g., `OAuthStore`, `PasskeysStore`)
- Context API combined with MobX for providing stores to components
- Async initialization pattern: store constructor triggers async initialization, `isLoading` property tracks state
- `makeAutoObservable()` automatically wraps methods and marks state observable

**Provider Pattern:**
```typescript
export const RootStoreContext = createContext<RootStore | null>(null)

export const RootStoreProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const [state] = useState<RootStore>(() => new RootStore())
  return <RootStoreContext.Provider value={state}>{children}</RootStoreContext.Provider>
}

export function useRootStore(): RootStore {
  const context = useContext(RootStoreContext)
  if (!context) {
    throw new Error('useRootStore must be used within a RootStoreProvider')
  }
  return context
}
```

---

*Convention analysis: 2026-03-27*

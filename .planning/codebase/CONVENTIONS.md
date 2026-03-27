# Code Conventions

## Code Style

- **Formatter:** Prettier (configured across all projects)
- **Linter:** ESLint with TypeScript plugin
- **Import ordering:** `eslint-plugin-simple-import-sort` (wallet), manual grouping (services)
- **Quotes:** Single quotes
- **Semicolons:** No explicit config — follows Prettier defaults
- **Trailing commas:** ES5 style

## Naming Conventions

### Files
- **Components:** PascalCase (e.g., `CredentialCard.tsx`, `AlertModal.tsx`)
- **Hooks:** camelCase with `use` prefix (e.g., `useCredentials.ts`, `useOpenIdHandlers.ts`)
- **Utilities:** camelCase (e.g., `agent.ts`, `crypto.ts`, `keychain.ts`)
- **Stores:** PascalCase with `Store` suffix (e.g., `OAuthStore.ts`, `KeplrStore.ts`)
- **Services (NestJS):** kebab-case with `.service.ts` suffix
- **Controllers (NestJS):** kebab-case with `.controller.ts` suffix
- **Modules (NestJS):** kebab-case with `.module.ts` suffix
- **DTOs:** kebab-case in `dto/` directories
- **Tests:** Same name + `.spec.ts` or `.test.ts` suffix

### Variables & Functions
- **Functions/methods:** camelCase
- **Components:** PascalCase
- **Constants:** UPPER_SNAKE_CASE for string keys, camelCase for objects
- **Types/Interfaces:** PascalCase (e.g., `CredentialDisplay`, `PresentationFields`)
- **Enums:** PascalCase

### Directories
- **kebab-case** for NestJS modules (e.g., `credential-v2/`, `openid4vc/`)
- **PascalCase** for React component directories when grouped by type
- **camelCase** for utility directories

## Patterns

### React Native (Wallet)
- **Functional components** with hooks (no class components)
- **Custom hooks** for business logic extraction (`useCredentials`, `useOpenIdHandlers`, `useContacts`)
- **React Context** for credential state (separate contexts for MDoc, SD-JWT, W3C)
- **Navigation:** React Navigation with typed route params (`navigators/types.ts`)
- **DI Container:** Bifold container pattern for dependency injection (`container-impl.tsx`)
- **Mapper pattern:** Credential format → unified display type (`credentials/mappers/`)

### NestJS (Backend Services)
- **Module-per-feature:** Each domain concept has its own NestJS module
- **Controller → Service → Repository:** Standard NestJS layering
- **DTOs with validation:** `class-validator` decorators for request validation
- **Guards:** JWT auth guards on protected endpoints
- **Event-driven:** `@nestjs/event-emitter` for cross-module communication
- **Swagger:** Auto-generated API docs via `@nestjs/swagger` decorators

### State Management
- **Wallet:** MobX for Keplr store, React Context for credentials, Bifold store for core wallet state
- **Web UI:** Redux Toolkit with slices pattern

### Error Handling
- **Backend:** NestJS exception filters, HTTP exceptions
- **Wallet:** Try-catch with Toast notifications, error modals (`ErrorModal.tsx`, `AlertModal.tsx`)
- **Type safety escapes:** `@ts-expect-error` and `as any` used in ~15 files (29 occurrences) — mostly in credential mappers and UI components dealing with external types

## Import Organization

### Wallet (enforced by eslint-plugin-simple-import-sort)
1. External packages (`@bifold/*`, `@credo-ts/*`, `react-native`, etc.)
2. Internal absolute imports
3. Relative imports (`../`, `./`)

### Backend (manual grouping)
1. Node.js built-ins
2. NestJS framework imports
3. External package imports
4. Internal module imports (using path aliases like `'credential-v2'`)
5. Relative imports

## Configuration Patterns

- **Environment variables:** `.env` files loaded by NestJS ConfigModule (backend) or `react-native-config` (mobile)
- **TypeScript path mapping:** `tsconfig.json` paths for module resolution (identity service uses path aliases)
- **Patch-package:** Both identity service and wallet use `patch-package` for post-install dependency patching
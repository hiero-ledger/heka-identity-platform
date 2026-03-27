# Directory Structure

## Top Level

```
heka-identity-platform/
├── heka-identity-service/     # Backend NestJS identity service
├── heka-auth-service/         # Backend NestJS auth service
├── heka-identity-service-web-ui/  # React web dashboard
├── heka-wallet/               # React Native mobile wallet (Yarn workspaces)
├── demo/                      # Demo applications
│   └── a2a-oid4vp/           # Agent-to-Agent OID4VP demo
├── node_modules/              # Root node_modules
├── CODE_OF_CONDUCT.md
├── LICENSE
├── MAINTAINERS.md
└── README.md
```

## heka-identity-service/

```
src/
├── main.ts                    # NestJS bootstrap
├── app.module.ts              # Root module (imports all feature modules)
├── app.starter.ts             # Agent initialization
├── common/                    # Shared modules
│   ├── auth/                  # JWT auth guards and strategies
│   ├── logger/                # Pino logger setup
│   └── oca/                   # OCA bundle resolver
├── config/                    # Configuration (file-storage, etc.)
├── core/                      # Core module (Credo agent setup)
├── connection/                # DIDComm connection management
├── credential/                # AnonCreds credential issuance
├── credential-v2/             # V2 credential issuance (OpenID4VC)
│   ├── issuer/
│   ├── issuance-sessions/
│   ├── verifier/
│   └── verification-sessions/
├── credential-definition/     # AnonCreds credential definitions
├── did/                       # DID management
├── health/                    # Health check endpoint
├── issuance-template/         # Credential issuance templates
├── openid4vc/                 # OpenID4VC modules
│   ├── issuer/
│   ├── issuance-sessions/
│   ├── starter/
│   ├── verifier/
│   └── verification-sessions/
├── prepare-wallet/            # Agent wallet initialization
├── proof/                     # Proof request/presentation
├── revocation/                # Credential revocation
├── schema/                    # AnonCreds schema management
├── schema-v2/                 # V2 schema management
├── user/                      # User management
├── utils/                     # Shared utilities
└── verification-template/     # Proof verification templates
test/                          # E2E tests
indy-besu-vdr-pkg/            # Local Indy-Besu VDR native package
```

## heka-auth-service/

```
src/
├── main.ts                    # NestJS bootstrap
├── main.module.ts             # Root module
├── common/                    # Shared utilities
├── core/                      # Core module (DB, config)
├── health/                    # Health check
├── oauth/                     # OAuth functionality
└── user/                      # User CRUD + auth
```

## heka-identity-service-web-ui/

```
src/
├── index.tsx                  # App entry point
├── app/                       # App shell, providers, routing
├── pages/                     # Route-level page components
├── entities/                  # Domain models (Credential, Connection, etc.)
│   └── Credential/
│       └── model/services/    # API service layer
├── components/                # Shared UI components
├── shared/                    # Utilities, API clients, types
│   └── lib/
├── const/                     # Constants
└── translations/              # i18n translation files
config/
├── jest/                      # Jest configuration
└── storybook/                 # Storybook configuration
```

## heka-wallet/

```
heka-wallet/                   # Yarn 4 workspace root
├── package.json               # Workspace root config
├── tsconfig.json              # Shared TypeScript config
├── jest.setup.js              # Jest global setup
├── jest-helpers/              # Shared jest config
├── CLAUDE.md                  # AI assistant guidelines
├── app/                       # Main wallet application
│   ├── App.tsx                # React Native entry
│   ├── package.json           # App dependencies (@credo-ts/*, @bifold/*)
│   ├── container-impl.tsx     # Bifold DI container configuration
│   ├── metro.config.js        # Metro bundler config
│   ├── src/
│   │   ├── index.ts           # App initialization
│   │   ├── config.ts          # App configuration
│   │   ├── screens/           # 26 screen components
│   │   ├── components/        # UI components (cards, chat, misc, modals, views)
│   │   ├── credentials/       # Credential handling layer
│   │   │   ├── mappers/       # Format-specific display mappers
│   │   │   ├── types/         # Credential/presentation types
│   │   │   ├── metadata.ts    # OpenID4VC credential metadata
│   │   │   ├── useCredentials.ts
│   │   │   ├── useCredentialRecordHelpers.ts
│   │   │   └── useOpenIdHandlers.ts
│   │   ├── contexts/          # React contexts (MdocCredentials, SdJwtCredentials, W3cCredentials)
│   │   ├── hooks/             # Custom hooks (chat-messages)
│   │   ├── navigators/        # React Navigation stacks
│   │   ├── stores/            # MobX stores (OAuth, Passkeys)
│   │   ├── utils/             # Agent setup, crypto, keychain, helpers
│   │   ├── indy-besu/         # Indy-Besu DID/AnonCreds integration
│   │   ├── localization/      # i18n
│   │   ├── assets/            # SVG assets
│   │   └── types/             # TypeScript declarations
│   ├── ios/                   # iOS native project
│   ├── android/               # Android native project
│   └── __tests__/             # Unit tests
├── packages/
│   ├── keplr/                 # Cosmos/Keplr wallet integration
│   │   ├── src/
│   │   │   ├── KeplrStore.ts  # MobX store for cosmos accounts
│   │   │   ├── screens/       # Cosmos wallet screens
│   │   │   ├── components/    # Cosmos-specific UI
│   │   │   ├── navigators/    # Keplr navigation stacks
│   │   │   └── stores/        # KeyChain store
│   │   └── __tests__/
│   └── shared/                # Shared utilities package
│       ├── src/
│       │   ├── components/    # Shared UI (buttons, inputs, icons, modals)
│       │   ├── theme.ts       # Shared theme definition
│       │   ├── utils/         # String, URL, number, sort utilities
│       │   └── logger/        # Shared logger
│       └── __tests__/
```

## Key File Locations

| Purpose | Path |
|---------|------|
| Wallet agent setup | `heka-wallet/app/src/utils/agent.ts` |
| DI container | `heka-wallet/app/container-impl.tsx` |
| Credential display mapping | `heka-wallet/app/src/credentials/mappers/credential-display.ts` |
| OpenID handler hooks | `heka-wallet/app/src/credentials/useOpenIdHandlers.ts` |
| Identity service root module | `heka-identity-service/src/app.module.ts` |
| Credo agent core setup | `heka-identity-service/src/core/` |
| OpenID4VC issuer | `heka-identity-service/src/openid4vc/issuer/` |
| Auth service entry | `heka-auth-service/src/main.ts` |
| Web UI entry | `heka-identity-service-web-ui/src/index.tsx` |
# Architecture

## System Overview

Heka Identity Platform is a multi-service SSI (Self-Sovereign Identity) platform consisting of:

1. **heka-identity-service** — Backend NestJS service for credential issuance, verification, DID management, and OpenID4VC flows
2. **heka-auth-service** — Separate NestJS authentication/user management service
3. **heka-identity-service-web-ui** — React web dashboard for managing credentials and verifications
4. **heka-wallet** — React Native mobile wallet for holding and presenting credentials
5. **demo/** — Example applications (A2A OpenID4VP)

## Architecture Pattern

### Backend: Modular Monolith (NestJS)
Both backend services follow NestJS modular architecture:
- Each domain concept is a NestJS Module (DID, Schema, Credential, Proof, OpenID4VC, etc.)
- Modules contain Controller → Service → Repository layers
- Cross-cutting concerns (auth, logging, OCA) are shared modules
- Event-driven communication via `@nestjs/event-emitter`

### Mobile: Component-Based with DI Container
The wallet uses Aries Bifold's dependency injection container:
- Custom screens and components are registered via `container-impl.tsx`
- Bifold provides base screens; Heka overrides/extends them
- Navigation follows React Navigation stack pattern
- Credential handling abstracted through mapper layer

### Web UI: Feature-Sliced Design (FSD-like)
- `entities/` — Domain models (Credential, Connection, etc.)
- `pages/` — Route-level components
- `components/` — Shared UI components
- `shared/` — Utilities, API clients, types
- Redux Toolkit for global state

## Data Flow

### Credential Issuance (DIDComm)
```
Web UI → Identity Service API → Credo Agent → DIDComm → Wallet Agent → Store in Askar
```

### Credential Issuance (OpenID4VC)
```
Web UI → Identity Service API → OID4VCI Offer URL → Wallet scans QR → OID4VCI Protocol → Store credential
```

### Proof Presentation (DIDComm)
```
Identity Service → Proof Request → DIDComm → Wallet → User approves → Proof sent back → Verified
```

### Proof Presentation (OpenID4VP)
```
Identity Service → OID4VP Request → Wallet scans → User selects credentials → Presentation sent → Verified
```

### Authentication
```
Mobile App → OAuth/Passkeys → Auth Service → JWT Token → Used for Identity Service API calls
```

## Key Abstractions

### Credo Agent (`@credo-ts/*`)
Central abstraction for all SSI operations. Both the identity service and wallet instantiate Credo agents with different module configurations:

- **Server agent** (`heka-identity-service/src/core/`): Configured with Node.js dependencies, PostgreSQL wallet, multiple DID methods
- **Mobile agent** (`heka-wallet/app/src/utils/agent.ts`): Configured with React Native dependencies, Askar mobile wallet, mediation support

Agent type: `HekaWalletAgent` (wallet), standard `Agent` (service)

### Credential Mappers (`heka-wallet/app/src/credentials/mappers/`)
Transform raw credential formats into unified `CredentialDisplay` type:
- `credential-display.ts` — AnonCreds, W3C, SD-JWT, mDL display mapping
- `credential.ts` — Record-to-display conversion
- `presentation.ts` — Proof presentation mapping
- `sd-jwt.ts` — SD-JWT specific parsing
- `mdoc.ts` — mDL/mDOC specific parsing

### OCA Overlays
Credential branding resolution via Overlay Capture Architecture:
- Service exposes OCA bundles at `/oca` endpoint
- Wallet resolves overlays for credential display (colors, logos, labels)

### Container DI (`heka-wallet/app/container-impl.tsx`)
Bifold dependency injection for customizing wallet behavior:
- Override default screens, resolvers, and utilities
- Register custom credential handlers
- Configure navigation and theming

## Entry Points

| Service | Entry | Port(s) |
|---------|-------|---------|
| heka-identity-service | `src/main.ts` | 3000 (HTTP), 3001 (Agent HTTP), 3002 (Agent WS), 3003 |
| heka-auth-service | `src/main.ts` | Configured via env |
| heka-identity-service-web-ui | `src/index.tsx` | 8000 (dev) |
| heka-wallet | `app/App.tsx` → `app/src/index.ts` | N/A (mobile) |

## Cross-Cutting Concerns

### Logging
- Backend: Pino via `nestjs-pino` (structured JSON logs)
- Wallet: Custom `CredoLogger` wrapping console

### Error Handling
- Backend: NestJS exception filters, class-validator for DTO validation
- Wallet: Error boundaries, Toast notifications

### Security
- JWT-based API authentication
- Aries Askar for cryptographic key management
- PIN/biometric auth for wallet access
- Secure storage via `expo-secure-store`
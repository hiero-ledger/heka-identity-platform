# Credo-TS in Browser Extension Spike: Evaluation & Results

## Objective
Evaluate whether `@credo-ts/core` (with OID4VCI holder support) can be embedded directly within the Heka Chrome Extension (Manifest V3) as a client-side wallet agent.

## Background
Mentor Alexander requested re-evaluating whether Credo could be run inside the extension instead of building custom SD-JWT VC parsing and storage routines.

## Technical Findings

### 1. Manifest V3 Service Worker Runtime Limitations
- Manifest V3 extensions execute background tasks within ephemeral **Service Workers**, rather than persistent background pages.
- Service Workers terminate after ~30 seconds of inactivity, terminating any long-lived Credo agent sessions, ongoing DIDComm connections, or event listeners.

### 2. Native Dependencies and Askar Wallet Backend
- Credo-TS depends on Askar (`@openwallet-foundation/askar-nodejs` or `@openwallet-foundation/askar-shared`) for secure credential and key storage.
- Askar's native Node.js bindings cannot run in a browser extension context.
- While `@openwallet-foundation/askar-react-native` exists for mobile, no production-ready browser WebAssembly package of Askar was compatible with Chrome MV3's strict Content Security Policy (`script-src 'self'`; dynamic code compilation and `wasm-eval` restrictions).

### 3. Package Footprint and Polyfills
- Bundling `@credo-ts/core`, `@credo-ts/openid4vc`, Node crypto polyfills, and buffer modules exceeded Chrome Web Store extension bundle practical limits (~15+ MB uncompressed bundle).
- Transpilation with Vite/Rollup required heavy shimming of Node.js built-ins (`crypto`, `stream`, `events`, `buffer`, `net`), leading to fragile builds and runtime initialization failures in service workers.

## Decision

| Approach | Feasibility | Decision |
|---|---|---|
| **Direct Credo-TS in Extension MV3** | ❌ Blocked | Rejected due to Askar native/WASM constraints and MV3 service worker lifecycle |
| **Lightweight Prototype Extension** | ✅ Operational | **Adopted for Week 7**: Native web-crypto + `chrome.storage.local` + `postMessage` bridge |
| **Dedicated External Wallet (Mobile/Desktop)** | ✅ Production path | Recommended production target: Bifold / Credo-TS React Native mobile wallet via OID4VCI |

## Prototype Notice & Security Disclaimer
The current Chrome Extension wallet is an **educational and testing prototype**:
- Credential offers (`openid-credential-offer://`) are accepted via a content-script bridge (`heka-bridge.js`).
- Credentials are stored in `chrome.storage.local`.
- Holder binding in the issued SD-JWT VC uses `walletId` as a demo approximation. Full holder binding with proof-of-possession (KB-JWT) requires hardware-backed device keys (WebAuthn / Passkeys).

# Heka Web Wallet Chrome Extension

Browser extension prototype for holding and managing Hiero ecosystem Verifiable Credentials (SD-JWT VC).

## Features
- **OID4VCI Credential Offer Receiver**: Receives `openid-credential-offer://` URIs from the Heka Identity Platform via content script bridge.
- **SD-JWT VC Support**: Visualizes issued GitHub Contributor Credentials with selective disclosure tags.
- **Local Vault**: Stores credentials safely in `chrome.storage.local`.

## Architecture Note: Credo-TS Evaluation
A technical spike was conducted to evaluate embedding Credo-TS directly within the extension's Manifest V3 service worker. Due to Askar native/WASM restrictions in browser extension runtimes, a lightweight prototype was implemented instead. See [Credo Spike Evaluation](docs/credo-spike-result.md) for full details.

> **Security Notice**: This extension is a development prototype for demonstrating end-to-end credential issuance and selective disclosure. Production holder binding requires hardware-backed device keys (WebAuthn/Passkeys).

## Development
```bash
npm install
npm run build
```
Load the `dist/` directory into Chrome via `chrome://extensions` (Developer Mode > Load Unpacked).

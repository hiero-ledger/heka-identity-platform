# Heka Web Wallet Chrome Extension

Chrome extension that holds a GithubContributorCredential. Credo 0.7.0 runs in the `wallet.html` extension page. The popup and the service worker stay free of Credo and read a credential summary from `chrome.storage.local`.

## What it does

- Receives an `openid-credential-offer://` URI on the wallet page through the Credo OID4VCI holder.
- Stores the SD-JWT in IndexedDB and publishes a summary for the popup and the toolbar badge.
- Presents a credential with OID4VP only when the request uses DCQL.
- Creates holder keys with WebCrypto. The private key is non-extractable and cannot be imported.

Holder keys are not hardware-backed. A key attestation, when an issuer requires one, is not available in this wallet.

The measured bundle sizes and initialization times are in [docs/credo-spike-result.md](docs/credo-spike-result.md).

## Development

```bash
yarn install
yarn test
yarn build
```

Load `dist/` in Chrome at `chrome://extensions` with Developer Mode, then Load unpacked. Credential offers open `wallet.html`. The popup only shows the summary and sends the offer to that page.

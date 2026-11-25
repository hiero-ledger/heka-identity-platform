# Heka Web Wallet

A browser extension (Chrome, Manifest V3) that receives, stores and presents verifiable credentials (SD-JWT VC) over OpenID4VC. Credo 0.7.4, the version the platform's services use, runs in the `wallet.html` extension page. The popup and the service worker stay free of Credo and read a credential summary from `chrome.storage.local`.

## What it does

- Receives an OID4VCI offer on `wallet.html` only after the holder accepts it. The content script runs only on the sites the holder connected, and forwards a well-shaped offer and its expiry. The wallet resolves the issuer and credential type, and the holder enters the transaction code shown in Heka before the offer is redeemed. An expired pending offer is removed and explained. A presentation request stays stored until it is submitted or declined.
- Stores the SD-JWT in IndexedDB, with the issuer's display metadata (name, logo, colours), and publishes a summary for the popup and the toolbar badge.
- Presents a credential with OID4VP only when the request uses DCQL. A response the verifier asks to encrypt (`direct_post.jwt`, Credo's default) is encrypted with ECDH-ES, using a second, in-memory key backend for the single-use key (see the doc below).
- Creates holder keys with WebCrypto. The private key is non-extractable and cannot be imported. The credential is bound to the key as a JWK, or as a `did:jwk` / `did:key` when the issuer accepts only DIDs.

Holder keys are not hardware-backed. A key attestation, when an issuer requires one, is not available in this wallet.

Docs:

- [docs/permissions-and-consent.md](docs/permissions-and-consent.md): connected sites, host access per origin, what consent shows, the type-metadata policy, and the two builds;
- [docs/bridge-protocol.md](docs/bridge-protocol.md): the messages between a web page and the wallet;
- [docs/credo-in-the-browser.md](docs/credo-in-the-browser.md): how Credo runs in the extension page (storage, key management, the build workarounds);
- [docs/wallet-lifecycle.md](docs/wallet-lifecycle.md): where the data lives and how to recover it.

## Development

```bash
corepack enable     # Yarn 4, from packageManager in package.json
yarn install
yarn test
yarn build
```

| Command | Build |
|---|---|
| `yarn build` | Production, then the build checks (`yarn check:dist`, below). No host access at install, no content script until a site is connected, `http://` issuers and verifiers refused, no source maps |
| `yarn build:dev` | Development: localhost and `127.0.0.1` allowed at install, the bridge already on the web UI's dev server (`http://localhost:8000`, `http://127.0.0.1:8000`), `http://` issuers and verifiers accepted (such as a local identity service), source maps |
| `yarn dev` | The development build, rebuilt on every change |

Load `dist/` in Chrome at `chrome://extensions` with Developer Mode, then Load unpacked. Chrome does not support `protocol_handlers`, so an `openid-credential-offer:` link does not open this extension.

To use the wallet from a web page, such as the Heka web UI, open the page, then the wallet's popup, and press **Connect this site**. Chrome asks for access to that site; the page then sends offers and presentation requests to the content script. The service worker stores each one and opens `wallet.html`, or hands it to the wallet window that is already open, so one Credo agent serves consecutive requests. A newer offer or presentation request replaces the one under review. The wallet asks for access to each issuer or verifier origin from the Review, Accept or Present click that needs it. To import an offer that did not come from a page, paste the URI on the popup Receive tab. That opens the same approval screen. The popup itself does not run Credo.

## Checks

From this directory, after `yarn install`:

```bash
yarn lint
yarn type-check
yarn test
yarn build
```

`.github/workflows/heka-web-wallet-verify.yml` runs the same in CI. `yarn build` ends with `yarn check:dist`, which fails when:

- a content script is not a classic script (`check:content-scripts`): Chrome would not run it;
- a workaround in `vite.config.ts` no longer applies (`check:workarounds`), typically after a Credo upgrade;
- the bundle contains `new Function` or `eval(` (`check:csp`), which Manifest V3 blocks;
- the manifest grants host access at install, allows other optional host access than `https://*/*`, `http://localhost/*` and `http://127.0.0.1/*`, declares a content script, or keeps a permission the bundle does not use (`check:manifest`).

After `yarn build:dev`, the first three checks also pass; `check:manifest` fails by design.

[e2e/](e2e/README.md) drives the extension in Chrome for Testing: the bridge, the wallet window, a credential receive and a DCQL presentation, on its own page or through the Heka web UI and a running identity service. It is not part of CI.

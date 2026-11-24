# Heka Web Wallet

A browser extension (Chrome, Manifest V3) that receives, stores and presents verifiable credentials (SD-JWT VC) over OpenID4VC. Credo 0.7.4, the version the platform's services use, runs in the `wallet.html` extension page. The popup and the service worker stay free of Credo and read a credential summary from `chrome.storage.local`.

## What it does

- Receives an OID4VCI offer on `wallet.html` only after the holder accepts it. The content script runs on `http://localhost:8000`, `http://127.0.0.1:8000`, and `https://heka.hiero.org`. It forwards a well-shaped offer and its expiry. The wallet resolves the issuer and credential type, and the holder enters the transaction code shown in Heka before the offer is redeemed. An expired pending offer is removed and explained. A presentation request stays stored until it is submitted or declined.
- Stores the SD-JWT in IndexedDB, with the issuer's display metadata (name, logo, colours), and publishes a summary for the popup and the toolbar badge.
- Presents a credential with OID4VP only when the request uses DCQL. A response the verifier asks to encrypt (`direct_post.jwt`, Credo's default) is encrypted with ECDH-ES, using a second, in-memory key backend for the single-use key (see the doc below).
- Creates holder keys with WebCrypto. The private key is non-extractable and cannot be imported. The credential is bound to the key as a JWK, or as a `did:jwk` / `did:key` when the issuer accepts only DIDs.

Holder keys are not hardware-backed. A key attestation, when an issuer requires one, is not available in this wallet.

How Credo runs in the extension page (storage, key management, the build workarounds) is in [docs/credo-in-the-browser.md](docs/credo-in-the-browser.md). Where the data lives and how to recover it is in [docs/wallet-lifecycle.md](docs/wallet-lifecycle.md).

## Development

```bash
corepack enable     # Yarn 4, from packageManager in package.json
yarn install
yarn test
yarn build
```

`yarn build` is the production build. It runs the build checks afterwards (`yarn check:dist`, below). It refuses `http://` issuer and verifier URLs. Use `yarn dev` when the local issuer is `http://localhost:3003`.

Load `dist/` in Chrome at `chrome://extensions` with Developer Mode, then Load unpacked. Chrome does not support `protocol_handlers`, so an `openid-credential-offer:` link does not open this extension.

The Heka page sends the offer to the content script. The service worker stores it and opens `wallet.html`, or hands it to the wallet window that is already open, so one Credo agent serves consecutive requests. The wallet page asks for approval before contacting the issuer. Localhost and `127.0.0.1` are always allowed. Contacting any other HTTPS issuer or verifier asks for the optional `https://*/*` host permission from the Review or Accept click. To import an offer that did not come from that page, paste the URI on the popup Receive tab. That opens the same approval screen. The popup itself does not run Credo.

`yarn build` does not emit source maps. `yarn dev` does, because that build is for local debugging.

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
- the bundle contains `new Function` or `eval(` (`check:csp`), which Manifest V3 blocks.

[e2e/](e2e/README.md) drives the extension in Chrome for Testing: the bridge, the wallet window and a credential receive. It is not part of CI.

The Heka web UI checks that CI runs are in `heka-identity-service-web-ui`:

```bash
yarn install --immutable
yarn lint:ts
yarn lint:scss
```

Those are the same commands as `.github/workflows/heka-identity-service-web-ui-verify.yml`. If `yarn lint:ts` cannot find `eslint-plugin-unused-imports`, the install is stale — run `yarn install --immutable` again in that package. Do not add the plugin by hand.

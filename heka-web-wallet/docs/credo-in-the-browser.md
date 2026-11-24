# Credo in the browser

`@credo-ts/core` 0.7.4 and `@credo-ts/openid4vc` 0.7.4 run in `wallet.html`, a durable extension page. The popup and the service worker do not import Credo. They read a credential summary from `chrome.storage.local`.

Askar is not used. Records go through `IndexedDbStorageService`, registered on `InjectionSymbols.StorageService` by `BrowserStorageModule`. Its queries follow the semantics of Credo's `InMemoryStorageService`, so Credo's own queries (`DidRepository`, `DcqlService`) find the same records as with Askar. Private keys are created non-extractable in `WebCryptoKeyManagementService` (`backend: webcrypto-browser`). `importKey` is rejected.

## Build workarounds

- `express` is aliased to `src/credo/express-stub.ts`. `@credo-ts/openid4vc` imports it, and the holder path does not call it.
- `@digitalcredentials/open-badges-context` is aliased to `js/index.js`. The published `module` field points at a file that is not in the tarball.
- `KeyManagementModule` is imported from `@credo-ts/core/kms`. It is not exported from the package root.
- The `Function` / `eval` global lookup in `reflect-metadata` is rewritten to `globalThis` during the build.
- `cbor-x` is aliased to its `index-no-eval` build (`src/credo/cbor-no-eval.js`, which also re-exports `Tag` for `@owf/cose`). `setimmediate` is aliased to a `setTimeout` shim. Presentation Exchange, which compiles Ajv and JSONPath through `Function`, is replaced with stubs. The holder path uses DCQL only.
- The content script is built on its own as one IIFE (`vite.content-script.config.ts`): Chrome runs content scripts as classic scripts, which cannot `import` the chunks it would otherwise share with the service worker.

These workarounds match package and file names inside Credo and its dependencies. `yarn build` ends with checks that fail when one stops applying, when a content script is not a classic script, or when the bundle contains `new Function` or `eval(` (`scripts/check-*.mjs`). `e2e/` receives a credential from a local issuer in Chrome for Testing. DCQL presentation against a running verifier is not exercised there yet.

## Runtime

Branded Chrome ignores `--load-extension`; Chrome for Testing accepts it (see `e2e/`). `wallet.html` runs at `chrome-extension://<id>/wallet.html`.

`IndexedDbStorageService` stamps a new database with Credo's current storage version (0.5 in 0.7.4), and the agent runs with `autoUpdateStorageOnStartup: false`. After a Credo upgrade that changes the storage version, the wallet refuses to start instead of migrating the only copy of the credentials and keys.

| Bundle (Credo 0.7.4) | Size |
|---|---|
| `dist/wallet/index.js` | 1,668 kB minified, 423 kB gzip |
| Hedera resolver chunk | 1,635 kB minified, 319 kB gzip |
| `dist/popup/index.js` | 19 kB minified, 6 kB gzip |
| `dist/background/service-worker.js` | 3 kB minified, 1 kB gzip |
| `dist/content-scripts/heka-bridge.js` | 2 kB minified, 1 kB gzip |

The wallet entry is large because `@credo-ts/core` statically imports the modules the holder needs, so the dynamic import in `lazy-agent.ts` does not split them out of `wallet/index.js`. The popup bundle does not contain Credo.

## Holder behaviour

OID4VCI uses `agent.openid4vc.holder`. Each issued SD-JWT record is stored with `agent.sdJwtVc.store`, with the issuer's display metadata in the record's metadata. The holder key is P-256 (ES256) or, for issuers that accept only EdDSA, Ed25519. It is bound as a JWK when the issuer accepts one, otherwise as a `did:jwk` or `did:key`. Issuers that require a key attestation are rejected.

OID4VP accepts only DCQL. `handlePresentationRequest` throws when the resolved request has no `dcql` property. Presentation Exchange is not used.

## Two key management backends

Heka's verifier, like any Credo 0.7.4 verifier by default, asks for an encrypted response (`response_mode: direct_post.jwt`): an ephemeral P-256 key in `client_metadata.jwks`, and `A128GCM`, `A256GCM` or `A128CBC-HS256` as content encryption. Credo's holder answers with ECDH-ES: it creates a key with `kms.createKey({ type: <the verifier's JWK> })`, puts its public part in the JWE header, and calls `kms.encrypt` with that key for the key agreement.

WebCrypto fixes a key's algorithm when it creates it, and the backend's `createKey` only sees `{ kty, crv }`, the same as for a holder signing key. So the wallet has two backends:

- `webcrypto-browser` (the default) holds the holder keys (ECDSA, Ed25519) in IndexedDB. Its `isOperationSupported` declines `createKey` when the requested type is a whole public JWK for key agreement (`x`, `use: 'enc'` or an `ECDH` `alg`); Credo passes that type unparsed when it picks the backend.
- `webcrypto-browser-ecdh` (`WebCryptoKeyAgreementService`) then creates the key: a non-extractable ECDH P-256 key, **in memory only**. Its `encrypt` derives the content key with the Concat KDF (RFC 7518 §4.6.2) and **deletes the key when it ends**, whether it succeeded or not.

Credo's holder deletes the key afterwards with `kms.deleteKey({ keyId })`. In 0.7.4 that call goes to the default backend instead of the one holding the key (`KeyManagementApi.deleteKey` doesn't look the key id up, unlike `encrypt` or `getPublicKey`); the default backend answers false and Credo ignores it. That is why the key-agreement backend removes the key itself. `src/credo/__tests__/kms-routing.spec.ts` pins this routing, so a Credo upgrade that changes it fails there.

Credo 0.8 creates the ephemeral key inside `encrypt` (`keyAgreement: { recipient }`), so there one backend that does ECDH-ES would be enough.

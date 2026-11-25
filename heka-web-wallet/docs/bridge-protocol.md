# Bridge protocol v1

A web page talks to the Web Wallet through the extension's content script, which runs only on the sites the holder connected (see [trust-and-permissions.md](trust-and-permissions.md)). The Heka web UI implements the page side in `heka-identity-service-web-ui/src/shared/lib/webWallet`; the wallet side is `src/bridge/protocol.ts` and `src/content-scripts/heka-bridge.ts`. Each side keeps its own copy of the literals below, and both test against the examples in this document.

## Transport

- Both directions use `window.postMessage(message, location.origin)`.
- Every message is `{ source, type, payload }`. `PING` and `GET_STATUS` have no payload.
- Every receiver checks `event.source === window`, `event.origin === location.origin` and the `source` field, and ignores anything else.

## Page → extension

`source: 'heka-web-wallet-bridge'`.

| `type` | `payload` | |
|---|---|---|
| `PING` | | Answered by the content script itself, so it works while the service worker is starting |
| `GET_STATUS` | | |
| `RECEIVE_OFFER` | `{ offerUri, expiresAt? }` | `offerUri` starts with `openid-credential-offer:` and has at most 4096 characters. `expiresAt` is a date string; an unparsable one is dropped |
| `PRESENT_REQUEST` | `{ requestUri }` | `requestUri` starts with `openid4vp:`, has at most 4096 characters and no whitespace |

A message that breaks a rule is dropped without an answer. Extra fields are dropped.

## Extension → page

`source: 'heka-extension-bridge'`.

| `type` | `payload` | When |
|---|---|---|
| `EXTENSION_READY` | `{ protocolVersion: 1, extensionVersion }` | The content script loaded |
| `PING_RESPONSE` | `{ type: 'PONG', protocolVersion: 1, extensionVersion }` | Answer to `PING` |
| `GET_STATUS_RESPONSE` | `{ type: 'STATUS', initialized, credentialCount }` | Answer to `GET_STATUS`. `initialized` is true once the wallet page has started its agent |
| `RECEIVE_OFFER_RESPONSE`, `PRESENT_REQUEST_RESPONSE` | `{ type: 'OFFER_ACKNOWLEDGED' }` | The wallet stored the item and opened its window. The holder has not decided anything yet |
| `<TYPE>_RESPONSE` | `{ type: 'ERROR', message }` | The wallet refused or could not answer |
| `RECEIVE_STATUS` | `{ offerUri, state: 'done' \| 'error', message }` | The offer was received (`done`: at least one credential stored), declined, expired or failed |
| `PRESENT_STATUS` | `{ requestUri, state: 'done' \| 'error', message }` | The presentation was submitted, declined, or rejected or failed, or the request could not be opened (for example, no stored credential matches it) |

A status goes only to the tab that handed over the item, and only while that tab is still on the same origin. A page ignores a status whose `offerUri` or `requestUri` it did not send. An item pasted into the wallet's popup gets no status. An `error` can be followed by `done` when the holder retries in the wallet.

## Examples

### Page → extension

```json
{ "source": "heka-web-wallet-bridge", "type": "PING" }
```

```json
{ "source": "heka-web-wallet-bridge", "type": "GET_STATUS" }
```

```json
{
  "source": "heka-web-wallet-bridge",
  "type": "RECEIVE_OFFER",
  "payload": {
    "offerUri": "openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffers%2F42",
    "expiresAt": "2026-11-25T12:10:00.000Z"
  }
}
```

```json
{
  "source": "heka-web-wallet-bridge",
  "type": "PRESENT_REQUEST",
  "payload": {
    "requestUri": "openid4vp://?client_id=decentralized_identifier%3Adid%3Akey%3Az6Mkverifier&request_uri=https%3A%2F%2Fverifier.example%2Frequests%2F7"
  }
}
```

### Extension → page

```json
{
  "source": "heka-extension-bridge",
  "type": "EXTENSION_READY",
  "payload": { "protocolVersion": 1, "extensionVersion": "0.1.0" }
}
```

```json
{
  "source": "heka-extension-bridge",
  "type": "PING_RESPONSE",
  "payload": { "type": "PONG", "protocolVersion": 1, "extensionVersion": "0.1.0" }
}
```

```json
{
  "source": "heka-extension-bridge",
  "type": "GET_STATUS_RESPONSE",
  "payload": { "type": "STATUS", "initialized": true, "credentialCount": 1 }
}
```

```json
{
  "source": "heka-extension-bridge",
  "type": "RECEIVE_OFFER_RESPONSE",
  "payload": { "type": "OFFER_ACKNOWLEDGED" }
}
```

```json
{
  "source": "heka-extension-bridge",
  "type": "PRESENT_REQUEST_RESPONSE",
  "payload": { "type": "ERROR", "message": "This site is not connected to the wallet." }
}
```

```json
{
  "source": "heka-extension-bridge",
  "type": "RECEIVE_STATUS",
  "payload": {
    "offerUri": "openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffers%2F42",
    "state": "done",
    "message": "Received 1 credential."
  }
}
```

```json
{
  "source": "heka-extension-bridge",
  "type": "PRESENT_STATUS",
  "payload": {
    "requestUri": "openid4vp://?client_id=decentralized_identifier%3Adid%3Akey%3Az6Mkverifier&request_uri=https%3A%2F%2Fverifier.example%2Frequests%2F7",
    "state": "error",
    "message": "Presentation request declined."
  }
}
```

### Dropped by the content script

```json
{
  "source": "heka-web-wallet-bridge",
  "type": "PRESENT_REQUEST",
  "payload": { "requestUri": "https://verifier.example/requests/7" }
}
```

```json
{
  "source": "heka-web-wallet-bridge",
  "type": "RECEIVE_OFFER",
  "payload": { "offerUri": "https://issuer.example/offers/42" }
}
```

```json
{ "source": "some-other-script", "type": "PING" }
```

## Versions

This is version 1. `protocolVersion` changes when a message above changes incompatibly.

# Verification via the Digital Credentials API (DC API)

The Identity Service can request a Verifiable Presentation through the [**W3C Digital Credentials API (DC API)**](https://developer.chrome.com/blog/digital-credentials-api-shipped).

Instead of the holder scanning a QR code, the **browser and operating system** mediate the exchange: the
verifier's page requests only the specific, signed data it needs, the OS shows a built-in picker to select a
credential from an installed wallet, and the wallet's response (the `vp_token`) is handed straight back to the
browser.

The canonical setup is **same-device** — Chrome on Android running the verifier page with a mobile wallet
on the same phone. The same API also works **cross-device**: desktop Chrome renders its own QR code and, when
scanned, establishes an encrypted, phishing-resistant connection to a phone over Bluetooth (CTAP).

## How it differs from the legacy QR code flow

|                 | QR / deeplink (`direct_post`)                                              | Digital Credentials API (`dc_api`)                                                       |
|-----------------|----------------------------------------------------------------------------|------------------------------------------------------------------------------------------|
| Transport       | Wallet fetches the request via a URL, POSTs the response to `response_uri` | OS passes the request to the wallet and returns the response to the browser              |
| Devices         | Cross-device (verifier on desktop, wallet on phone)                        | Same device, or cross-device on desktop (browser shows its own QR + Bluetooth handshake) |
| Origin binding  | n/a                                                                        | The calling web origin is bound into the verification (anti-phishing)                    |
| Result delivery | Verifier polls the session until `ResponseVerified`                        | Synchronous — the browser forwards the response to be verified                           |

## End-to-end DC API flow on client side (Web UI)

```
Browser (Chrome on Android, Heka Wallet on the same device)
  1. POST /openid4vc/verification-session/request
       { publicVerifierId, requestSigner: { method: "did", did }, dcql,
         responseMode: "dc_api", version: "v1", expectedOrigins: [origin] }
     -> { verificationSession, authorizationRequestObject }   // signed JAR: { request: "<jwt>" }

  2. navigator.credentials.get({ digital: { requests: [
       { protocol: "openid4vp-v1-signed", data: authorizationRequestObject } ] } })   // data is the OBJECT
     -> OS picker -> Heka Wallet consent/unlock -> DigitalCredential{ data }   // wallet returns { protocol, data }

  3. POST /openid4vc/verification-session/{id}/verify
       { authorizationResponse: <parsed DigitalCredential.data>, origin: <window.location.origin> }
     -> { state: "ResponseVerified", sharedAttributes }
```

## API

### Create the request

`POST /openid4vc/verification-session/request`

Add `responseMode: "dc_api"` (or `dc_api.jwt`) to the standard create-request body. To sign the request —
required by current wallet matchers — pass a `requestSigner` (`{ method: "did", did }`) and `expectedOrigins`
(e.g. `["https://verifier.example.com"]`) to bind the calling page; without a `requestSigner` it is sent
unsigned (`web-origin`). `dc_api` uses OpenID4VP `v1` (the default when a `dcql` query is present), which
disallows DIF Presentation Exchange — so describe the credential with a **DCQL** query (`dcql`), not
`presentationExchange`. DCQL covers `mso_mdoc` and SD-JWT VC; for SD-JWT VC request the **`dc+sd-jwt`** type id
(what Credo signs and wallets register with the OS matcher — legacy `vc+sd-jwt` is still accepted but won't
match an on-device credential).

```jsonc
{
  "publicVerifierId": "<verifier id>",
  "responseMode": "dc_api",
  "version": "v1",
  "dcql": {
    "query": {
      "credentials": [
        {
          "id": "requested-credential",
          "format": "mso_mdoc",
          "meta": { "doctype_value": "org.iso.18013.5.1.mDL" },
          "claims": [{ "path": ["org.iso.18013.5.1", "age_over_18"], "intent_to_retain": false }],
        },
      ],
    },
  },
}
```

Response (DC-API-specific field):

```jsonc
{
  "verificationSession": { "id": "...", "state": "RequestCreated" },
  "authorizationRequest": "openid4vp://...",
  "authorizationRequestObject": {
    /* pass this object into navigator.credentials.get() */
  },
}
```

`authorizationRequestObject` is only returned for `dc_api` / `dc_api.jwt`.

### Verify the response

`POST /openid4vc/verification-session/{verificationSessionId}/verify`

After `navigator.credentials.get()` resolves, the browser forwards the wallet's response here. The `origin`
is validated against the calling page (anti-phishing).

```jsonc
{
  "authorizationResponse": {
    /* the parsed DigitalCredential.data */
  },
  "origin": "https://verifier.example.com",
}
```

On success the verification session reaches `ResponseVerified` and the response includes the disclosed
`sharedAttributes`, so the result can be shown without a follow-up `GET`.

## Trying it out in the Web UI

Heka Identity Service Web UI supports DC API in its verification flow.
When the browser supports the DC API (e.g. Chrome on Android, or desktop Chrome for cross-device),
the presentation step offers a choice between the **Digital Credentials API** and **Legacy QR code** presentation options.
The choice is available in the standard verification flow as well as the built-in demos.

# How to Issue an SD-JWT VC

This guide walks through issuing an [IETF SD-JWT VC](https://datatracker.ietf.org/doc/draft-ietf-oauth-sd-jwt-vc/) (`vc+sd-jwt`) credential over OpenID4VCI to the Heka Wallet (or any OID4VCI-compliant wallet).

> **Note:** Exact request/response shapes are authoritative in [Swagger UI](http://localhost:3000/docs) — open it side-by-side while following the guide.

## When to Use SD-JWT VC

SD-JWT VC is the right choice when:

- You need **selective disclosure** — the holder can present only specific claims to a verifier without revealing the rest.
- You're integrating with the **EUDI Wallet** ecosystem or another OID4VC-aligned deployment.
- The credential should not depend on JSON-LD contexts.

For other formats (mDoc, W3C VC-JWT, AnonCreds), see the equivalent how-tos and [Concepts and Glossary](concepts.md#wire-formats-and-how-to-choose).

## Prerequisites

1. The Heka Identity Service is running, and you can reach Swagger UI at `/docs` (default `http://localhost:3000/docs`). See [Setup and Configuration](setup.md).
2. You have an authenticated session — see [Authentication / Authorization in the demo flow](demo-flow.md#authenticationauthorization).
3. The mobile wallet device can reach the service over the network. If you're working locally, see [Local Configuration for Heka Wallet Integration](local-config-for-heka-wallet-integration.md).

## High-Level Flow

```
1. (Once per tenant) Prepare wallet — create a public DID for the issuer
2. (Once per credential type) Create an OpenID4VCI Issuer record advertising the SD-JWT VC type
3. (Per credential issuance) Create an issuance session — produces a credential offer URL / QR
4. Holder scans the offer; OID4VCI flow completes; credential lands in the wallet
5. Inspect the issuance session to confirm completion
```

## Step 1 — Prepare the Issuer Tenant

If this is a fresh tenant, call `POST /prepare-wallet` to bootstrap a public DID and supporting state. Once prepared, the tenant can issue credentials.

If the tenant already has a public DID, skip this step. List existing DIDs via `GET /dids` to confirm.

## Step 2 — Register the OpenID4VCI Issuer

Create an Issuer record that advertises an SD-JWT VC credential configuration.

**Endpoint:** `POST /openid4vc/issuer`

**Body example:**

```json
{
  "publicIssuerId": "example-sd-jwt-issuer",
  "credentialsSupported": [
    {
      "format": "vc+sd-jwt",
      "id": "ExampleCredentialSdJwtVc",
      "vct": "https://example.com/vct#ExampleCredential",
      "cryptographic_binding_methods_supported": ["did:key", "did:jwk"],
      "cryptographic_suites_supported": ["ES256", "Ed25519"],
      "display": [
        {
          "name": "Example SD-JWT Credential",
          "description": "A demo credential issued as SD-JWT VC",
          "background_color": "#ffffff",
          "text_color": "#000000",
          "locale": "en-US"
        }
      ]
    }
  ],
  "display": [
    {
      "name": "Example Issuer",
      "description": "Demo issuer for SD-JWT VC",
      "locale": "en-US"
    }
  ]
}
```

**Field notes:**

- `publicIssuerId` — your chosen identifier for this Issuer record. Used as the `iss` in OID4VCI metadata.
- `credentialsSupported[].id` — referenced later as `credentialSupportedId` when creating an offer. **Save this value.**
- `credentialsSupported[].format` — must be `vc+sd-jwt` for SD-JWT VC.
- `credentialsSupported[].vct` — the credential type identifier holders use to recognize the credential. Use a stable URL you control; this becomes the `vct` claim in every issued credential.
- `cryptographic_binding_methods_supported` — DID methods the wallet may bind the credential to. Include `did:key` for the broadest wallet compatibility.

To list existing issuer records or look up the supported credentials of an issuer:

- `GET /openid4vc/issuer?publicIssuerId=...`
- `GET /openid4vc/issuer/supported-credentials?publicIssuerId=...`

## Step 3 — Create an Issuance Session (Offer)

This produces the credential offer URL the wallet consumes.

**Endpoint:** `POST /openid4vc/issuance-session/offer`

**Body example:**

```json
{
  "publicIssuerId": "example-sd-jwt-issuer",
  "credentials": [
    {
      "credentialSupportedId": "ExampleCredentialSdJwtVc",
      "format": "vc+sd-jwt",
      "issuer": {
        "method": "did",
        "didUrl": "did:key:z6Mk...#z6Mk..."
      },
      "payload": {
        "first_name": "John",
        "last_name": "Doe",
        "age": {
          "over_18": true,
          "over_21": true,
          "over_65": false
        }
      },
      "disclosureFrame": {
        "_sd": ["age.over_21", "age.over_18", "age.over_65"]
      }
    }
  ]
}
```

**Field notes:**

- `credentialSupportedId` — must match the `id` you set in Step 2.
- `format` — must match the format from Step 2 (`vc+sd-jwt`).
- `issuer.didUrl` — a DID URL of an issuer key. Typically the verification method of the public DID created in Step 1. The DID method must be one of those listed in `cryptographic_binding_methods_supported`.
- `payload` — the actual claims to include in the credential. The `vct` claim is added automatically; if you include it explicitly it must match Step 2.
- `disclosureFrame._sd` — claim paths that should be **selectively disclosable**. Holders can prove these claims individually without revealing the rest.

**Response:** the API returns an `issuanceSessionId` and a credential offer URI / URL. Render the URL as a QR code (any QR-code library works) for scanning, or open it directly on a device that has the wallet installed.

## Step 4 — Holder Receives the Credential

1. Open the Heka Wallet on a phone that can reach the Identity Service over the network.
2. Use the wallet's **Scan** action to scan the QR code, or open the offer URL directly on the device.
3. The wallet shows the offered credential — including the issuer display, claim names, and optionally a logo (from the `display` block in Step 2).
4. Tap **Accept** to complete issuance. The OID4VCI token + credential exchange happens behind the scenes; the wallet stores the SD-JWT VC.
5. The credential appears in the wallet's credentials list.

## Step 5 — Confirm Issuance Server-Side

To verify the credential was issued successfully:

- `GET /openid4vc/issuance-session/{issuanceSessionId}` — returns the session record with its current state. After successful issuance, the state transitions to a terminal "issued" state.
- `GET /openid4vc/issuance-session/?state=...` — query by state to find recent sessions.

You can also subscribe to webhook / WebSocket notifications for real-time updates — see [API and Notifications](api.md).

## Selective Disclosure: How `disclosureFrame` Works

The `disclosureFrame` parameter controls which claims become individually disclosable.

- Claims listed under `_sd` are wrapped in selective-disclosure digests — the holder can choose at presentation time to disclose them.
- Nested paths use dot notation (e.g. `"age.over_21"` to mark the `over_21` field of the `age` object as disclosable).
- Claims **not** listed in `_sd` are always disclosed. The `vct` claim and other identifying metadata are typically not made selective.

Example: with the body above, the holder can present a proof revealing only `age.over_18` without disclosing `first_name`, `last_name`, or `age.over_65`.

## Useful Endpoints

| Endpoint                                       | Purpose                                                                        |
|------------------------------------------------|--------------------------------------------------------------------------------|
| `POST /prepare-wallet`                         | Bootstrap a tenant (Step 1).                                                   |
| `GET /dids`                                    | List the tenant's DIDs.                                                        |
| `POST /openid4vc/issuer`                       | Create an Issuer record (Step 2).                                              |
| `GET /openid4vc/issuer/supported-credentials`  | Inspect the credentials advertised by an Issuer.                               |
| `PUT /openid4vc/issuer/{issuerId}`             | Update an Issuer's metadata (overwrite — include all fields you want to keep). |
| `POST /openid4vc/issuance-session/offer`       | Create an offer (Step 3).                                                      |
| `GET /openid4vc/issuance-session/{id}`         | Inspect a session's state (Step 5).                                            |
| `DELETE /openid4vc/issuance-session/{id}`      | Cancel a pending session.                                                      |
| `POST /openid4vc/issuance-session/{id}/revoke` | Revoke an issued credential (where supported).                                 |

## Troubleshooting

- **Wallet shows "credential offer not found".** The wallet can't reach the issuer endpoint. Confirm the wallet device can reach the OID4VCI endpoint configured in `AGENT_OID4VCI_ENDPOINT` — for local setups, route through ngrok / nginx as in [Local Configuration for Heka Wallet Integration](local-config-for-heka-wallet-integration.md).
- **`format must be vc+sd-jwt` validation error.** The format string in the offer body must exactly equal `vc+sd-jwt`. Other casing or hyphen variants fail DTO validation.
- **`credentialSupportedId not found`.** The id passed in the offer doesn't exist on the Issuer record. Use `GET /openid4vc/issuer/supported-credentials` to list valid ids for `publicIssuerId`.
- **Disclosable claim missing after disclosure.** Claim paths in `disclosureFrame._sd` must match the structure of `payload` exactly. Nested paths use dot notation.

## See Also

- [Concepts and Glossary](concepts.md) — terminology and how SD-JWT VC fits in the model
- [Demo flow](demo-flow.md) — equivalent flow for AnonCreds over DIDComm
- [Local Configuration for Heka Wallet Integration](local-config-for-heka-wallet-integration.md) — exposing the local instance to a phone
- [IETF SD-JWT VC draft](https://datatracker.ietf.org/doc/draft-ietf-oauth-sd-jwt-vc/)
- [OID4VCI spec](https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html)

# Heka Identity Service — API

The Identity Service exposes a REST API and a notification subsystem (webhook / WebSocket) for asynchronous events.

## REST API

By default, the API is available at <http://localhost:3000> when the service is running locally. The complete endpoint reference — including request / response shapes and try-it-out functionality — is exposed via Swagger UI at `/docs` (e.g. <http://localhost:3000/docs>).

Endpoints are grouped by domain:

- **Connections** (`/connections/*`) — DIDComm connection invitations and lifecycle.
- **DIDs** (`/dids/*`) — public DID creation, lookup, update and deactivation (see [DID update and deactivation](#did-update-and-deactivation)).
- **Schemas** (`/schemas/*`, `/schemas/v2/*`) — credential schema management. Use v2 for new integrations.
- **Credential Definitions** (`/credential-definitions/*`) — AnonCreds credential definitions.
- **Credentials** (`/credentials/*`, `/credentials/v2/*`) — DIDComm-flavored issuance (v1) and template-based / OID4VC-flavored issuance (v2).
- **Proofs** (`/proofs/*`) — DIDComm proof requests and presentations.
- **Issuance / Verification Templates** (`/issuance-templates/*`, `/verification-templates/*`) — reusable issuance and verification definitions referenced by `credentials/v2`.
- **OpenID4VC**:
  - `/openid4vc/issuer/*` — Issuer record management.
  - `/openid4vc/issuance-session/*` — credential offer creation, lookup, revocation.
  - `/openid4vc/verifier/*` — Verifier record management.
  - `/openid4vc/verification-session/*` — proof request creation and status.
- **Revocation** (`/revocation-registries/*`, `/revocation/tails/*`, `/credentials/status/*`, `/status-lists/*`) — revocation registries, tails files, and status-list management.
- **User** (`/user/*`) — webhook / WebSocket subscription for notification events (see below).
- **Prepare Wallet** (`/prepare-wallet`) — bootstrap a tenant wallet with default state.
- **Health** (`/health`) — memory + database health probe.

## DID update and deactivation

A wallet can change or retire the DIDs it created (`POST /dids`), because it holds their keys. The routes are open to the Admin, OrgAdmin and Issuer roles; a DID of another wallet, or any external DID, is `404`. A parent wallet has no authority over the DIDs of its children.

- `PATCH /dids/:did` adds or removes services and verification methods. The body lists between 1 and 10 operations in total (an empty body is rejected with 400); ids are relative fragments:

  ```json
  {
    "addServices": [{ "id": "#svc-1", "type": "LinkedDomains", "serviceEndpoint": "https://example.com" }],
    "removeServices": ["#svc-0"],
    "addVerificationMethods": [{ "id": "#key-1", "purposes": ["assertionMethod"] }],
    "removeVerificationMethods": ["#key-0"]
  }
  ```

  The Identity Service generates the key of each added verification method (Ed25519, `Ed25519VerificationKey2020`) in the wallet; no field takes key material. `id` defaults to the lowest unused `#key-<n>`, `purposes` to `["assertionMethod", "authentication"]` (allowed: `authentication`, `assertionMethod`, `capabilityInvocation`, `capabilityDelegation`). The response is the updated DID document.

- `POST /dids/:did/deactivate` deactivates the DID and returns its document with `deactivated: true`. **Deactivation is irreversible.** Deactivating a deactivated DID returns `200` again, without a ledger write. When the ledger write reports a failure, the ledger is read again: if it shows the DID deactivated (the write went through, but its response was lost), the result is `200` as well; otherwise the original error is returned. The keys stay in the wallet, so AnonCreds credentials issued with the DID remain revocable.

| Method         | Update | Deactivate | Notes                                                                                                                                                                                                                                                                           |
| -------------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hedera`       | yes    | yes        | One HCS message per added or removed entry. The root key `#did-root-key` cannot be changed. A key referenced from a verification relationship cannot be removed (Hiero DID SDK 0.1.8 would leave a dangling reference), so only keys added with `"purposes": []` are removable. |
| `indybesu`     | yes    | yes        | The document is replaced in one transaction, sent by the DID's own account (no endorser). The owner key `#KEY-1` cannot be changed. Service types are limited to `LinkedDomains`, `DIDCommMessaging`, `CredentialRegistry`, `OID4VCI` and `OID4VP`.                             |
| `key`, `jwk`   | no     | no         | Immutable: `422`.                                                                                                                                                                                                                                                               |
| `indy`, `peer` | no     | no         | Not implemented yet: `422`.                                                                                                                                                                                                                                                     |
| `web`          | no     | no         | Not hosted by the Identity Service: `422`.                                                                                                                                                                                                                                      |

`GET /dids/methods` reports the same per configured method in `capabilities` (`update`, `deactivate`, `controller`).

Errors: `400` for an invalid body or a method that is not configured, `403` for the shared Indy endorser DID or a role that may not change DIDs, `404` for a DID that is not the wallet's own, `409` for an update of a deactivated DID, `422` for an unsupported method or change (the key that controls the DID, an id that exists or does not), `503` while another request holds the wallet or when the DID's ledger cannot be read for an update. A failed ledger write is `500` with the ledger's reason; on Hedera, entries written before the failure stay on the ledger, and the wallet's DID record follows the ledger. When a failed write may still have reached the ledger (a Hedera message or an Indy-Besu transaction was sent), the keys generated for it stay in the wallet.

Removing a verification method also deletes its private key from the wallet, after the ledger write succeeded. When the update fails, the ledger is read once more: a verification method requested for removal that the ledger no longer shows is removed from the wallet's DID record and its private key is deleted, and the update still returns its error. When the ledger does not show the removal yet, or cannot be read, the key is kept; should the removal land later, the key stays in the wallet (a retry of the removal is then rejected with `422`). The key that controls the DID, and a key another verification method still uses, are never deleted.

After deactivation the DID is no longer used by the Identity Service: `GET /dids?own=true` leaves it out (unless `includeDeactivated=true`, which lists it with `deactivated: true`), `POST /prepare-wallet` creates a new DID of the method, it is not the controller of new DIDs, and AnonCreds schema and credential definition registrations (`POST /schemas`, `POST /credential-definitions`, `POST /v2/schemas/:id/registration`) and new OID4VC issuance offers or verification requests with it are rejected with `422`. Registrations check the DID's ledger as well as the wallet, so a DID deactivated on its ledger but not recorded as such in the wallet is rejected too (and recorded); when the ledger cannot be read, the wallet's record decides. Revocation registries and status lists of credentials issued before stay available. `GET /dids/:did` returns it with `deactivated: true`. Its existing OID4VC issuer and verifier records are kept.

On Hedera every message waits until it is visible on the mirror node, so an update with several operations can take minutes; allow for it in client and proxy timeouts. With several Identity Service instances, the other instances may serve the previous did:hedera document from their resolver cache for up to 5 minutes.

## Notifications

Many API methods initiate asynchronous processes. The Identity Service emits notification events so clients can track state changes without polling. Subscribe via a webhook URL or a WebSocket connection through the `/user` endpoint — pick whichever suits your client.

Webhook URLs are treated as untrusted egress: they must use `https:` and resolve to a globally routable address, and a URL that violates the policy is rejected with `400 Bad Request` on `PATCH /user`. See [Notification webhooks](setup.md#notification-webhooks) for the full policy and the `WEBHOOK_*` settings that relax it for local development.

Three notification event types are emitted:

### 1. Connection State Change

- `id`: the unique identifier of the connection record
- `type`: `ConnectionStateChanged` (Credo event type)
- `state`: `start` / `invitation` / `abandoned` / `completed`
- `details` (data from connection record):

  ```json
  {
    "threadId": "string",
    "did": "string",
    "theirDid": "string",
    "theirLabel": "string",
    "alias": "string",
    "imageUrl": "string",
    "errorMessage": "string",
    "invitationDid": "string"
  }
  ```

### 2. Credential State Change

- `id`: the unique identifier of the credential record
- `type`: `CredentialStateChanged` / `RevocationNotificationReceived` (Credo event type)
- `state`: `offer-sent` / `credential-issued` / `declined` / `done`
- `details` (data from credential record):

  ```json
  {
    "connectionId": "string",
    "threadId": "string",
    "errorMessage": "string",
    "credentialAttributes": [
      {
        "name": "string",
        "value": "string"
      }
    ]
  }
  ```

### 3. Proof State Change

- `id`: the unique identifier of the proof record
- `type`: `ProofStateChanged` (Credo event type)
- `state`: `request-sent` / `presentation-received` / `declined` / `done`
- `details` (data from proof record):

  ```json
  {
    "connectionId": "string",
    "threadId": "string",
    "isVerified": true,
    "errorMessage": "string"
  }
  ```

## See Also

- [Setup and Configuration](setup.md) — service setup, env vars, and how to expose the API
- [Concepts and Glossary](concepts.md) — roles, multi-tenancy, core abstractions
- [Demo flow](demo-flow.md) — end-to-end AnonCreds issuance and verification example
- [How to Issue an SD-JWT VC](how-to-issue-sd-jwt-vc.md) — OID4VCI-based issuance walkthrough

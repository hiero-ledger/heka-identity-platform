# Heka Identity Service — API

The Identity Service exposes a REST API and a notification subsystem (webhook / WebSocket) for asynchronous events.

## REST API

By default, the API is available at <http://localhost:3000> when the service is running locally. The complete endpoint reference — including request / response shapes and try-it-out functionality — is exposed via Swagger UI at `/docs` (e.g. <http://localhost:3000/docs>).

Endpoints are grouped by domain:

- **Connections** (`/connections/*`) — DIDComm connection invitations and lifecycle.
- **DIDs** (`/dids/*`) — public DID creation and lookup.
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

### Issued credentials and revocation

There is no single "issued credentials" endpoint. A client lists finished issuances per protocol and merges them:

- **DIDComm (AnonCreds):** `GET /credentials?role=issuer&state=done`. `role` (`issuer` | `holder`) and `state` (a DIDComm credential state) are optional filters next to `threadId`; an unknown value returns `400`. Every record has:
  - `role` — this wallet's role in the exchange;
  - `revocable` — `true` when this wallet issued the credential with an AnonCreds revocation registry entry. Holder records are never revocable here, even though they carry the same registry tags;
  - `credentialDefinitionId` — when known (from the record metadata, or from the revocation registry for anoncreds-w3c);
  - `revoked` — only in the list response, only for revocable issuer records in state `done`. It comes from the ledger revocation status list (one read per registry). If the ledger cannot be read, `revoked` is absent, which means "unknown"; the list itself still returns `200`. Right after a revoke, the ledger may lag, so `revoked` can stay `false` for a few seconds. `GET /credentials/:id` never reads the ledger and never returns `revoked`.
- **OpenID4VC:** `GET /openid4vc/issuance-session?state=Completed`. Every session has `revocable: false` and no `revoked` field: issued OID4VC credentials (`jwt_vc_json`, `jwt_vc_json-ld`, `ldp_vc`, SD-JWT VC, mDoc) do not reference a status list yet.

Revoking:

| Endpoint | Success | Errors |
|---|---|---|
| `POST /credentials/:id/revoke` | `200`, the credential's bit is set in the AnonCreds revocation status list on the ledger, and the holder is sent a DIDComm revocation notification (best effort, see below) | `404` unknown record; `400` the record was not issued by this wallet (holder record), or the credential has no revocation registry entry; `409` already revoked; `500` the ledger update failed |
| `POST /openid4vc/issuance-session/:id/revoke` | `200`, the bit of the session's first credential is set in the issuer-side status list | `404` unknown session; `400` the session has no credentials metadata or its first credential has no status list entry (SD-JWT VC, mDoc) |

After a successful `POST /credentials/:id/revoke`, the service sends a [revocation notification v2](https://github.com/hyperledger/aries-rfcs/tree/main/features/0721-revocation-notification-v2) (`revocation_format: anoncreds`, `credential_id: <revocationRegistryDefinitionId>::<credentialRevocationId>`) over the credential's DIDComm connection, so a Credo-based wallet such as Heka Wallet marks its copy as revoked. This works for `anoncreds-indy` credentials only: for `anoncreds-w3c`, Credo's holder keeps the revocation ids in record metadata rather than in the tags it searches, so it can't match the notification and ignores it. This is best effort: the ledger update is already done, so if the record has no connection (connectionless issuance) nothing is sent, and if sending fails (connection removed, holder unreachable) the service logs a warning with the record and registry ids and still returns `200`. Verifiers rely on the ledger, not on the notification.

`POST /openid4vc/issuance-session/:id/revoke` still returns `200` for `jwt_vc_json`, `jwt_vc_json-ld` and `ldp_vc` sessions, although their `revocable` is `false`: the issued credentials do not contain `credentialStatus`, so wallets and verifiers never read the bit it sets. Repeating it returns `200` again (no `409`).

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

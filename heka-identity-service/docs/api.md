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
  - `format` — `anoncreds-indy` or `anoncreds-w3c` (the values of `format` in `POST /credentials/offer`), in the list and in `GET /credentials/:id`. It comes from the stored issue-credential v2 offer message (one storage query per 100 records in the list), because the exchange record looks the same for both formats. A Data Integrity offer counts as `anoncreds-w3c` only when it binds the credential to an AnonCreds link secret. `format` is absent when it can't be determined: no offer stored yet, an offer with several or other formats, or a failed lookup (logged as a warning; the response is still `200`);
  - `revoked` — only in the list response, only for revocable issuer records in state `done`. It comes from the ledger revocation status list (one read per registry). If the ledger cannot be read, `revoked` is absent, which means "unknown"; the list itself still returns `200`. Right after a revoke, the ledger may lag, so `revoked` can stay `false` for a few seconds. `GET /credentials/:id` never reads the ledger and never returns `revoked`.
- **OpenID4VC:** `GET /openid4vc/issuance-session?state=Completed`. Every session has:
  - `revocable` — `true` for sessions whose SD-JWT VCs (`vc+sd-jwt`) reference an IETF Token Status List (see [SD-JWT VC status](#sd-jwt-vc-status)). Always `false` for `jwt_vc_json`, `jwt_vc_json-ld`, `ldp_vc` and mDoc (`mso_mdoc`), and for SD-JWT VC sessions created before token status lists;
  - `revoked` — only when `revocable`: `true` once every status entry of the session is invalid. It is read from the token status lists in the service's own database (one query per list call), so there is no ledger and no lag. If they cannot be read, `revoked` is absent ("unknown"), one warning with the list ids is logged, and the list itself still returns `200`. `GET /openid4vc/issuance-session/:id` and the offer response carry the same fields.

Revoking:

| Endpoint | Success | Errors |
|---|---|---|
| `POST /credentials/:id/revoke` | `200`, the credential's bit is set in the AnonCreds revocation status list on the ledger, and the holder is sent a DIDComm revocation notification (best effort, see below) | `404` unknown record; `400` the record was not issued by this wallet (holder record), or the credential has no revocation registry entry; `409` already revoked; `500` the ledger update failed |
| `POST /openid4vc/issuance-session/:id/revoke` (SD-JWT VC) | `200`, every token status list entry of the session (one per credential of a batch) is set to invalid and the list is re-signed; verifiers reject the credential from then on | `404` unknown session, or its status list is gone; `409` already revoked |
| `POST /openid4vc/issuance-session/:id/revoke` (other formats) | `200`, the bit of the session's first credential is set in the issuer-side W3C status list | `404` unknown session; `400` the session has no credentials metadata or its first credential has no status list entry (mDoc, SD-JWT VC issued before token status lists) |

After a successful `POST /credentials/:id/revoke`, the service sends a [revocation notification v2](https://github.com/hyperledger/aries-rfcs/tree/main/features/0721-revocation-notification-v2) (`revocation_format: anoncreds`, `credential_id: <revocationRegistryDefinitionId>::<credentialRevocationId>`) over the credential's DIDComm connection, so a Credo-based wallet such as Heka Wallet marks its copy as revoked. This works for `anoncreds-indy` credentials only: for `anoncreds-w3c`, Credo's holder keeps the revocation ids in record metadata rather than in the tags it searches, so it can't match the notification and ignores it. This is best effort: the ledger update is already done, so if the record has no connection (connectionless issuance) nothing is sent, and if sending fails (connection removed, holder unreachable) the service logs a warning with the record and registry ids and still returns `200`. Verifiers rely on the ledger, not on the notification.

`DELETE /openid4vc/issuance-session/:id` returns `204`. The session is the only link to the token status list entries of its SD-JWT VCs, so a session the holder has started to redeem (any state after `OfferCreated` / `OfferUriRetrieved`, `Error` included) is deleted only after its credentials are revoked; otherwise it returns `409` and keeps the session. Pending offers and sessions of other formats are deleted in any case. An unknown session returns `404`.

`POST /openid4vc/issuance-session/:id/revoke` still returns `200` for `jwt_vc_json`, `jwt_vc_json-ld` and `ldp_vc` sessions, although their `revocable` is `false`: the issued credentials do not contain `credentialStatus`, so wallets and verifiers never read the bit it sets. Repeating it returns `200` again (no `409`).

#### SD-JWT VC status

Every SD-JWT VC issued over OID4VCI carries an always-disclosed `status` claim ([IETF Token Status List](https://datatracker.ietf.org/doc/draft-ietf-oauth-status-list/)):

```json
"status": { "status_list": { "idx": 4711, "uri": "<APP_ENDPOINT>/token-status-lists/<id>" } }
```

- The offer reserves one random entry per credential the wallet may request in a batch, in a list of the key that signs the credential (the issuer DID's verification method). An offer whose `issuer.did` is not a DID of the caller's wallet is rejected with `422`. `status` is set by the issuer: an offer with `status` in `payload` or in `disclosureFrame._sd` is rejected with `400`.
- `GET /token-status-lists/:id` is public (no token). It returns the list as a compact JWS with `Content-Type: application/statuslist+jwt` and `Cache-Control: max-age=300`. The header is `{ typ: "statuslist+jwt", alg, kid: <issuer DID URL> }`; the payload has `iss` (the issuer DID), `sub` (the exact `uri` in the credentials), `iat`, `ttl: 300` and `status_list: { bits: 1, lst }`, and no `exp`. It is signed with the same key as the credentials, because Credo verifies a status list with the credential's issuer key. An `Accept` that does not admit `application/statuslist+jwt` (e.g. CWT only) gets `406`; no `Accept` or `*/*` gets the JWT. An unknown id gets `404`.
- Lists belong to the wallet (tenant) holding the key, so any member of an organization wallet can revoke what another member issued.
- Wallets and verifiers fetch the list from `APP_ENDPOINT`, **also when a wallet receives the credential**: Credo-based wallets (Heka Wallet included) verify the status on receipt and reject the credential if the list cannot be fetched. With `APP_ENDPOINT=http://localhost:3000`, a phone cannot accept SD-JWT VCs; set `APP_ENDPOINT` to a URL the phone can reach (see [Local Configuration for Heka Wallet Integration](local-config-for-heka-wallet-integration.md)). Changing `APP_ENDPOINT` later strands the credentials issued before, as with tails files.
- Revoking does not change `exp` or caches: a wallet may keep a fetched list for up to `ttl` / `max-age` (5 minutes). The service's own verifier fetches the list on every presentation.
- If a DID update removes the key a list is signed with from the wallet, revoking the credentials of that list fails, because the list can no longer be re-signed.

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

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

### Issued credentials

There is no single "issued credentials" endpoint. A client lists finished issuances per protocol and merges them:

- **DIDComm (AnonCreds):** `GET /credentials?role=issuer&state=done`. `role` (`issuer` | `holder`) and `state` (a DIDComm credential state) are optional filters next to `threadId`; an unknown value returns `400`, and so does an unknown query parameter. Every record has:
  - `role` — this wallet's role in the exchange;
  - `revocable` — `true` when this wallet issued the credential with an AnonCreds revocation registry entry. Holder records are never revocable here, even though they carry the same registry tags;
  - `credentialDefinitionId` — when known (from the record metadata, or from the revocation registry for anoncreds-w3c);
  - `format` — `anoncreds-indy` or `anoncreds-w3c` (the values of `format` in `POST /credentials/offer`), in the list and in `GET /credentials/:id`. It comes from the stored issue-credential v2 offer message (one storage query per 100 records in the list), because the exchange record looks the same for both formats. A Data Integrity offer counts as `anoncreds-w3c` only when it binds the credential to an AnonCreds link secret. `format` is absent when it can't be determined: no offer stored yet, an offer with several or other formats, or a failed lookup (logged as a warning; the response is still `200`);
  - `revoked` — only in the list response, only for revocable issuer records in state `done`. It comes from the ledger revocation status list (one read per registry). If the ledger cannot be read, `revoked` is absent, which means "unknown"; the list itself still returns `200`. Right after a revoke, the ledger may lag, so `revoked` can stay `false` for a few seconds. `GET /credentials/:id` never reads the ledger and never returns `revoked`.
- **OpenID4VC:** `GET /openid4vc/issuance-session?state=Completed`. Every session has:
  - `revocable` — `true` for sessions whose SD-JWT VCs (`vc+sd-jwt`) reference an IETF Token Status List (see [SD-JWT VC status](#sd-jwt-vc-status)). Always `false` for `jwt_vc_json`, `jwt_vc_json-ld`, `ldp_vc` and mDoc (`mso_mdoc`), and for SD-JWT VC sessions created before token status lists;
  - `revoked` — only when `revocable`: `true` once every status entry of the session is invalid. It is read from the token status lists in the service's own database (one query per list call), so there is no ledger and no lag. If they cannot be read, `revoked` is absent ("unknown"), one warning with the list ids is logged, and the list itself still returns `200`. `GET /openid4vc/issuance-session/:id` and the offer response carry the same fields.

### Revocation

With the role model enforced (`ROLE_MODEL_ENABLED=true`), only the Admin, OrgAdmin, OrgManager and Issuer roles may revoke; other roles get `403`. `GET /user` returns `canRevokeCredentials` for the caller (always `true` while the role model is not enforced), so a client can hide revocation from users who may not use it.

| Endpoint | Success | Errors |
|---|---|---|
| `POST /credentials/:id/revoke` | `200`, the credential's bit is set in the AnonCreds revocation status list on the ledger, and the holder is sent a DIDComm revocation notification (best effort, see below) | `404` unknown record; `400` the record was not issued by this wallet (holder record), or the credential has no revocation registry entry; `409` already revoked; `500` the ledger update failed |
| `POST /openid4vc/issuance-session/:id/revoke` (SD-JWT VC) | `200`, every token status list entry of the session (one per credential of a batch) is set to invalid and the list is re-signed; verifiers reject the credential from then on | `404` unknown session, or its status list is gone; `409` already revoked |
| `POST /openid4vc/issuance-session/:id/revoke` (other formats) | `200`, the bit of the session's first credential is set in the issuer-side W3C status list | `404` unknown session; `400` the session has no credentials metadata or its first credential has no status list entry (mDoc, SD-JWT VC issued before token status lists) |

After a successful `POST /credentials/:id/revoke`, the service sends a [revocation notification v2](https://github.com/hyperledger/aries-rfcs/tree/main/features/0721-revocation-notification-v2) (`revocation_format: anoncreds`, `credential_id: <revocationRegistryDefinitionId>::<credentialRevocationId>`) over the credential's DIDComm connection, so a Credo-based wallet such as Heka Wallet marks its copy as revoked. This works for `anoncreds-indy` credentials only: for `anoncreds-w3c`, Credo's holder keeps the revocation ids in record metadata rather than in the tags it searches, so it can't match the notification and ignores it. This is best effort: the ledger update is already done, so if the record has no connection (connectionless issuance) nothing is sent, and if sending fails (connection removed, holder unreachable) the service logs a warning with the record and registry ids and still returns `200`. Verifiers rely on the ledger, not on the notification.

`DELETE /openid4vc/issuance-session/:id` returns `204`. The session is the only link to the token status list entries of its SD-JWT VCs, so a session the holder has started to redeem (any state after `OfferCreated` / `OfferUriRetrieved`, `Error` included) is deleted only after its credentials are revoked; otherwise it returns `409` and keeps the session. Pending offers and sessions of other formats are deleted in any case. An unknown session returns `404`.

`POST /openid4vc/issuance-session/:id/revoke` still returns `200` for `jwt_vc_json`, `jwt_vc_json-ld` and `ldp_vc` sessions, although their `revocable` is `false`: the issued credentials do not contain `credentialStatus`, so wallets and verifiers never read the bit it sets. Repeating it returns `200` again (no `409`).

To check that an `anoncreds-w3c` credential is not revoked, a DIDComm proof request in the `dif-presentation-exchange` format sets `statuses.active.directive: required` in the input descriptor's constraints, as the Heka web UI does. Credo then requires a non-revocation proof for every credential the holder selects, so a holder whose only matching credential comes from a credential definition without revocation support gets an error from its wallet ("Selected credentials must be revocable but are not") instead of "no matching credential". Credential definitions created through Heka always support revocation.

#### SD-JWT VC status

Every SD-JWT VC issued over OID4VCI carries an always-disclosed `status` claim ([IETF Token Status List](https://datatracker.ietf.org/doc/draft-ietf-oauth-status-list/)):

```json
"status": { "status_list": { "idx": 4711, "uri": "<APP_ENDPOINT>/token-status-lists/<id>" } }
```

- The offer reserves one random entry per credential the wallet may request in a batch, in a list of the key that signs the credential (the issuer DID's verification method). An offer whose `issuer.did` is not a DID of the caller's wallet is rejected with `422`. `status` is set by the issuer: an offer with `status` in `payload` or in `disclosureFrame._sd` is rejected with `400`.
- `GET /token-status-lists/:id` is public (no token). It returns the list as a compact JWS with `Content-Type: application/statuslist+jwt`, `Cache-Control: max-age=300` and `Vary: Accept`. The header is `{ typ: "statuslist+jwt", alg, kid: <issuer DID URL> }`; the payload has `iss` (the issuer DID), `sub` (the exact `uri` in the credentials), `iat`, `ttl: 300` and `status_list: { bits: 1, lst }`, and no `exp`. It is signed with the same key as the credentials, because Credo verifies a status list with the credential's issuer key. An `Accept` that does not admit `application/statuslist+jwt` (e.g. CWT only) gets `406`; no `Accept` or `*/*` gets the JWT. An unknown id gets `404`. Error responses are JSON and carry no `Cache-Control`.
- Lists belong to the wallet (tenant) holding the key, so any member of an organization wallet can revoke what another member issued.
- Wallets and verifiers fetch the list from `APP_ENDPOINT`, **also when a wallet receives the credential**: Credo-based wallets (Heka Wallet included) verify the status on receipt and reject the credential if the list cannot be fetched. With `APP_ENDPOINT=http://localhost:3000`, a phone cannot accept SD-JWT VCs; set `APP_ENDPOINT` to a URL the phone can reach (see [Local Configuration for Heka Wallet Integration](local-config-for-heka-wallet-integration.md)). Changing `APP_ENDPOINT` later strands the credentials issued before, as with tails files.
- Revoking does not change `exp` or caches: a wallet may keep a fetched list for up to `ttl` / `max-age` (5 minutes). The service's own verifier fetches the list on every presentation.
- If a DID update removes the key a list is signed with from the wallet, revoking the credentials of that list fails, because the list can no longer be re-signed.

## DID update and deactivation

A wallet can change or retire the DIDs it created (`POST /dids`), because it holds their keys. The routes are open to the roles that may create DIDs: Admin, OrgAdmin, Issuer and Verifier. A DID of another wallet, or any external DID, is `404`. A parent wallet has no authority over the DIDs of its children.

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

- `POST /dids/:did/deactivate` deactivates the DID and returns its document with `deactivated: true`. The Identity Service never reactivates a DID; whether the ledger makes deactivation final depends on the method (below). Deactivating a deactivated DID returns `200` again, without a ledger write. When the ledger write reports a failure, the ledger is read again: if it shows the DID deactivated (the write went through, but its response was lost), the result is `200` as well; otherwise the original error is returned. The keys stay in the wallet. Whether AnonCreds credentials issued with the DID stay revocable depends on the method (below).

| Method               | Update | Deactivate | Notes                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------- | ------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hedera`             | yes    | yes        | One HCS message per added or removed entry. The root key `#did-root-key` cannot be changed. A key referenced from a verification relationship cannot be removed (Hiero DID SDK 0.1.8 would leave a dangling reference), so only keys added with `"purposes": []` are removable.                                                                                        |
| `indybesu`           | yes    | yes        | The document is replaced in one transaction, sent by the DID's own account, or with `INDY_BESU_ENDORSE_DID_CHANGES=true` signed by it and submitted by the endorser ([setup](setup.md#ledger--did-methods)). The owner key `#KEY-1` cannot be changed. Service types are limited to `LinkedDomains`, `DIDCommMessaging`, `CredentialRegistry`, `OID4VCI` and `OID4VP`. |
| `key`                | no     | no         | Immutable: `422`.                                                                                                                                                                                                                                                                                                                                                      |
| `indy`               | yes    | yes        | The document beyond the DID's verkey is written as the NYM's `diddocContent` (did:indy spec), one transaction signed by the DID's own key, and also by the endorser with `INDY_ENDORSE_DID_CHANGES=true` ([setup](setup.md#ledger--did-methods)). `#verkey` cannot be changed. Deactivation sets the verkey to `null`; the DID then resolves with `deactivated: true`. |
| `jwk`, `peer`, `web` | no     | no         | No registrar: `400` (method not supported).                                                                                                                                                                                                                                                                                                                            |

`GET /dids/methods` reports the same per configured method in `capabilities` (`update`, `deactivate`, `controller`).

What deactivation means per method:

- **`hedera`:** final. AnonCreds credentials issued with the DID stay revocable: revocation is written with the root key, which the wallet keeps.
- **`indybesu`:** final, by the DID registry contract. The Identity Service does not support AnonCreds revocation on Indy-Besu.
- **`indy`:** **not final, and it ends revocation.**
  - The ledger refuses every transaction the DID authors once its verkey is `null`, including AnonCreds revocation entries. **Revoke what needs revoking before deactivating**; afterwards, credentials issued with the DID keep verifying as not revoked.
  - On Indy Node, a NYM whose verkey is `null` returns to its creator, its guardian: for DIDs created by the Identity Service, the platform endorser (`INDY_ENDORSER_SEED`). The guardian can assign a verkey again: the same one reactivates the DID with its last `diddocContent`, another one hands the DID over. The did:indy specification says a deactivated NYM "cannot be updated again"; Indy Node does not enforce that.

Errors: `400` for an invalid body or a method that is not configured, `403` for the shared Indy endorser DID or a role that may not change DIDs, `404` for a DID that is not the wallet's own, `409` for an update of a deactivated DID, `422` for an unsupported method or change (the key that controls the DID, an added id that exists with other content, an id both removed and added in one request, a removed id used by another kind of entry, an added id the ledger shows without a key in the wallet, and a `did:indy` document whose `diddocContent` would exceed the ledger's limit of 10240 characters), `503` while another request holds the wallet or when the DID's ledger cannot be read for an update. A failed ledger write is `500` with the ledger's reason; on Hedera, entries written before the failure stay on the ledger, and the wallet's DID record follows the ledger. Operations the ledger document already shows are skipped, so the same request can be retried: an added service with the same type and endpoint, an added verification method with the same id and purposes whose key the wallet holds, and a removed id the document does not use. A mistyped removed id is skipped as well, so check the returned document. An added verification method without an `id` is never skipped: every attempt generates a new key under the next free `#key-<n>`, so give additions an explicit `id` to retry them safely. When nothing is left, the current document is returned without a ledger write. When a failed write may still have reached the ledger (a Hedera message, an Indy-Besu transaction or an Indy NYM was sent and not refused), the keys generated for it stay in the wallet. Should such an addition land later, the ledger shows a verification method the wallet holds no key for: it is never used for signing, a retry with its id is refused (`422`), and the key can be added again under another id. On `did:hedera` such a verification method cannot be removed either (Credo requires the wallet's key for every entry an update changes, so the update fails with `500`): it stays in the document, and its key in the wallet.

Removing a verification method also deletes its private key from the wallet, after the ledger write succeeded. When the update fails, the ledger is read once more: a verification method requested for removal that the ledger no longer shows is removed from the wallet's DID record and its private key is deleted, and the update still returns its error. When the ledger does not show the removal yet, or cannot be read, the key is kept; should the removal land later, a retry of the removal succeeds without a ledger write and deletes the key then. Every update and deactivation first brings the wallet's DID record in line with the ledger document; a verification method removed outside the Identity Service keeps its key in the wallet. The key that controls the DID, and a key another verification method still uses, are never deleted.

OpenID4VC issuance signs a credential with the first verification method of the issuer DID that is an `assertionMethod` (for JWT VC and JSON-LD VC formats, also an `authentication`), and an OpenID4VP request with the first `authentication` one, among the keys the wallet can sign with. The DID is read from its ledger once per offer or request, uncached (when the ledger cannot be read, the wallet's copy is used), and a key qualifies only when the ledger, the wallet's record of the DID and the wallet's key have the same public key: a key added outside the Identity Service, replaced on the ledger, or one that landed after its update failed is not used. Without such a key the offer or request is rejected with `422`, which names the reason. The own key of a `did:key`, `did:hedera` and `did:indybesu` qualifies. The `did:indy` `#verkey` is `authentication` only (did:indy spec), so a `did:indy` issuer first adds a key with `assertionMethod` (the default purposes of `addVerificationMethods`) and then signs with it. To sign with another key, an offer names it in `issuer.keyId` and a verification request in `requestSigner.keyId` (relative, e.g. `"#key-2"`); that key must be referenced from the same purposes, or the offer is rejected with `422`.

After deactivation the DID is no longer used by the Identity Service: `GET /dids?own=true` leaves it out (unless `includeDeactivated=true`, which lists it with `deactivated: true`), `POST /prepare-wallet` creates a new DID of the method, it is not the controller of new DIDs, and AnonCreds schema and credential definition registrations (`POST /schemas`, `POST /credential-definitions`, `POST /v2/schemas/:id/registration`) and new OID4VC issuance offers or verification requests with it are rejected with `422`. Registrations check the DID's ledger as well as the wallet, so a DID deactivated on its ledger but not recorded as such in the wallet is rejected too (and recorded); when the ledger cannot be read, the wallet's record decides. Revocation registries and status lists of credentials issued before stay available (a deactivated `did:indy` can no longer revoke, see above). `GET /dids/:did` returns it with `deactivated: true`. Its existing OID4VC issuer and verifier records are kept.

On Hedera an update runs in up to two steps, additions and then removals, and each waits up to 2 minutes until all its messages are visible on the mirror node; allow for it in client and proxy timeouts. A `500` after about 2 minutes can mean the write landed; the request can be retried. With several Identity Service instances, the other instances may serve the previous did:hedera document from their resolver cache for up to 5 minutes.

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

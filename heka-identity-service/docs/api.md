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

## Notifications

Many API methods initiate asynchronous processes. The Identity Service emits notification events so clients can track state changes without polling. Subscribe via a webhook URL or a WebSocket connection through the `/user` endpoint — pick whichever suits your client.

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

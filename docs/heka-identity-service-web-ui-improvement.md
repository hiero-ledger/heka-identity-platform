# Heka Identity Service Web UI improvements

Status: plan, 2026-10-02. Parts 1 and 2 implemented on 2026-10-02 (manual verification pending for both); Part 3 not started. Progress is tracked in the Status columns of section 8 (Part 1), section 16 (Part 2) and section 25 (Part 3).

This plan has three independent parts. Each has its own steps and PRs, none depends on another, and they can be built in any order or in parallel.

| Part | Improvement | Packages touched |
|---|---|---|
| 1 (sections 1 to 9) | Reuse DIDComm connections: pick an existing connection, name new ones | web UI only |
| 2 (sections 10 to 17) | Use WebSockets instead of polling for credential offer and presentation request status | identity service and web UI |
| 3 (sections 18 to 26) | Show a presentation request declined in the wallet as declined, for Aries and OID4VP | wallet, identity service and web UI |

Overlaps are small and in different places of the same files. `PendingCredential.tsx` and `PendingPresentation.tsx`: Part 1 adds the connection panels to the rendered output, Part 2 replaces the polling effect. `AnoncredsVerificationRequest.tsx`, `OpenIdVerificationRequest.tsx` and the presentation selectors: Part 3 adds a declined branch next to the completed one. Whichever part merges later rebases over a small conflict. If Part 2 merges before Part 3, Part 3 must also pass its new "failed" flag to `useRecordUpdates` as part of `isDone` (section 22.3).

# Part 1: Reuse DIDComm connections

## 1. Goal

When an operator issues an Aries (AnonCreds) credential or requests an Aries proof, they can send it over a DIDComm connection the tenant already has, instead of always showing a new QR code.

Today every Aries flow creates a new single-use invitation and a new connection:

- `useConnection` dispatches `createConnection()` on mount (`src/shared/hooks/connection.ts`), which posts `connections/create-invitation` with `multiUseInvitation: false`.
- The hook polls `GET connections/:id` until the state is `completed`, then calls `onComplete(connectionId)`, which sends the offer (`AnoncredsCredentialOffer.tsx`) or the proof request (`AnoncredsVerificationRequest.tsx`).
- The connection slice is reset when the flow ends (`useFlow`, `useAppState`), so nothing carries over.

The result is one connection per interaction, a growing list of duplicate contacts in the holder's wallet, and no way for the issuer to reach a holder who is not in front of the screen.

This plan covers "Option A": the operator picks an existing connection from a list. To make that list readable, the operator can also give a new connection a name when showing the QR code. Automatic reuse when the same wallet scans again (Aries RFC 0434 handshake-reuse, "Option B") is out of scope; see section 9.

## 2. Decisions

1. **Web UI only.** The identity service already has everything needed: `GET /connections` returns `ConnectionRecordDto[]` for the tenant, and `POST /credentials/offer` and `POST /proofs/request` take any `connectionId`. No backend change is required.
2. **The choice lives inside the Aries offer and request steps, not in a new wizard step.** `CredentialOffer` and `VerificationRequest` are rendered from four places: the wizards (`IssueCredential`, `VerifyCredential`), the template routes (`ROUTES.CREDENTIAL_OFFER`, `ROUTES.VERIFICATION_REQUEST`), `Demo` and `AgeVerificationDemo`. Putting the selector in the shared step component covers all of them with one change and leaves the step configs (`*.config.tsx`) and step counts untouched.
3. **The QR code stays the default.** The step keeps showing the new invitation exactly as today. A secondary "Send to an existing connection" panel sits next to it. An operator who ignores it gets today's behaviour.
4. **Choosing an existing connection reuses the existing completion path.** A new slice action marks the session as `completed` with the chosen `connectionId`. The completion effect already in `useConnection` then calls `onComplete(connectionId)`, so the offer and proof code does not change.
5. **The invitation is still created on mount.** Creating it lazily would make the QR appear late in the default path. An unused single-use invitation is harmless; the same happens today whenever the operator leaves the step without scanning.
6. **Only `completed` connections are listed**, newest first, labelled as described in decision 9. Connections in other states cannot carry messages.
7. **Connections are read from the same tenant the offer goes to.** Offers and proof requests use `agencyDemoApi` when `useDemo` is set, but `createConnection` and `updateConnectionState` always use `agencyApi`. Connections belong to a tenant, so listing (and, for consistency, creating and polling) must use the same instance as the offer. This also removes a latent mismatch in the current code.
8. **OpenID4VC flows are untouched.** OID4VCI and OID4VP have no DIDComm connection.
9. **Connection names come from the operator, set as the invitation's `alias`.** The holder-side name is useless: the Heka wallet connects through Bifold's `connectFromInvitation`, which hardcodes the label `didcomm-oob-invitation`, so `theirLabel` is the same for every connection. Instead the step gets an optional "Connection name" field. Its value is sent as `alias` to `POST connections/create-invitation`, which already accepts it (`CreateInvitationRequestDto.alias`). Credo copies the invitation's alias onto the connection when the wallet connects (`DidExchangeProtocol`, `alias: outOfBandRecord.alias`), so `GET /connections` returns it with no backend change. The list label is `alias`, or "Unnamed connection" plus the first 8 characters of the id when there is none, followed by the creation date. `theirLabel` is never shown.
10. **Naming creates a new invitation.** The alias is fixed when the invitation is created, and decision 5 creates the first invitation, without a name, when the step opens. When the operator applies a name, the UI creates a second invitation with that alias and replaces the QR code. The field is locked once a wallet has started connecting to the current invitation (state no longer `start`), because a new invitation at that point would leave the UI polling an invitation nobody scanned. Renaming a connection after it exists needs a backend endpoint and stays a follow-up (section 9).

## 3. User flow

```
Aries offer / request step
+--------------------------------------------+------------------------------------------+
| Scan QR code with your mobile wallet or    | Send to an existing connection           |
| [copy link]                                | [ Alice Smith          02 Oct 14:05 v ]  |
|                                            | [ Send ]                                 |
| Connection name (optional)                 |                                          |
| [ Alice Smith            ] [ Apply ]       | (hidden when there are none)             |
|                                            |                                          |
|              [  QR CODE  ]                 |                                          |
+--------------------------------------------+------------------------------------------+

Dropdown entries:
  Alice Smith                    02 Oct 14:05
  Front desk tablet              01 Oct 17:12
  Unnamed connection (3f9a1c2e)  30 Sep 09:41
```

1. The step opens. The invitation is created and the QR is shown as today. In parallel the list of `completed` connections is loaded.
2. Optionally, the operator types a connection name and presses Apply (or Enter). A new invitation with that alias replaces the QR code. The field is disabled while the invitation is loading and once a wallet has started connecting.
3. The holder scans. The resulting connection carries the name and shows up under it in later flows.
4. If the list of existing connections is empty, the right-hand panel is not rendered.
5. Alternatively the operator picks an existing connection and presses Send. The QR column is replaced by the usual "waiting" state; the offer or proof request goes to that connection.
6. From here the flow is the same as after a scan: `PendingCredential` / `PendingPresentation` poll the record state and show `CredentialSent` / the result.
7. The waiting state gets a "Use QR code instead" link. If the holder deleted the connection or reinstalled the wallet, the message is never answered and the operator needs a way back.

## 4. Changes by file

All paths are under `heka-identity-service-web-ui/src`.

### 4.1 API and types

| File | Change |
|---|---|
| `shared/api/config/endpoints.ts` | Add `getConnections: 'connections'`. |
| `entities/Connection/model/types/connection.ts` | Add `ConnectionRecord` (`id`, `state`, `role`, `theirLabel?`, `alias?`, `createdAt`). Add `connections: ConnectionRecord[]` and `isConnectionsLoading: boolean` to `ConnectionSchema`. |

### 4.2 Services (thunks)

| File | Change |
|---|---|
| `entities/Connection/model/services/fetchConnections.ts` (new) | `createAsyncThunk('connections/list', { useDemo?: boolean })`. Calls `GET connections` on `useDemo ? extra.agencyDemoApi : extra.agencyApi`, keeps `state === ConnectionState.Completed`, sorts by `createdAt` descending. Errors go through `handleError` like the other thunks. |
| `entities/Connection/model/services/createConnection.ts` | Accept `{ useDemo?: boolean; alias?: string }`. Pick the API instance the same way (decision 7). Send `alias` in the request body when it is non-empty after trimming. |
| `entities/Connection/model/services/updateConnectionState.ts` | Add `useDemo?` to the params and pick the API instance the same way. |

### 4.3 Slice and selectors

| File | Change |
|---|---|
| `entities/Connection/model/slices/connectionSlice.ts` | Add reducers for `fetchConnections` pending/fulfilled/rejected. Add the action `selectExistingConnection(connectionId)` that sets `connectionSession = { oobId: '', connectionId, invitationUrl: '', state: Completed }`. In `createConnection.fulfilled`, do not overwrite a session that is already `completed`, in case the invitation response arrives after the operator chose a connection. `reset` also clears `connections`. |
| `entities/Connection/model/selectors/connectionSelector.ts` | Add `getConnections` and `getIsConnectionsLoading`. |
| `entities/Connection/index.ts` | Export the new thunk, action, selectors and type. |

### 4.4 Hook

`shared/hooks/connection.ts`:

- Accept `useDemo?: boolean` in `UseConnectionParams` and pass it to `createConnection`, `updateConnectionState` and `fetchConnections`.
- On mount, dispatch `fetchConnections({ useDemo })` next to `createConnection`.
- Return `connections`, `isConnectionsLoading`, `selectConnection(id)` (dispatches `selectExistingConnection`) and `restartWithQr()` (dispatches `reset`, then `createConnection`, then `fetchConnections`).
- Return `connectionAlias` (the alias of the current invitation, kept in hook state), `canRename` (`true` while the invitation is loaded and the state is still `start`), and `renameInvitation(alias)`. `renameInvitation` does nothing when `canRename` is false or the trimmed alias equals the current one; otherwise it dispatches `createConnection({ useDemo, alias })`, which replaces the session and the QR code. Polling switches to the new invitation's id because it reads the id from the session.
- `restartWithQr()` keeps the current alias, so returning to the QR after a failed send does not lose the name.
- The existing effects stay. Polling stops on its own because the state is `completed`, and the completion effect calls `onComplete(connectionId)`.

### 4.5 UI

| File | Change |
|---|---|
| `components/ExistingConnection/ExistingConnectionSelect.tsx` (new) | Panel with a title, a `FormSelect`/`Select` from `shared/ui` listing the connections, and a `Button` "Send". Props: `connections`, `isLoading`, `onSelect(id)`. Renders nothing when the list is empty and loading is done. Label per decision 9: `alias`, otherwise "Unnamed connection (`id.slice(0, 8)`)", plus the formatted `createdAt`. Never `theirLabel`. |
| `components/ExistingConnection/ConnectionNameInput.tsx` (new) | Optional `TextInput` from `shared/ui` with an Apply `Button`, placed above the QR. Props: `value`, `disabled`, `onApply(alias)`. Applies on button click or Enter. Trims the value and limits it to 64 characters. Shows a short hint that the name is only visible to the tenant. |
| `components/ExistingConnection/ConnectionChoice.tsx` (new) | Composes the name input, the QR code and the existing-connection panel, and renders the waiting view with "Use QR code instead" once a connection was chosen. Shared by `PendingCredential` and `PendingPresentation` through an optional `connection` prop, so the OpenID4VC flows, which don't pass it, render exactly as before. |
| `components/ExistingConnection/connectionLabel.ts` (new) | `getConnectionLabel(record, t)` implementing the label rule, so the select and any later Connections page share it. |
| `components/ExistingConnection/ExistingConnectionSelect.module.scss` (new) | Layout for the second column. Stack the columns below the QR at narrow widths. |
| `components/Steps/CredentialOffer/states/PendingCredential.tsx` | Accept optional `existingConnection` and `connectionName` props. For Aries, render `ConnectionNameInput` above the QR and the existing-connection panel next to it. When a connection was chosen, show the loader and "Waiting for the holder to accept the offer" instead of the QR, plus the "Use QR code instead" link. |
| `components/Steps/CredentialOffer/protocols/AnoncredsCredentialOffer.tsx` | Pass `useDemo` to `useConnection` and wire `connections`, `selectConnection`, `restartWithQr`, `connectionAlias`, `canRename` and `renameInvitation` into `PendingCredential`. |
| `components/Steps/VerificationRequest/states/PendingPresentation.tsx` | Same as `PendingCredential`. |
| `components/Steps/VerificationRequest/protocols/AnoncredsVerificationRequest.tsx` | Same as `AnoncredsCredentialOffer`. |
| `translations/en.ts` | New keys under a `Connection` section: panel title, select placeholder, Send, empty-state text (if shown), waiting text for offer and request, "Use QR code instead", "Connection name (optional)", name placeholder, Apply, name hint, "Unnamed connection ({{id}})". |

`restartWithQr` must also reset the credential or presentation slice, since an offer may already have been sent on the abandoned connection. The step component calls the matching `reset` from `useCredentialActions` / `usePresentationActions` before `restartWithQr`.

## 5. Edge cases

| Case | Handling |
|---|---|
| Tenant has no completed connections | Panel hidden; behaviour identical to today. |
| Holder deleted the connection or reinstalled the wallet | Credo still sends the message; it is never answered and the record stays in `offer-sent` / `request-sent`. The waiting view shows "Use QR code instead". No automatic timeout in this iteration. |
| Holder scans the QR while the operator is choosing | Whichever reaches `completed` first wins. The slice guard (4.3) stops a late invitation response from overwriting a chosen connection. If the scan completes first, the completion effect fires and the panel disappears with the QR. |
| Holder scans the unnamed QR just before the operator applies a name | Applying is blocked once the state leaves `start`, so the UI keeps following the scanned invitation. The connection stays unnamed. If the scan lands between the Apply click and the new QR appearing, the UI follows the new invitation and the scanned one completes unseen; the operator sees no progress and uses a fresh scan. Rare, and no data is lost. |
| Operator never names connections | Entries show "Unnamed connection (id)" plus the date. Same for every connection created before this change. |
| Same name used twice | Allowed; the date tells them apart. No uniqueness check. |
| Name contains personal data | The alias is stored only in the tenant's agent and is not sent to the wallet. The hint under the field says it is only visible to the tenant. |
| `fetchConnections` fails | Show a toast through `handleError` as other thunks do; the QR path keeps working. |
| Many connections | `GET /connections` is unpaginated. Acceptable for demo and pilot tenants. A search box or server-side paging is a follow-up (section 9). |
| Role restrictions | `GET /connections` has no `@Roles` restriction; anyone who can reach the offer step can list connections. No change needed. |
| Verify-once connections | The wallet deletes a connection after a proof request whose OOB goal code ends in `verify.once`. The identity service does not set a goal code today, so this does not apply. Keep in mind if goal codes are added later. |

## 6. Tests

Jest is already configured (`yarn test:unit`); `entities/Presentation/model/services/requestPresentation.test.ts` is the pattern for thunk tests with a mocked Axios instance.

1. `entities/Connection/model/services/connectionThunks.test.ts`, `fetchConnections`: filters out non-`completed` records, sorts newest first, uses `agencyDemoApi` when `useDemo` is true, rejects through `handleError` on failure.
2. `connectionSlice.test.ts`: `selectExistingConnection` produces a `completed` session; a later `createConnection.fulfilled` does not overwrite it; `reset` clears `connections`. Polling results for a replaced invitation are ignored.
3. `connectionThunks.test.ts`, `createConnection` / `updateConnectionState`: pick the demo API instance when `useDemo` is set. `createConnection` sends a trimmed `alias` and omits it when empty.
4. `connectionLabel.test.ts`: uses `alias` when present; falls back to "Unnamed connection (id prefix)"; never returns `theirLabel`.
5. `ExistingConnectionSelect` and `ConnectionNameInput` (React Testing Library; `Button` and `Select` are replaced by plain stand-ins because their SVG imports do not load in jest): select is hidden on an empty list and calls `onSelect` with the chosen id; name input calls `onApply` with the trimmed value and does nothing while disabled.

## 7. Manual verification

1. Start the platform (root `docker compose up`, see `docs/root-docker-compose.md`) and log in to the web UI.
2. Issue an AnonCreds credential to the Heka wallet. Before scanning, enter "Alice Smith" as the connection name and press Apply; confirm the QR code changes. Scan it. The wallet shows one contact.
3. Start a second issuance. The panel lists "Alice Smith" with today's date. Choose it and press Send. The offer arrives in the wallet without scanning, in the same contact's chat, and no new contact appears. Accept it; the UI reaches "Credential sent".
4. Start an AnonCreds verification, choose the same connection, and confirm the proof request arrives and the result is shown.
5. Delete the contact in the wallet, then send to it again from the UI. Confirm the waiting view stays and "Use QR code instead" brings back a fresh QR that works.
6. Scan a QR without naming it. Confirm the next flow lists it as "Unnamed connection (…)". Start scanning a QR and confirm the name field locks once the wallet starts connecting.
7. Check `GET /connections` in Swagger: the named connection has `alias: "Alice Smith"`.
8. Run the Demo page's Aries flow (if configured) and confirm the list comes from the demo tenant.
9. Run an OpenID4VC issuance and verification and confirm nothing changed.

## 8. Steps

| # | Step | Status |
|---|---|---|
| 1 | Endpoint, types, `fetchConnections` thunk, `useDemo` on `createConnection` / `updateConnectionState`, `alias` on `createConnection` | done |
| 2 | Slice: list reducers, `selectExistingConnection`, completion guard, selectors, exports | done |
| 3 | `useConnection` changes, including `renameInvitation` and `canRename` | done |
| 4 | `ExistingConnectionSelect`, `ConnectionNameInput`, `getConnectionLabel` and translations | done |
| 5 | Wire into `PendingCredential` / `AnoncredsCredentialOffer` | done |
| 6 | Wire into `PendingPresentation` / `AnoncredsVerificationRequest` | done |
| 7 | Unit tests (section 6) | done |
| 8 | Manual verification (section 7). Lint, Stylelint, type-check and the full unit suite pass | manual verification todo |

Steps 1 to 3 are one PR without visible change; steps 4 to 8 are a second PR. A single PR is also fine given the size.

## 9. Out of scope and follow-ups

- **Automatic reuse on scan (Option B, RFC 0434 handshake-reuse).** Needs a stable `invitationDid` on invitations, a `DidCommHandshakeReused` listener and a fixed `connections/:id` lookup in the identity service, plus `enableReuseConnections: true` in the wallet config. Option A does not block it; both can coexist.
- **A Connections page.** List, rename and delete connections. Renaming after the connection exists (including naming the connections created before this change) needs `PATCH /connections/:id` in the identity service, which updates `alias` through the Credo connection repository; deleting needs `DELETE /connections/:id`.
- **Deriving names automatically** from credentials issued over a connection (`GET /credentials` returns `connectionId` and `credentialAttributes`). Not planned; it shows personal data in the picker and does not cover verification-only connections.
- **A meaningful holder-side label** from the wallet instead of Bifold's hardcoded `didcomm-oob-invitation`. Not planned; it needs a Bifold patch and would send the holder's name to every issuer and verifier.
- **Searching or paging the connection list** once tenants have many connections.
- **Timeout for unanswered offers** sent to a stale connection.
- **Push updates for the connection state** (`useConnection` polling) belong to Part 2's follow-ups (section 17), not here.

# Part 2: WebSockets instead of polling

## 10. Goal

The web UI learns about credential offer and presentation request progress from server pushes instead of asking every 2 seconds.

Today three places poll with `setInterval(..., pollTimeout)` (`const/behaviour.ts`, 2000 ms):

| Place | Polls | Endpoint |
|---|---|---|
| `components/Steps/CredentialOffer/states/PendingCredential.tsx` | `updateCredentialState` | `GET credentials/:id` (Aries) or `GET openid4vc/issuance-session/:id` (OID4VCI) |
| `components/Steps/VerificationRequest/states/PendingPresentation.tsx` | `updatePresentationState` | `GET proofs/:id` (Aries) or `GET openid4vc/verification-session/:id` (OID4VP) |
| `shared/hooks/connection.ts` | `updateConnectionState` | `GET connections/:id` (out of scope, see section 17) |

Each open step sends 30 requests a minute even when nothing happens, and the UI notices a change up to 2 seconds late.

Part 2 covers the first two rows, for both Aries and OpenID4VC.

## 11. What already exists

The identity service already pushes these events over a WebSocket. The UI just doesn't use it.

- **Events.** `common/notification/notification-events.listener.ts` subscribes to the agent's DIDComm connection, credential and proof events and the OpenID4VC issuer and verifier events. It maps each one to a DTO (`common/notification/dto`) and sends it to every user linked to the tenant's wallet.
- **Gateway.** `common/notification/notification.gateway.ts` is a `@WebSocketGateway({ path: 'notifications' })` on the main HTTP server (`app.starter.ts` installs `WsAdapter`), so the URL is `ws://<identity service>:3000/notifications`. This is unrelated to the DIDComm WebSocket transport on port 3002.
- **Delivery.** `NotificationService` sends to the user's WebSocket unless the user's `messageDeliveryType` is `WebHook`. `GET /user` returns `messageDeliveryType`.
- **Payloads.** Credential and proof events carry `{ id, type, state, details }`, where `id` is the exchange record id the UI already holds. OpenID4VC events carry the whole session record as `issuanceSession` / `verificationSession`, whose `id` is the session id the UI holds.

### Gaps that block browser use

1. **Authentication only reads the `Authorization` header** (`AuthService.validateRequestToken` uses `extractTokenFromHeader`). The browser `WebSocket` API cannot set headers, so a browser cannot connect today.
2. **One socket per user.** `connectedSockets` is a `Map<userId, WebSocket>`. A second tab replaces the first, and closing the old tab deletes the new tab's entry, because `onclose` deletes by user id.
3. **No socket is an error.** `send` throws "Recipient socket is not connected", which `trySendNotification` logs at error level for every event of every user who has no UI open.
4. **The token is checked only on connect.** The socket outlives the access token.

## 12. Decisions

1. **The push is a trigger; the existing GET stays the source of truth.** On a matching event the UI dispatches the same `updateCredentialState` / `updatePresentationState` thunk it polls with today, once. The reducers, the result screens and the response types don't change, and the UI doesn't depend on the notification DTOs beyond `type`, the record id and `state`. This matters most for OpenID4VC, whose events carry the raw session record.
2. **Polling stays as a fallback, never removed.** The hook uses fast polling (the current 2 s) whenever push cannot be relied on: socket not open, user's `messageDeliveryType` is `WebHook`, or a demo flow (decision 4). While the socket is open it keeps a slow safety poll (15 s) to cover a missed event or a reconnect gap. On every (re)connect it refreshes once, because events sent while disconnected are lost.
3. **Token in the WebSocket subprotocol, not the query string.** The browser opens `new WebSocket(url, ['heka.bearer', token])`. The gateway reads the token from `Sec-WebSocket-Protocol` and answers with `heka.bearer` as the selected protocol. A query parameter would put the token into proxy and access logs. The `Authorization` header keeps working for non-browser clients.
4. **Demo flows keep polling.** Demo pages use the demo-token broker's shared identity (`demoApi.ts`). Events for the demo tenant would go to every visitor connected with that identity, which leaks other visitors' activity, and the single-socket map would make delivery random. `useDemo` therefore disables push.
5. **One socket per browser tab, shared by all steps.** A module-level client opens the socket after sign-in and closes it on sign-out. Steps subscribe and unsubscribe; they never open their own socket.
6. **The server closes the socket when the token expires.** The gateway schedules a close at the token's `exp` with a dedicated close code. The client then gets a fresh token from the session (`refreshSessionToken`) and reconnects.
7. **Single identity service instance assumed.** Sockets live in process memory. Several instances behind a load balancer would need a shared pub/sub (for example Redis) and are out of scope; the polling fallback keeps the UI correct regardless.

## 13. Changes by file

### 13.1 Identity service (`heka-identity-service/src`)

| File | Change |
|---|---|
| `common/auth/auth.service.ts` | Add `validateWebSocketToken(request)`: take the token from `Sec-WebSocket-Protocol` (second entry after `heka.bearer`), falling back to the `Authorization` header. Return `AuthInfo` plus the token's `exp`. Keep `validateRequestToken` unchanged. |
| `common/notification/notification.gateway.ts` | Use `validateWebSocketToken`. Select the `heka.bearer` subprotocol in the handshake (`handleProtocols` on the `ws` server; confirm that `WsAdapter` forwards the option from `@WebSocketGateway`, otherwise set it on a custom adapter). Store `Map<userId, Set<WebSocket>>` and remove only the closing socket. Schedule a close at `exp` (close code `4001`, reason "Token expired") and clear the timer on close. `send` writes to every socket of the user and does nothing, with a debug log, when there are none. Stop logging the whole `IncomingMessage` at trace level, since it now carries the token. |
| `common/notification/notification.service.ts` | No functional change; `send` no longer throws when the user has no socket, so "Notification delivery failed" stops appearing for offline users. |
| `common/notification/notification-events.listener.ts` | Verify that OpenID4VC issuer and verifier events from tenant agents reach the root agent's event emitter with a `tenant-` correlation id, as DIDComm events do. Fix if not; the UI falls back to polling either way. |
| `common/notification/__tests__/notification.gateway.test.ts` (new) | Subprotocol auth accepted and echoed; missing or invalid token closes with `3000`; two sockets for one user both receive; closing one keeps the other; expiry closes with `4001`; `send` without sockets does not throw. |

No new configuration and no change to the REST API.

### 13.2 Web UI (`heka-identity-service-web-ui/src`)

| File | Change |
|---|---|
| `shared/lib/notifications/types.ts` (new) | `NotificationMessage` union covering only what the UI reads: `type`, `state`, and the record id (`id` for DIDComm, `issuanceSession.id` / `verificationSession.id` for OpenID4VC). `getRecordId(message)` helper. |
| `shared/lib/notifications/notificationClient.ts` (new) | Module-level client. `connect()`, `disconnect()`, `subscribe(listener) => unsubscribe`, `onStatusChange`. URL derived from `REACT_APP_AGENCY_ENDPOINT` (`http` to `ws`, `https` to `wss`, path `/notifications`); no new environment variable. Token from `getSessionAccessToken()`. Falls back to the page origin when `REACT_APP_AGENCY_ENDPOINT` is empty. Reconnects with backoff (1 s, doubling, capped at 30 s). On close code `4001` or `3000` it calls `refreshSessionToken()` first and stops if there is no session. Parses messages defensively and ignores unknown types. |
| `shared/lib/notifications/NotificationsConnector.tsx` (new), rendered in `app/App.tsx` | Calls `connect()` while `getUserIsSignedIn` is true and `disconnect()` when it turns false or on unmount. |
| `entities/User` | No change: `getAgencyUser` already loads `messageDeliveryType` from `GET /user` into the user slice. Add a selector for it if none exists, so the hook can tell whether pushes will arrive. |
| `shared/hooks/recordUpdates.ts` (new) | `useRecordUpdates({ recordId, isDone, refresh, useDemo })`. Subscribes to the client and calls `refresh()` when a message for `recordId` arrives. Runs a fallback interval: 2 s if `useDemo`, the socket is not open, or `messageDeliveryType === 'WebHook'`; 15 s otherwise. Calls `refresh()` once on every switch to "open". Stops everything when `isDone` is true. |
| `const/behaviour.ts` | Add `safetyPollTimeout = 15000` next to `pollTimeout`. |
| `components/Steps/CredentialOffer/states/PendingCredential.tsx` | Replace the `setInterval` effect with `useRecordUpdates({ recordId: credentialOfferId, isDone: isCredentialSent, refresh: () => dispatch(updateCredentialState(...)), useDemo })`. |
| `components/Steps/VerificationRequest/states/PendingPresentation.tsx` | Same, with `presentationRequestId`, `isPresentationCompleted` and `updatePresentationState`. |

## 14. Edge cases

| Case | Handling |
|---|---|
| Socket cannot connect (proxy without upgrade support, network) | Status never becomes "open"; the hook keeps 2 s polling. Behaviour identical to today. |
| Event arrives before the UI knows the record id | Possible when the wallet answers very fast after `offerCredential` returns. The refresh on mount of the hook and the safety poll catch it; no event buffering. |
| Socket drops mid-flow | Hook switches to 2 s polling until reconnected, then refreshes once. |
| User has `messageDeliveryType = WebHook` | No pushes reach the browser; the hook polls at 2 s as today. |
| Two tabs, same user | Both sockets receive every event; each tab only reacts to its own record id. |
| Several users linked to one tenant wallet | Each receives the tenant's events, as the listener already does. A tab ignores ids it does not hold. |
| Access token renewed while the socket is open | Nothing happens until the old token's `exp`; the server closes with `4001` and the client reconnects with the renewed token. |
| Reverse proxy in front of the identity service | Must forward `Upgrade`/`Connection` headers for `/notifications`. The root Docker Compose exposes the service directly, so it needs nothing. Document for deployments. |
| Several identity service instances | Not supported for push (decision 7); polling fallback keeps the UI correct with up to 15 s latency. |

## 15. Tests and manual verification

Unit tests:

1. Identity service: `notification.gateway.test.ts` (section 13.1) and an `auth.service` test for subprotocol token extraction.
2. Web UI `notificationClient.test.ts` with a mock `WebSocket`: builds the `ws`/`wss` URL, sends the subprotocol, reconnects with backoff, refreshes the token on `4001`, delivers parsed messages to subscribers, ignores malformed ones.
3. Web UI `recordUpdates.test.tsx` with fake timers: refresh on matching event only; 2 s interval when closed, demo or WebHook; 15 s when open; one refresh on reconnect; nothing after `isDone`.

Manual:

1. Start the platform, sign in, open the browser dev tools Network tab (WS filter). One socket to `/notifications` opens after sign-in, with `heka.bearer` as the selected protocol.
2. Issue an AnonCreds credential. While waiting, the Network tab shows no `GET credentials/:id` every 2 s, only one every 15 s. Accepting in the wallet updates the UI within about a second.
3. Repeat for an AnonCreds proof request, an OID4VCI offer and an OID4VP request.
4. Stop the identity service briefly during a pending offer. The UI falls back to 2 s polling and reconnects when the service is back.
5. Open a second tab, run a flow in each, close one tab: the other keeps receiving.
6. Run the public Demo and Age Verification pages: no socket is opened by them, and they poll as before.
7. Set the user's `messageDeliveryType` to `WebHook` via `PATCH /user`: the UI polls at 2 s and still completes.
8. Identity service logs show no "Notification delivery failed" errors for users without an open UI.

## 16. Steps

| # | Step | Status |
|---|---|---|
| 1 | Identity service: subprotocol auth, multi-socket map, expiry close, silent `send`, trace log fix, tests | done |
| 2 | Identity service: verify OpenID4VC events reach the listener for tenant agents; fix if needed | done: verified by code, no fix needed (tenant agents use a child container of the root, so they share its `EventEmitter`) |
| 3 | Web UI: notification types and client, connect/disconnect with the session, tests | done |
| 4 | Web UI: `messageDeliveryType` selector for the hook | done |
| 5 | Web UI: `useRecordUpdates` hook and tests | done |
| 6 | Web UI: switch `PendingCredential` and `PendingPresentation` to the hook | done |
| 7 | Manual verification (section 15). Lint, type-check and both unit suites pass (identity service 543, web UI 96) | manual verification todo |

Steps 1 and 2 are one identity service PR and must merge first, since a browser cannot authenticate to the gateway before it. Steps 3 to 7 are one web UI PR. The UI PR is safe to deploy against an older identity service: the socket fails to authenticate and the hook keeps polling at 2 s.

## 17. Out of scope and follow-ups

- **Connection state pushes.** `useConnection` (Part 1's hook) still polls `GET connections/:id`. `ConnectionStateChangeDto` is already sent; switching that hook to `useRecordUpdates` is a small follow-up once both parts are merged. The event carries the connection id while the UI holds the out-of-band id until the connection exists, so matching needs the connection's `outOfBandId` in the DTO.
- **Push for demo pages**, which needs per-visitor identities or per-session channels instead of the shared demo identity.
- **Horizontal scaling** of the gateway with a shared pub/sub.
- **Slimmer OpenID4VC notification DTOs.** They serialize the whole session record, which is large and can contain presentation data. Sending only `id`, `state` and `previousState` would be enough for the UI.

# Part 3: Presentation request decline from the wallet

## 18. Goal

When the holder declines a presentation request in the wallet, the verifier's web UI stops waiting and shows that the request was declined. This works for Aries (DIDComm present-proof) and, as far as the protocol allows, for OID4VP.

## 19. Current behaviour

What happens today when the holder presses Decline, per protocol and wallet screen:

| Path | Wallet | Identity service | Web UI |
|---|---|---|---|
| Aries, full request screen (`heka-wallet/app/src/screens/AriesPresentationRequest.tsx`) | `declineRequest({ sendProblemReport: true })`: sends a present-proof problem report ("Request declined") | Credo's `processProblemReport` sets the proof record to `abandoned` with `errorMessage` `"<code>: Request declined"`. `ProofRecordDto` (`proof/dto/proof-record.dto.ts`) does not expose `errorMessage`. | Keeps polling forever and keeps showing the QR code. `abandoned` is in the enum but no code handles it. |
| Aries, Home notification card (`heka-wallet/app/src/components/cards/NotificationCard.tsx`, `onProofRequestDecline`) | `declineRequest` without `sendProblemReport`: only the wallet's own record becomes `declined`; nothing is sent | Record stays `request-sent` | Polls forever. |
| OID4VP, same-device or QR (`heka-wallet/app/src/screens/OpenIdPresentationRequest.tsx`) | `onDecline` only navigates home; nothing is sent | Session stays `RequestUriRetrieved` until it expires | Polls forever. `OpenIdPresentationState.Error` exists but is not handled. |
| OID4VP over the Digital Credentials API (`DcApiPresentation.tsx`) | The browser call is rejected | n/a, nothing reaches the service | Already shows "cancelled" (`PresentationOptions.errors.cancelled`). No change needed. |

### OID4VP API support (checked against the installed versions)

- **Protocol.** OID4VP lets the wallet answer with an OAuth 2.0 error response instead of a `vp_token`: a form POST to the `response_uri` with `error=access_denied`, the request's `state`, and optionally `error_description`. That is the standard way to tell the verifier "the user declined".
- **Wallet library.** Credo `@credo-ts/openid4vc` 0.7.0 in `heka-wallet` has no holder method to send such an error response (`OpenId4VcHolderApi` only resolves and accepts requests). The wallet has to POST it itself. The `response_uri` and `state` are in the resolved authorization request it already has.
- **Verifier library.** Credo 0.7.0 in `heka-identity-service` (with `@openid4vc/openid4vp` 0.4.6) does not recognise error responses. The authorization endpoint parses every POST as a `vp_token` response (`zOpenid4vpAuthorizationResponse`). An `error=access_denied` POST fails that parsing, so the session moves to `Error` with a generic "Failed to parse openid4vp authorization response" `errorMessage`, and the wallet gets HTTP 400. The UI could show this as a failure, but it can't tell a decline apart from a broken response.
- **Hook point.** The OpenID4VC routes run on an Express app the identity service owns (`agencyConfig.oidConfig.app`, passed to `OpenId4VcModule` in `common/agent/agent-modules.provider.ts`). Credo's `response_uri` is `<verificationEndpoint>/<verifierId>/<authorizationEndpoint>?session=<sessionId>` (`OpenId4VpVerifierService`), so a middleware registered on that app before Credo's router can recognise an error response and find the session by its `session` query parameter.

## 20. Decisions

1. **Treat Aries `abandoned` and OID4VP `Error` as final states in the UI.** The UI stops polling and shows a "declined or failed" result instead of waiting forever. This alone fixes the endless wait for every path that reaches the service, even before the wallet and service changes.
2. **Tell "declined" apart from other failures by the error message**, not a new state. Aries: the wallet's problem report reads "Request declined", so `errorMessage` ends with `Request declined`. OID4VP: the identity service stores `access_denied` (decision 4). The UI shows "The holder declined the request" for these and "The request failed" plus the message otherwise. No new states are added to the API.
3. **The wallet always notifies the verifier on decline.** The Home notification card passes `sendProblemReport: true`, like the full request screen. The OID4VP screen sends an `access_denied` error response before navigating home.
4. **The identity service handles OID4VP error responses itself until Credo does.** A small middleware on the OpenID4VC Express app, ahead of Credo's router, handles POSTs to the verifier authorization endpoint whose body contains `error`. It loads the session by the `session` query parameter, checks that `state` matches the session's request `state`, sets `errorMessage` to `"<error>: <error_description>"`, moves the session to `Error` through the Credo verifier service so the usual state-change event fires (Part 2 pushes it), and answers `200 {}`. Anything else falls through to Credo unchanged. Before building it, check whether a newer Credo release accepts OID4VP error responses; if it does, upgrade instead and drop the middleware.
5. **Only sessions still waiting can be declined.** The middleware only acts when the session is `RequestCreated` or `RequestUriRetrieved`, matching Credo's own error handling. A late error response for a verified session gets `400` and changes nothing.
6. **Credential offer decline is out of scope.** The same "polls forever" gap exists for declined credential offers (the wallet already sends a problem report there). It is listed as a follow-up so this part stays focused on presentation requests.

## 21. User flow

```
Verifier web UI                                  Wallet
---------------                                  ------
Request shown (QR / sent over connection)  --->  Presentation request screen
Waiting...                                        [Decline]
                                                  Aries: problem report  ---> proof record "abandoned"
                                                  OID4VP: error=access_denied ---> session "Error"
"The holder declined the request"           <---  (poll or push picks up the final state)
[Request again]   [Back]
```

"Request again" restarts the verification step with the same context; "Back" leaves the flow as the existing completion screen does.

## 22. Changes by file

### 22.1 Wallet (`heka-wallet/app/src`)

| File | Change |
|---|---|
| `components/cards/NotificationCard.tsx` | `onProofRequestDecline`: call `declineRequest({ proofExchangeRecordId, sendProblemReport: true })`, then remove a verify-once connection the same way `AriesPresentationRequest.tsx` does. |
| `credentials/openid4vc/declinePresentationRequest.ts` (new) | `declinePresentationRequest(resolvedRequest)`: if the request has a `response_uri` (modes `direct_post` / `direct_post.jwt`), POST `application/x-www-form-urlencoded` with `error=access_denied`, `error_description=User declined the request`, and `state` when the request has one. Ignores network errors after logging them, since the decline must not get stuck. For DC API requests, do nothing; the existing `sendErrorResponse` path covers them. |
| `screens/OpenIdPresentationRequest.tsx` | `onDecline`: call `declinePresentationRequest` with the resolved request, then navigate home as today. Show the existing "declining" spinner while it runs. |
| `credentials/openid4vc/__tests__/declinePresentationRequest.test.ts` (new) | Posts the right form body to `response_uri`; includes `state` only when present; does nothing for DC API requests; swallows network errors. |

### 22.2 Identity service (`heka-identity-service/src`)

| File | Change |
|---|---|
| `proof/dto/proof-record.dto.ts` | Add `errorMessage?: string` from the Credo record, with `@ApiPropertyOptional()`. |
| `openid4vc/verification-sessions/authorization-error-response.middleware.ts` (new) | The middleware from decision 4. Registered on `agencyConfig.oidConfig.app` before `OpenId4VcModule` mounts its router, for `POST <verifier authorization endpoint path>`. Uses the tenant context the same way Credo's router does (`getRequestContext` is internal, so resolve the verifier and tenant from the path's `verifierId`). Runs only when the body has `error`. Sets state via `OpenId4VpVerifierService.updateState`, or via the repository plus an explicit `OpenId4VcVerifierEvents.VerificationSessionStateChanged` event if `updateState` is not reachable. |
| `common/agent/agent-modules.provider.ts` or the OpenID4VC starter | Register the middleware on `oidConfig.app` before the module initialises. |
| `openid4vc/verification-sessions/verification-session.service.ts` | No change: `GET openid4vc/verification-session/:id` already returns `state` and `errorMessage` (`verification-session.dto.ts`). |
| Tests (`__tests__` next to each file) | Middleware: `access_denied` moves a waiting session to `Error` with the message and returns 200; wrong `state` returns 400; session already verified returns 400 and stays verified; a body without `error` falls through to Credo. Proof DTO: `errorMessage` is mapped. |

### 22.3 Web UI (`heka-identity-service-web-ui/src`)

| File | Change |
|---|---|
| `entities/Presentation/model/types/presentation.ts` | Add `errorMessage?: string` to `PresentationSession`. |
| `entities/Presentation/model/services/updatePresentationState.ts` | Read `errorMessage` from both responses (`GET proofs/:id` after the DTO change, `GET openid4vc/verification-session/:id` already) and return it. |
| `entities/Presentation/model/slices/presentationSlice.ts` | Store `errorMessage` in `presentationSession`. |
| `entities/Presentation/model/selectors/presentationSelector.ts` | Add `getIsPresentationFailed` (`abandoned`, `declined`, OID4VP `Error`) and `getIsPresentationDeclined` (failed and the message ends with `Request declined` or starts with `access_denied`). Add `getPresentationErrorMessage`. |
| `components/Steps/VerificationRequest/states/PresentationDeclined.tsx` (new) | Result screen: title "Request declined" or "Request failed", the error message for failures, buttons "Request again" (resets the presentation and connection slices and returns to this step) and the step's usual next action. Reuse the layout of `PresentationReceived.tsx`. |
| `components/Steps/VerificationRequest/protocols/AnoncredsVerificationRequest.tsx` | Render `PresentationDeclined` when `getIsPresentationFailed`, before the completed check. |
| `components/Steps/VerificationRequest/protocols/OpenIdVerificationRequest.tsx` | Same. |
| `components/Steps/VerificationRequest/states/PendingPresentation.tsx` | Stop polling when failed as well as when completed. If Part 2 is merged, pass `isDone: isPresentationCompleted \|\| isPresentationFailed` to `useRecordUpdates`. |
| `translations/en.ts` | "Request declined", "The holder declined the request.", "Request failed", "Request again". |
| `entities/Presentation/model/services/requestPresentation.test.ts` and new selector tests | `errorMessage` is read from both protocols; failed/declined selectors for each state and message pattern. |

## 23. Edge cases

| Case | Handling |
|---|---|
| Old wallet build without the wallet changes | Aries declines from the full screen already work end to end once the UI and DTO changes ship. Declines from the notification card and OID4VP declines still leave the UI waiting, as today. |
| Wallet is offline when declining | Aries: the problem report goes through the mediator and arrives later; the UI updates when it does. OID4VP: the POST fails, the wallet logs it and still goes home; the verifier keeps waiting until the session expires. |
| Holder declines, then scans the same QR again | Aries single-use invitation: the connection already exists, so the second scan is ignored by the wallet, as today. OID4VP: the session is `Error`; Credo rejects a second response. The operator uses "Request again". |
| Session expired before the decline arrives | Credo has already moved it to `Error` with "session expired"; the middleware answers 400. The UI shows "Request failed" with that message. |
| A verifier using `direct_post.jwt` | Error responses are not encrypted (OAuth 2.0 error responses carry no data to protect), so the wallet sends them as a plain form POST and the middleware handles them the same way. Check this against the identity service's JARM handling during step 4 of section 25. |
| Someone POSTs `error=access_denied` with a guessed session id | They also need the request's `state`, which only the wallet that fetched the request has. Without it the middleware answers 400. |
| Proof sent, then verification fails on the verifier | Aries: state `done` with `isVerified: false`, not `abandoned`; unchanged by this part. OID4VP: `Error` with Credo's verification message; now shown as "Request failed" instead of waiting forever. |

## 24. Manual verification

1. Aries via the full request screen: send a proof request, decline in the wallet. The UI shows "Request declined" within one poll (or immediately with Part 2). `GET proofs/:id` shows `abandoned` and the `errorMessage`.
2. Aries via the Home notification card: same result.
3. OID4VP by QR: decline in the wallet. The UI shows "Request declined"; `GET openid4vc/verification-session/:id` shows `Error` and `access_denied: User declined the request`.
4. OID4VP via the DC API: cancel in the browser dialog. Unchanged "cancelled" message.
5. "Request again" starts a fresh request that can be accepted.
6. Accepting a request in each protocol still shows the received attributes.
7. Let an OID4VP session expire without answering, then decline: the UI shows "Request failed" with "session expired".

## 25. Steps

| # | Step | Status |
|---|---|---|
| 1 | Web UI: `errorMessage`, failed/declined selectors, `PresentationDeclined` screen, stop polling on failure, tests | todo |
| 2 | Identity service: `errorMessage` on `ProofRecordDto` | todo |
| 3 | Wallet: problem report from the notification card decline | todo |
| 4 | Identity service: check newer Credo for OID4VP error-response support; otherwise the middleware, registration and tests | todo |
| 5 | Wallet: OID4VP `access_denied` error response on decline, tests | todo |
| 6 | Manual verification (section 24) | todo |

Order and PRs: steps 1 and 2 can ship first, together or separately, and already fix the Aries full-screen decline and any OID4VP `Error`. Step 3 is a one-line wallet PR. Steps 4 and 5 go together for OID4VP: the service change first, since a wallet that sends `access_denied` to an unchanged service still produces `Error` (shown as "Request failed" instead of "Request declined"), which is harmless.

## 26. Out of scope and follow-ups

- **Credential offer decline.** The wallet already sends a problem report when declining an Aries credential offer (`AriesCredentialOffer.tsx`), and the credential record becomes `abandoned`, but `PendingCredential` polls forever. The same pattern as this part applies: `errorMessage` on `CredentialRecordDto`, failed state in the UI. OID4VCI has no equivalent decline message for pre-authorized offers.
- **Upstream fix.** Contribute OID4VP error-response handling to Credo (holder method and verifier parsing) so the middleware and the wallet's manual POST can be removed.
- **Decline reasons.** Letting the holder choose a reason (Aries problem report description, OID4VP `error_description`) and showing it in the UI.

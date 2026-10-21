# Review — improve-web-ui-3: Identity web UI improvement

- Target: branch `feature/improve-web-ui-3` (working tree, incl. uncommitted deletions) · Base: `hiero-ledger-main` @ 59374ca · Head: `HEAD` @ 8869abf
- Apps: identity-web-ui, identity-service · Size: large (241 files, ~17.7k added lines) · Mode: parallel + verify
- Date: 2026-10-21 · Verdict: **approve with fixes** (no blockers, 8 should-fix)
- Ran: not run. Earlier in this session, `tsc --noEmit` passed for identity-web-ui and for identity-service (build and test configs).

## Findings

| # | Severity | Dimension | Where | Problem |
|---|---|---|---|---|
| 1 | should-fix | Correctness | `heka-identity-web-ui/.../notificationClient.ts:65-75` | Close code 3000 starts an endless refresh and reconnect loop |
| 2 | should-fix | Correctness | `notificationClient.ts:71` | Token refresh on 4001 skips the API mutex, so a second refresh grant can run in parallel |
| 3 | should-fix | Security | `heka-identity-service-web-ui/scripts/remove-all-schemas.ts:36-43` | Destructive script has no host guard and a hard-coded password |
| 4 | should-fix | Tests | `heka-identity-service/test/ws-authentication.e2e.test.ts` | New subprotocol auth for WebSocket has no e2e test |
| 5 | should-fix | Rules | `.../Connection/model/services/connectionThunks.test.ts:1,23` | New `any` with a file-wide eslint-disable |
| 6 | should-fix | Rules | `.../components/Draggable/Draggable.test.tsx:171-187` | Fixed 50 ms sleeps in a test |
| 7 | should-fix | Checklists | `heka-identity-service/docs/swagger-spec.yaml:1585,1631` | Swagger changed but the API did not (YAML anchors moved) |
| 8 | should-fix | Checklists | AI package specs (3 files) | Specs no longer match the gateway and web UI changes |
| 9 | consider | Correctness | `.../shared/api/utils/error.ts:50,60-62` | Demo pages fail silently on 401 |
| 10 | consider | Security | `heka-identity-service/.../notification.gateway.ts:108` | A token without `exp` keeps the socket open forever |
| 11 | consider | Checklists | `.../config/jest/jest.config.ts:34` | CI does not enforce the coverage thresholds |
| 12 | consider | Rules | `.../pages/Home/Home.test.tsx:134,146,160` | `setTimeout(0)` flushes instead of waiting for a condition |
| 13 | consider | Intent | `.../translations/en.ts:9,202,203` | The rename from "schemes" to "schemas" is incomplete |

### 1. Endless reconnect loop on close code 3000

- **Where:** `heka-identity-service-web-ui/src/shared/lib/notifications/notificationClient.ts:65-75`
- **Scenario:** The server rejects the token for a reason a refresh cannot fix: no Heka role, a wrong audience, or a wallet error. The client then:
  1. refreshes the token;
  2. reconnects;
  3. gets 3000 again.

  The backoff is capped at 30 s and the attempt counter resets only on `onopen`. Each open tab then calls the IdP every 30 s for as long as it stays open.
- **Evidence:** `onClose` handles 3000 and 4001 in the same branch. Nothing limits the number of retries.
- **Fix:** On 3000, retry once with the fresh token. If that also gets 3000, stop and leave the status `closed`.

### 2. Token refresh on 4001 bypasses the mutex

- **Where:** `notificationClient.ts:71`
- **Scenario:** `automaticSilentRenew` renews the token about 60 s before it expires, but the socket keeps the old token. The server closes the socket with 4001 at the old `exp`. The client then calls `refreshSessionToken()` again, outside the mutex in `api.ts`. That refresh can overlap with a refresh on the HTTP side. With refresh-token rotation, one of the two calls fails and the session is dropped.
- **Evidence:** `api.ts:84-94` already does it the right way: inside the mutex, it reuses `getSessionAccessToken()` when the token has changed.
- **Fix:** Move the "reuse a newer token, otherwise refresh under the mutex" logic into a shared `renewSessionOnce()` in `sessionBridge`. Call it from both `api.ts` and the notification client.

### 3. `remove-all-schemas` can wipe any database

- **Where:** `heka-identity-service-web-ui/scripts/remove-all-schemas.ts:36-43` (connection), `59-66` (DELETE)
- **Scenario:** A developer's shell still has `MIKRO_ORM_HOST` and `MIKRO_ORM_DATABASE` set for a shared or staging database. They run `yarn remove-all-schemas --yes`, and every tenant's schemas, registrations and templates are deleted. The dry run does not show which host it would hit.
- **Evidence:** `CLAUDE.md` -> "No insecure defaults or secrets": the password falls back to `heka1`. `heka-identity-service/docker-compose.yml` now says "No committed password".
- **Fix:**
  - Print the host and database in both modes.
  - Refuse any host other than `localhost`, `127.0.0.1` or `::1` unless `--allow-remote` is passed.
  - Require `MIKRO_ORM_PASSWORD` instead of falling back to `heka1`.
  - Consider moving the script to identity-service: it is a database tool, not web UI code.

### 4. WebSocket subprotocol auth has only mocked tests

- **Where:**
  - `heka-identity-service/src/common/auth/auth.service.ts:59` (`validateWebSocketToken`)
  - `notification.gateway.ts:19-27` (`selectNotificationProtocol`)
- **Scenario:** If the `handleProtocols` wiring breaks, browsers drop the socket. A real `ws` server refuses the handshake when the protocol is not echoed back. The mocked unit tests would not catch either case.
- **Evidence:** `CLAUDE.md` -> "Tests" (policy B: a test with every new flow). `test/ws-authentication.e2e.test.ts` uses only the `Authorization` header.
- **Fix:** Add two e2e cases:
  - `new WebSocket(url, ['heka.bearer', token])` opens, and `ws.protocol === 'heka.bearer'`.
  - A bad token sent in the subprotocol is closed with code 3000.

### 5. New `any` in a test

- **Where:** `heka-identity-service-web-ui/src/entities/Connection/model/services/connectionThunks.test.ts:1,23`
- **Scenario:** `thunk: any` turns off type checks on the thunk. The file-wide `/* eslint-disable @typescript-eslint/no-explicit-any */` will also hide any `any` added to this file later.
- **Evidence:** `Code-Style.md` -> "Types" (no new `any`). The sibling tests use the typed `createTestStore(...).dispatch(thunk)`.
- **Fix:** Use `createTestStore` and `store.dispatch`, then remove the disable comment.

### 6. Fixed sleeps in the Draggable test

- **Where:** `heka-identity-service-web-ui/src/components/Draggable/Draggable.test.tsx:171-187`
- **Scenario:** `settle()` waits 50 ms of real time, three times per test. On a slow CI runner, dnd-kit may not finish measuring in that time, so the test can fail at random.
- **Evidence:** `CLAUDE.md` -> "No fixed sleeps in tests".
- **Fix:**
  - After the Space key, wait for dnd-kit's live-region text: `await screen.findByText(/picked up/i)`.
  - Replace the last wait with `await waitFor(() => expect(onDragEnd).toHaveBeenCalledTimes(1))`.

### 7. Swagger file changed without an API change

- **Where:** `heka-identity-service/docs/swagger-spec.yaml:1585,1631`
- **Scenario:** The YAML generator moved the `&a40` anchor and inlined `*a39`. The meaning is the same, so the upstream PR gets a no-op diff.
- **Evidence:** `specs/identity-service/90-Change-Guide/Implementation-Checklists.md`: commit the swagger file only when the API changes.
- **Fix:** `git checkout hiero-ledger-main -- heka-identity-service/docs/swagger-spec.yaml`.

### 8. Specs are out of date

- **Where:** in the AI package (`specs/`):
  - `identity-service/50-Platform/Notifications-and-Webhooks.md:15`. It still says "one socket per user; a new connection replaces the old". The gateway now keeps a set of sockets per user and sends to all of them. `send` without a socket does nothing; it no longer throws.
  - `identity-service/50-Platform/Auth-and-Roles.md:51`. These are missing:
    - the `heka.bearer` subprotocol with the token after it, and the `Authorization` header as fallback;
    - only the marker is echoed back;
    - close code 4001 "Token expired", sent on a timer.
  - `identity-web-ui/10-Architecture/Overview.md:30` and `identity-web-ui/60-Testing/Testing.md`. These are missing:
    - the notification client and the push-plus-polling model (`useRecordUpdates`);
    - connection reuse;
    - `yarn test:coverage`;
    - `yarn remove-all-schemas`;
    - the new test files.
- **Evidence:** `CLAUDE.md` -> "A wrong spec is fixed in the same session".
- **Fix:** Update the three spec files.

### 9. Demo pages fail silently on 401

- **Where:** `heka-identity-service-web-ui/src/shared/api/utils/error.ts:50,60-62`
- **Scenario:** A visitor on `/demo` or `/age-demo` has no OIDC session, so every 401 is hidden. If the demo-broker token is rejected, the page keeps showing the loader and no error appears.
- **Fix:** Hide the toast only for requests made with the `$agencyApi` instance. Keep it for `$agencyDemoApi`.

### 10. A token without `exp` never closes the socket

- **Where:** `heka-identity-service/src/common/notification/notification.gateway.ts:108` (`scheduleExpiry` returns early); `auth.service.ts:71`
- **Scenario:** `jwtVerify` does not require `exp`. An IdP or test issuer that leaves out `exp` keeps the socket open, even after the user is disabled. The comment at `auth.service.ts:70` ("The signature and `exp` were verified") is wrong in that case.
- **Fix:** Refuse a socket whose token has no `exp` (close it with code 3000), or set a maximum socket lifetime.

### 11. Coverage thresholds are not enforced

- **Where:** `heka-identity-service-web-ui/config/jest/jest.config.ts:34`
- **Scenario:** The thresholds (90/90/75/80) apply only with `--coverage`, and CI runs `yarn test:unit` (`.github/workflows/heka-identity-service-web-ui-verify.yml:62`). Coverage can drop without CI failing.
- **Fix:** Run `yarn test:coverage` in CI, or remove the thresholds.

### 12. `setTimeout(0)` flushes in the Home test

- **Where:** `heka-identity-service-web-ui/src/pages/Home/Home.test.tsx:134,146,160`
- **Scenario:** The test waits exactly one tick. If the profile request ever fires one tick later, the checks for "0 requests" and "stays on the page" pass by accident.
- **Fix:**
  - Positive case: `await waitFor(() => expect(userRequests(api)).toHaveLength(1))`.
  - Negative cases: wait for a positive signal first, then assert.

### 13. "schemes" rename is incomplete

- **Where:** `heka-identity-service-web-ui/src/translations/en.ts:9,202,203`
- **Scenario:** These strings still say "schemes": "Loading schemes ...", "There are no active schemes", "There are no hidden schemes".
- **Fix:** Rename them to "schemas".

## More to consider

- `heka-identity-service-web-ui/src/entities/Credential/model/services/offerCredential.ts:90,139` has hard-coded English error texts. `describeError` now shows them to the user, so move them to `en.ts`.
- `heka-identity-service/docs/api.md:28-32`: the public docs do not describe the WebSocket contract. That contract is the `/notifications` URL, the `heka.bearer` subprotocol, and close codes 3000 and 4001.
- `heka-identity-service-web-ui/README.md:72-128` does not list the new `test:coverage` and `remove-all-schemas` scripts. For `remove-all-schemas`, also document the `MIKRO_ORM_*` variables and `--yes`.

## Broken links to docs

None found.
- The diff adds or changes no Markdown file.
- The file paths in new code comments exist (`scripts/prepare-demo-user.ts`, `src/shared/api/config/demoToken.ts`).
- Nothing in the repo refers to the deleted files: the 4 files in `docs/*.md` and `tools/heka-auth-user-export/`.
- The remaining mentions of `heka-auth-service` are plain text with no links (`heka-identity-service/docs/setup.md:365-377`, the Keycloak and Auth0 READMEs, `setup-tenant.sh`).

**Note:** deleting `docs/*.md` (4 files) and `tools/heka-auth-user-export/` is not committed yet. If you push without committing it, the PR will add those files to upstream.

## Long comments — short rewrites

These are the added comments that are long or hard to read. Proposed replacements:

| Where | Proposed |
|---|---|
| `heka-identity-service-web-ui/scripts/remove-all-schemas.ts:1-19` | `/** Deletes all schemas with their fields, registrations and templates, in one transaction. Uses SQL because the API cannot delete schemas. Dry run by default; --yes deletes. Then run yarn prepare-demo-user. Env: MIKRO_ORM_HOST/PORT/USER/PASSWORD/DATABASE. */` |
| `heka-identity-service/src/common/auth/auth.service.ts:53-58` | `/** Authenticates a WebSocket upgrade. Browsers can't set headers, so the token comes after the heka.bearer subprotocol; the Authorization header also works. Returns exp so the socket can be closed when the token expires. */` |
| `heka-identity-service/src/common/notification/notification.gateway.ts:19-22` | `/** Accept only the heka.bearer marker as the subprotocol. Never echo the token back. */` |
| `heka-identity-service-web-ui/src/shared/lib/hooks/useLatest.ts:3-7` | `/** A ref that always holds the latest value. Lets effects call a prop that changes every render without re-running. */` |
| `heka-identity-service-web-ui/src/shared/lib/hooks/useLatest.ts:10-12` | `// Layout effects run before all useEffects, so every effect sees the new value. Not set during render: a render may be discarded.` |
| `heka-identity-service-web-ui/src/shared/hooks/flow.ts:59-62` | `// Callers pass new initialContext/steps every render. Read them via refs so resetFlowState changes only with the wizard type.` |
| `heka-identity-service-web-ui/src/shared/auth/OidcAuthProvider.tsx:71-73` | `// Use UserManager directly: auth.signinSilent() shows the full-page loader mid-flow. The new user still arrives via userLoaded.` |
| `heka-identity-service-web-ui/src/shared/auth/OidcAuthProvider.tsx:77-78` | `// Publish the new token now, so queued requests reuse it instead of renewing again.` |
| `heka-identity-service-web-ui/src/shared/api/config/api.ts:84-86` | `// One renewal at a time. If the session was renewed while this request waited, reuse that token (many requests get 401 together).` |
| `heka-identity-service-web-ui/src/shared/api/utils/error.ts:23-27` | `/** Server message if present; generic text for other server errors; otherwise the error's own message. */` |
| `heka-identity-service-web-ui/src/shared/api/utils/error.ts:55-59` | `/** A 401 while signed out is expected, so don't show a toast for it. */` |
| `heka-identity-service-web-ui/src/pages/Home/Home.tsx:46-48` | `// Fetch the profile only when signed in (otherwise the 401 shows a toast). Users who never registered go to their profile.` |
| `heka-identity-service-web-ui/src/shared/lib/a11y/clickable.ts:13-18` | `/** Makes a non-button element (div, Row, icon) clickable by keyboard and screen reader. Use when a real button would break the styles. */` |
| `heka-identity-service-web-ui/src/shared/ui/Button/Button.tsx:134-138` | `/** Button classes for another react-aria element (e.g. MenuItem), so it looks like a button without nesting one. */` |
| `heka-identity-service-web-ui/src/shared/ui/ConfirmDialog/ConfirmDialog.hook.tsx:14-18` | `/** Dialog open state. Returns props, not a component, so the dialog doesn't remount and lose its close animation. */` |
| `heka-identity-service-web-ui/src/shared/hooks/recordUpdates.ts:27-30` | `/** Refreshes a pending offer or request on push. Polls as a fallback, faster when push is down. */` |
| `heka-identity-service-web-ui/src/const/user.ts:5-9` | `/** Demo account for the public demo pages. The DID is set at build time; the token is fetched at runtime (demoToken.ts). */` |
| `heka-identity-service-web-ui/src/components/Steps/SelectNetwork/SelectNetwork.tsx:71-72` | `// The store may still hold the previous network's DIDs; show them only once they match the selected network.` |
| `heka-identity-service-web-ui/src/components/Steps/SelectNetwork/SelectNetwork.tsx:91-92` | `// Keep the current DID if it is in the list; otherwise pick the first, or clear.` |
| `heka-identity-service-web-ui/src/components/Steps/SelectSchema/SelectSchema.tsx:78-79` | `// setSchema changes every render; call it via a ref so effects don't re-run.` |
| `heka-identity-service-web-ui/src/shared/hooks/connection.ts:30-31` | `// Last connection onComplete ran for. It sends an offer or request, so it must run once per connection.` |
| `heka-identity-service-web-ui/src/shared/hooks/connection.ts:49-50` | `// Ignore a completed session left from the previous flow, or onComplete fires with an old connection.` |
| `heka-identity-service-web-ui/src/app/routes/Router.tsx:106-107` | `// Use the OIDC session, not Redux: Redux updates one render later, and a reload would send deep links to Home.` |
| `heka-identity-service-web-ui/src/components/EditField/EditField.tsx:33-34` | `// Disabled if loading OR not editable (not ??, which lets isLoading={false} win).` |
| `heka-identity-service-web-ui/src/shared/ui/CheckboxGroup/CheckboxGroup.tsx:44-45` | `// Compute the selection first, then set both states; never call the parent's setter inside an updater.` |
| `heka-identity-service-web-ui/src/pages/IssueCredential/Schemas/Schemas.tsx:90-91` | `// Compute the new order first; a value set inside a state updater isn't ready right after.` |
| `heka-identity-service-web-ui/src/pages/Profile/Profile.tsx:102-103` | `// Validate the trimmed name here; setValueAs doesn't run because TextInput uses a Controller.` |
| `heka-identity-service-web-ui/src/shared/lib/notifications/types.ts:1-4` | `/** Notification DTO fields the UI uses. DIDComm sends the record id; OpenID4VC sends the whole session. */` |
| `heka-identity-service-web-ui/src/components/Schema/Schema.test.tsx:9-10`, `src/shared/ui/TextInput/TextInputControlled.test.tsx:5-6` | `// Render SVG icons as spans that keep their props, so icon buttons can be found and clicked.` |
| `heka-identity-service-web-ui/src/shared/api/utils/error.ts` (`handleError` JSDoc) | `/** Toasts the error (except a 401 while signed out) and rejects the thunk. dispatch is unused; kept for existing callers. */` |

## Intent

No ticket was given. The diff matches the goal "Identity web UI improvement":
- WebSocket push with a polling fallback
- reuse of existing connections
- the wording change to "schemas"
- i18n of the remaining text
- the fix to the OIDC router
- many new tests

The gateway changes in identity-service are the backend half of the push feature. The only addition outside that goal is `scripts/remove-all-schemas.ts` (finding 3). I found no `console.log` in app code, no TODO or FIXME, and no `.only` or `.skip`.

## Out of scope

Problems in code this branch did not touch:
- `heka-identity-service/src/common/auth/auth.service.ts:44`: `validateRequestToken` writes the raw bearer token to the trace log, and `validateTokenPayload` writes the full payload.
- `NotificationGateway` has no limit on sockets per user (an unbounded `Set`).
- `heka-identity-service-web-ui/src/pages/IssueCredential/IssueCredentialRoutes.tsx:37`: the nested `issue-from-template` route is dead code. This branch removed its twin `verify-from-template`.
- `heka-identity-service-web-ui/src/translations/en.ts` has several unused keys inherited from upstream: `Common.titles.loadingTemplates`, `buttons.plus`, `IssueCredential.menuItemNames.*`, `CreateSchema.titles.addCredential` and others.
- `heka-identity-service-web-ui/src/entities/Presentation/model/services/requestPresentation.test.ts:63-66` uses `any`.

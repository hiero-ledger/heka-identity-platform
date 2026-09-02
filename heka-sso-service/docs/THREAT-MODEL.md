# Threat-Model Review — interID's 11-Vector Checklist (P2.7)

Companion to [INTEGRATION.md](INTEGRATION.md) (§4.6-5 mandates this review) and the feasibility doc's §3.6 security design. Reviewed **2026-08-25** against the Phase 2 codebase (post-P2.5).

**Method.** The checklist is the attack-vector analysis of the interID paper — *interID: An Ecosystem-agnostic Verifier-as-a-Service with OpenID Connect Bridge* ([arXiv 2602.14871](https://arxiv.org/html/2602.14871)), §6.1 *Security and Threat Analysis*, vectors **AT.1–AT.11**. interID and heka-sso-service solve the same problem (an OIDC provider whose authentication method is a verifiable-credential presentation), so its vectors map 1:1 onto the bridge's seams. Each vector below is translated to this architecture, matched against implemented controls (with code references), backed by test evidence, and closed with residual risks. E2E evidence lives in [`test/oidc.e2e.test.ts`](../test/oidc.e2e.test.ts) — the P2.7 additions are the `threat-model coverage` describe block (OAuth/OIDC seam) plus the `AT.5`/`AT.7` cases in the wallet suite; run with `yarn test:e2e` (needs the dev Postgres).

**Concept mapping** — interID's architecture onto the bridge's:

| interID concept | heka-sso-service analog |
|---|---|
| OIDC bridge (Keycloak-based OP) | `node-oidc-provider` OP (`src/oidc/provider.factory.ts`) |
| Tenant + per-tenant OIDC client | OIDC client (`OIDC_CLIENTS`) + its login configuration (`OIDC_LOGIN_CONFIGS`, §4.2) |
| Proof template (MongoDB) | Login configuration's DCQL query + claim mapping (static env JSON until P3.5) |
| Redis session store | Postgres `oidc_entity` (adapter, P1.5) + in-memory pending-login / account-claims stores (P1.3/P1.6) |
| Ecosystem-specific Verifier service | heka-identity-service (Credo OID4VP verifier), reached via the verification-session API |
| Service-to-service OAuth tokens | Identity-service service account (P1.6.7, `identity-service-token.provider.ts`) |

**Verdict summary:**

| Vector | Status | Follow-up |
|---|---|---|
| AT.1 Authorization code interception | **Mitigated** | — |
| AT.2 CSRF | **Mitigated** | — |
| AT.3 Token replay & theft | **Mitigated** | TLS at deployment |
| AT.4 Session hijacking | **Mitigated** (deployment caveats) | TLS → `Secure` cookies; review `OIDC_TTL_SESSION` per deployment |
| AT.5 Proof request manipulation | **Mitigated** | — |
| AT.6 Verification result spoofing | **Mitigated** (residual: issuer trust policy) | P3.2 (`issuerAllowlist` enforcement, trust anchors) |
| AT.7 Credential presentation replay | **Partially mitigated** | **P3.9** (request TTL ≤ 2–3 min, one-time `request_uri` — postponed from P2.8); P3.1 (`direct_post.jwt`) |
| AT.8 Client credential isolation | **Mitigated** (single-tenant scope) | P3.5 (secret storage), P3.4 (multi-tenant issuers) |
| AT.9 Session data isolation | **Mitigated** (residual: in-memory stores) | P3.5 (claim/pending stores → Postgres) |
| AT.10 Proof template isolation | **Mitigated by construction** | Re-review at P3.5 (per-request `login_config:<id>` selection) |
| AT.11 Token audience validation bypass | **Mitigated** | — |

---

## AT.1 — Authorization code interception

*An attacker who observes or steals the authorization code redeems it for tokens.*

**Controls.** PKCE (S256, the only method the library supports) is mandatory for **all** clients — the v9 default exemption for confidential clients is overridden (`pkce.required: () => true`, `provider.factory.ts`). Codes are single-use — the adapter marks `consumedAt` and replay is rejected (`mikro-orm.adapter.ts` `consume`) — and short-lived (`OIDC_TTL_AUTHORIZATION_CODE`, default **60 s** — stricter than interID's 10-minute window). Redemption requires the registered client secret (`client_secret_basic`/`_post`) and the exact `redirect_uri` of the authorization request; only pre-registered exact-match redirect URIs are accepted at `/authorize`.

**Evidence.** E2E: missing-PKCE rejection, code-replay rejection (P1.8); P2.7 adds wrong-`code_verifier` rejection and `redirect_uri`-mismatch rejection at `/token`. Unit: `oidc-protocol.spec.ts`.

**Residual.** None at the bridge. (Code binding to the interaction cookie is AT.9's §3.3 rule.)

## AT.2 — Cross-site request forgery

*A user is tricked into an authorization or logout they didn't initiate.*

**Controls.** `state` is echoed verbatim on success **and** error redirects with no length limit (broker matrix, §1 step 4) — the brokering IdP is the OAuth client and verifies it; the bridge's job is faithful passthrough. Redirect URIs are exact-match against registration, so a forged request cannot exfiltrate to an attacker endpoint. RP-initiated logout is XSRF-protected: the confirmation form carries the library's XSRF secret, the hint-less dialog is unconditional, and auto-confirm is opt-in (`OIDC_LOGOUT_AUTO_CONFIRM`, P2.5.1) and still submits through the XSRF form. The interaction API is same-origin and cookie-bound (§3.3) — a cross-site page cannot drive a foreign login to completion (the P2.1.1 design decision explicitly rejected cross-origin interaction serving partly for login-CSRF reasons).

**Evidence.** P2.7 e2e: verbatim `state` echo (128-char state) on success and error redirects; forged-XSRF logout confirmation rejected with the session intact. `logout.spec.ts`: hint-less dialog, foreign post-logout redirect URI rejected.

**Residual.** None.

## AT.3 — Token replay and theft

*A captured id_token is replayed to another client or session.*

**Controls.** `nonce` is always echoed into the id_token (Keycloak hard-fails otherwise — §1 step 4) and verified by the IdP against its session. `aud` is the client id; tokens are RS256/ES256-signed with `kid` discipline against the published JWKS (P0.5 — keys generated per deployment, known-default keys refused in production). `sid` rides in id_tokens for `sid`-matched back-channel logout (P2.5). Access tokens are opaque, server-side artifacts bound to their grant.

**Evidence.** P2.7 e2e: `iss`/`aud`/`nonce` binding asserted on the id_token. P1.8 e2e: nonce echo, userinfo `sub` consistency. `logout.spec.ts`: `sid` in id_tokens.

**Residual.** Tokens carry PII (mapped credential claims); confidentiality in transit is a **deployment requirement** — TLS in front of the bridge (`provider.proxy = true` is already set for that topology).

## AT.4 — Session hijacking

*The OP browser session (or interaction session) is captured and reused.*

**Controls.** All provider cookies are keygrip-**signed** (`cookies.keys` from `OIDC_COOKIE_KEYS` — no compiled-in default, known-default values refused in production, §5-Decide-4) and **HttpOnly** with **SameSite=Lax**; the interaction cookie is additionally **path-scoped** to its single interaction. Session TTL is bounded (`OIDC_TTL_SESSION`, default 86 400 s; interaction TTL 600 s) and expired rows are purged hourly (`OidcCleanupService`). Sessions are revocable: RP-initiated logout destroys the OP session (verified — `prompt=none` → `login_required` afterwards) and back-channel logout notifies registered receivers.

**Evidence.** P2.7 e2e: HttpOnly on every provider cookie, SameSite + path scoping on the interaction cookie. P1.8/P2.5 e2e: session destruction on logout.

**Residual.** The `Secure` cookie attribute materializes only behind TLS with an `https` issuer — dev runs on `http`. **Deployment checklist**: TLS offload + `https` `OIDC_ISSUER_URL` in production. interID expires sessions after 30 min; the bridge's 1-day default is normal for an SSO OP but is a per-deployment decision (`OIDC_TTL_SESSION`).

## AT.5 — Proof request manipulation

*The credential request (which claims, from which credentials) is tampered with in transit or by the client.*

**Controls.** The DCQL query is built **server-side only**, from the login configuration resolved by the client's registered `loginConfigId` — no interaction endpoint accepts any request-shaping input from the browser (`interaction.controller.ts`; the DC API `verify` body is the wallet's *response*, not the request). Authorization requests to the wallet are **signed JARs** (P1.6.1 — `requestSigner` DID on every session, no unsigned fallback), so the wallet verifies who is asking and what was asked; DC API sessions additionally pin `expectedOrigins` to the bridge's own origin, never a client-supplied value (P2.1).

**Evidence.** P2.7 e2e: the create-session body's `dcql` deep-equals the configured login config's query, with the `requestSigner` DID attached. `verification-session.client.spec.ts`: signed-body shape, fail-fast without a signer. P1.8 e2e (DC API): `expectedOrigins` = bridge origin.

**Residual.** None at the bridge (template storage integrity becomes a DB concern at P3.5).

## AT.6 — Verification result spoofing

*A "verified" result is fabricated without a legitimate presentation.*

**Controls.** The browser can never assert verification: `/interaction/:uid/status` is read-only, and `/interaction/:uid/complete` **re-validates server-side** — the bridge fetches the verification session from heka-identity-service and requires `ResponseVerified` before running the claims pipeline (`wallet-identity-acquirer.ts` `completeLogin`; premature completion → `access_denied`). Cryptographic verification (signature, holder binding, nonce, trust chain) is Credo's, in heka-identity-service; the wallet's response goes directly there, never through the browser (§3.3). Bridge↔identity-service calls are bearer-authenticated via the P1.6.7 service account. Stub logins can never masquerade as verified: `amr: ['stub']`, and the stub flag is refused in production (P1.3.1/P1.3.2).

**Evidence.** E2E: premature-completion refusal (`access_denied`, no code). `wallet-interaction.spec.ts`: same at unit level, plus error surfacing.

**Residual.** The login config's `issuerAllowlist` is **parsed but not yet enforced** (`oidc.config.ts` only) — issuer trust today is whatever the identity-service verification enforces. Per-config trust anchors and revocation/status-list policies are **P3.2**; until then a deployment must constrain accepted issuers via the identity-service side.

## AT.7 — Credential presentation replay

*A captured presentation (or its transport artifacts) is reused for a later login.*

**Controls.** Each verification session carries a fresh Credo-generated nonce, verified in the KB-JWT; sessions are single-use and their state machine only reaches `ResponseVerified` once. On the bridge, the pending-login entry is deleted at `completeLogin` and the interaction itself is consumed on resume — a completed interaction cannot be replayed for a second code. The DC API path is origin-and-session-bound by construction (immune to cross-device relay).

**Evidence.** P2.7 e2e: replaying `/complete` after a successful login yields no second code. P1.8 e2e: code single-use.

**Residual — the known gap (P3.9, postponed from P2.8 on 2026-08-25).** Two IETF Cross-Device-Flows-BCP controls need heka-identity-service changes, not bridge work: the wallet-facing request TTL is Credo's **300 s default** (target ≤ 2–3 min, `expirationInSeconds` not yet exposed), and the `request_uri` is **re-fetchable** until expiry (single-use enforcement missing). Additionally, wallet responses ride plain `direct_post` until **P3.1** (`direct_post.jwt` encrypted responses per HAIP) — response confidentiality on that leg relies on TLS.

## AT.8 — Client credential isolation

*One client's credentials or artifacts grant access in another client's context.*

**Controls.** Each client has its own secret (known-default secrets refused in production) and its own registered redirect/logout URIs; authorization codes are bound to the issuing client — a second, validly authenticated client cannot redeem them. The `derived` sub strategy is **pairwise per client** (`HMAC(salt, client_id ‖ claims)`, §4.3), so even identity itself does not correlate across clients. Login configs are fixed per client (AT.10).

**Evidence.** P2.7 e2e (two registered clients): cross-client code redemption rejected (`invalid_grant`); the same stub identity yields **different subs** for different clients. `claims.spec.ts`: sub derivation.

**Residual.** The bridge is a single-tenant OP today (multi-tenant / per-tenant issuers is P3.4 — re-run this review then). Client secrets live as plaintext env JSON readable by the process; P3.5's DB storage should encrypt at rest (recorded there).

## AT.9 — Session data isolation

*Session/interaction state from one login leaks into another.*

**Controls.** Provider state in Postgres is keyed by composite PK `(name, id)` with model-scoped lookups (`mikro-orm.adapter.ts`); expired rows are treated as absent on every read path. Interaction state is reachable **only** through the signed, path-scoped `_interaction` cookie — the §3.3 binding rule: every interaction route (page, `data`, `status`, `dc-api/*`, `complete`) returns an error without it and leaks no session state, so the authorization code is released only into the browser session that initiated `/authorize`, never into the wallet's return channel. The pending-login map is keyed by interaction uid with TTL expiry; the account-claims store is keyed by the computed sub (pairwise per client, so claim sets cannot collide across clients), and an unresolvable sub fails the flow cleanly instead of minting an identity (`findAccount`, P1.4).

**Evidence.** E2E: uncookied requests rejected on all five interaction routes with no state leakage; P2.7 cookie-scoping assertions. `wallet-interaction.spec.ts`: uncookied-status rejection.

**Residual.** The pending-login and account-claims stores are in-memory — single-instance only, wiped on restart (fails closed: re-login required). They move to Postgres with **P3.5**.

## AT.10 — Proof template isolation

*A client obtains a credential request (and thus claims) belonging to another client's configuration.*

**Controls.** By construction: login configs are resolved server-side from the client id (`resolveLoginConfig`, `interaction.controller.ts`); no request parameter selects a template, and configs are static env JSON — there is no query surface to manipulate.

**Evidence.** Code inspection; AT.5's provenance test doubles as evidence (the request derives from the resolved config only).

**Residual.** §4.2's per-request `login_config:<id>` scope selection arrives with **P3.5** — when it lands, selection must be validated against a per-client allowlist; re-review this vector then.

## AT.11 — Token audience validation bypass

*A token minted for one client is accepted in another's context.*

**Controls.** id_token `aud` is the client id (asserted in e2e); access tokens are opaque, bound to their grant (account × client) — userinfo returns only that grant's claims. Pairwise subs (AT.8) remove even the correlation value of a leaked token. Verifying `aud` on consumption is the IdP's obligation as the OIDC client; Keycloak/Auth0/Entra/Okta/Cognito all do (broker matrix, §1 step 4).

**Evidence.** P2.7 e2e: `aud` binding; P1.8 e2e: userinfo `sub` consistency.

**Residual.** None.

---

## Cross-cutting controls (outside the 11 vectors)

- **Secrets posture** (§5-Decide-4): no compiled-in defaults for cookie keys, JWKS, sub-HMAC salt, client secrets, or the service-account password; production fails fast when unset and refuses known dev-default values; secrets are pino-redacted from startup logging (`oidc.config.ts`, `oidc-config.spec.ts`).
- **Key hygiene** (P0.5): per-deployment RSA-2048 + P-256 keys in Postgres, `kid` = RFC 7638 thumbprint, overlap-rotation runbook in the README; dev-keystore/weak-key overrides refused in production.
- **SSRF**: the library's outbound fetch (back-channel logout) destroys connections to special-use IPs by default; the dev-only escape hatch (`OIDC_ALLOW_PRIVATE_NETWORK_CALLS`) is refused in production (P2.5).
- **Rate limiting** (§4.6-5): the Nest throttler covers the interaction controllers; mounted provider endpoints (`/authorize`, `/token`) must be rate-limited at the **reverse proxy** (§5-Decide-5) — deployment checklist item.

## Follow-ups

| Item | Vector(s) | Where it's planned |
|---|---|---|
| Request TTL ≤ 2–3 min + one-time `request_uri` (identity-service changes) | AT.7 | **P3.9** (postponed from P2.8) |
| `direct_post.jwt` encrypted responses (HAIP) | AT.7, AT.3 | P3.1 |
| `issuerAllowlist` enforcement, trust anchors, revocation/status-list policies | AT.6 | P3.2 |
| Persist claim/pending stores; encrypted client-secret storage; allowlist per-request config selection | AT.9, AT.8, AT.10 | P3.5 |
| Re-review on multi-tenant issuers | AT.8 | P3.4 |
| OIDF conformance suite before GA | all | P3.3 |
| Deployment checklist: TLS (+ `https` issuer → `Secure` cookies), reverse-proxy rate limits, `OIDC_TTL_SESSION` review | AT.3, AT.4 | per deployment |

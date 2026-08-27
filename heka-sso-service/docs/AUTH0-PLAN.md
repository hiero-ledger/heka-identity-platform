# Auth0 Brokering Plan — "Sign in with wallet" through Auth0

Plan for supporting **Auth0 as the brokering IdP**, the same role Keycloak plays today
([INTEGRATION.md](INTEGRATION.md) §1, [DEMO.md](DEMO.md)). This is the Auth0 slice of
**P3.4** ("Brokering guides for Auth0 / Entra External ID / Okta / Cognito") pulled
forward. The identity provider registered inside Auth0 is **heka-sso-service** (the
bridge); Auth0 delegates authentication to it via a standard OIDC enterprise
connection, exactly as Keycloak does via its Identity Provider mechanism.

**TL;DR**

- The bridge's OP surface was designed against the Keycloak/Auth0/Entra/Okta/Cognito
  common denominator (feasibility §3.4), so **little to no protocol work is expected**.
  The one Auth0-specific quirk — *Auth0 never calls `userinfo`, all claims must be in
  the id_token* — is already handled: every releasable claim rides the `openid` scope
  and lands in the id_token (`provider.factory.ts`, `openidScopeClaims`).
- **Yes, for local development the bridge must be exposed via ngrok (or equivalent).**
  Auth0 is SaaS: unlike the dockerized dev Keycloak (which reaches the host via
  `host.docker.internal`), the Auth0 cloud must fetch the bridge's discovery document
  and JWKS and call `/token` **from the internet, over public-CA HTTPS**. There is no
  way to point an Auth0 tenant at `localhost:3005`. In production this is moot — the
  bridge is an internet-facing AS with a real public HTTPS domain by design.
- The known risk item is **PKCE**: since P1.7 the bridge requires PKCE S256 from every
  client. Whether Auth0's OIDC enterprise connection sends `code_challenge` upstream
  must be verified first; if it does not, the bridge needs a small, explicit per-client
  relaxation knob (task A2).

---

## 1. Should heka-sso-service be discoverable via ngrok?

### What Auth0 must reach, and from where

| Endpoint on the bridge | Called by | Reachability needed |
|---|---|---|
| `/.well-known/openid-configuration` | Auth0 servers (connection setup + runtime) | Public internet, HTTPS |
| `/jwks` | Auth0 servers (id_token signature validation) | Public internet, HTTPS |
| `/token` | Auth0 servers (code exchange, back-channel) | Public internet, HTTPS |
| `/authorize` + `/interaction/:uid` (wallet login page) | The user's browser | Browser only — but must live on the **same issuer origin** as the endpoints above |
| `/userinfo` | Nobody — Auth0 never calls it | — |

The `issuer` in the discovery document must exactly match the URL Auth0 was given and
the URLs inside the document, so **one public HTTPS origin must serve everything**
(`OIDC_ISSUER_URL`). This is actually *simpler* than the Keycloak dev setup — no
split-horizon `host.docker.internal` vs `localhost` wiring.

So:

- **Local development: yes — ngrok (or an equivalent HTTPS tunnel) is required.**
- **Production: no ngrok** — the bridge is deployed on a public HTTPS domain behind a
  reverse proxy (`provider.proxy = true` is already set, so `X-Forwarded-*` from the
  tunnel/proxy is trusted and secure cookies work).

### Recommended dev tunnel setup

1. Use the **free ngrok static domain** (one per account) so the issuer URL survives
   restarts — an ephemeral URL would force reconfiguring `OIDC_ISSUER_URL`, the Auth0
   connection, and re-creating federated users on every tunnel restart:

   ```bash
   ngrok http --url=<your-name>.ngrok-free.app 3005
   ```

2. In `env/.env`:

   ```bash
   OIDC_ISSUER_URL=https://<your-name>.ngrok-free.app
   ```

3. Caveats:
   - **ngrok free interstitial**: browser requests get a one-time "You are about to
     visit…" warning page per session. Auth0's server-to-server JSON calls are not
     affected; the user clicks through once before the wallet login page. Alternatives
     without an interstitial: a paid ngrok plan, or `cloudflared` (named tunnel for a
     stable hostname).
   - **The wallet path is unchanged and separate**: the phone must still reach
     heka-identity-service's public router (`:3003`) to fetch the `request_uri` and
     POST the presentation. Existing options apply — `adb reverse tcp:3003 tcp:3003`,
     a LAN address, or the nginx-multiplex-behind-one-tunnel recipe in
     [heka-identity-service/docs/local-config-for-heka-wallet-integration.md](../../heka-identity-service/docs/local-config-for-heka-wallet-integration.md).
     A second simultaneous ngrok tunnel may require a paid plan; the nginx multiplex
     (route `/` → bridge, `/oid4vp` + `/openId` → identity service) keeps it to one.
   - **Keycloak demo coexistence**: `OIDC_ISSUER_URL` is global. With the issuer moved
     to the ngrok URL, the imported `heka` realm's IdP config (pinned to
     `http://localhost:3005`) no longer matches — either run the two demos with
     different `.env` issuers, or update the Keycloak IdP endpoints/issuer to the
     ngrok URL so both brokers work at once.
   - **Pairwise `sub` note**: the `derived` strategy is per `client_id`, so the same
     wallet user gets a *different* `sub` through the `auth0-broker` client than
     through `keycloak-broker`. Expected and by design (pairwise privacy).

---

## 2. Bridge-side steps (OP)

The Auth0 connection is just another static client. No new endpoints, algorithms, or
auth methods are needed — RS256 (Auth0's requirement), `client_secret_basic` /
`client_secret_post`, and code-only flow are already the configured surface.

1. **Register Auth0 as a client** in `OIDC_CLIENTS`. Auth0's callback is deterministic
   per tenant: `https://<tenant>.<region>.auth0.com/login/callback` (or the tenant's
   custom domain):

   ```json
   [{
     "clientId": "auth0-broker",
     "clientSecret": "<strong secret>",
     "redirectUris": ["https://<tenant>.us.auth0.com/login/callback"],
     "loginConfigId": "default"
   }]
   ```

   No `backchannelLogoutUri`: Auth0 does not consume OIDC Back-Channel Logout tokens
   as an RP of an upstream connection (see §5).

2. **PKCE verification (the gating spike)**. `pkce.required` is `() => true` since
   P1.7. Verify against a real tenant whether Auth0's OIDC connection sends
   `code_challenge` (S256) upstream — the discovery document advertises
   `code_challenge_methods_supported`, which well-behaved RPs auto-enable from.
   - If Auth0 sends PKCE: nothing to do.
   - If not: add an explicit opt-out to the client config schema
     (`"pkceRequired": false` on the `OIDC_CLIENTS` entry, wired into
     `pkce.required(ctx, client)` per client, default `true`), so the relaxation is
     scoped to the one broker that can't send it instead of globally reverting P1.7.
     Document it in the README's protocol-policy section.

3. **Claims**: no changes. All mapped claims + `amr`, `login_config_id`,
   `vc_presented_attributes` are already in the id_token via the `openid` scope,
   which is exactly what the Auth0 quirk requires (§1 step 4 of INTEGRATION.md).

4. **Clock skew / `iat`**: `OIDC_CLOCK_TOLERANCE=15` already carries the slack; Auth0
   applies its own leeway. No change expected.

---

## 3. Auth0 tenant steps

Mirror of "Steps on the Keycloak side" (INTEGRATION.md §1 steps 6–8):

1. **Create a dev tenant** (any region). Note the tenant domain — it fixes the
   callback URL used in §2 step 1.

2. **Create the enterprise OIDC connection**: Dashboard → *Authentication →
   Enterprise → OpenID Connect → Create*:
   - **Name**: `heka-sso` (becomes the `connection` parameter value).
   - **Issuer URL**: `https://<your-name>.ngrok-free.app` — Auth0 fetches the
     discovery document and auto-fills endpoints + JWKS (the analog of pasting the
     discovery URL into Keycloak).
   - **Type: Back Channel** (authorization code + client secret at `/token`). *Not*
     Front Channel — that is `response_mode=form_post` with implicit `id_token`,
     which the bridge deliberately does not support (code-only policy).
   - **Client ID / Client Secret**: from the §2 `OIDC_CLIENTS` entry.
   - **Scopes**: `openid` is sufficient — every claim the bridge releases rides the
     `openid` scope by design. (`profile email` are harmless but buy nothing.)
   - Enable **Sync user profile attributes at each login** — the analog of the
     Keycloak mappers' sync mode `FORCE`, so re-presented credentials refresh the
     Auth0 user profile.

3. **Enable the connection** for the application(s) that should offer wallet login
   (connection → *Applications* tab).

4. **Claim propagation into the Auth0 user profile**. Standard OIDC claims
   (`given_name`, `family_name`, `email`, …) map onto the Auth0 user automatically.
   For the non-standard claims (`age_over_18`, `amr`, `login_config_id`,
   `vc_presented_attributes`) verify on the tenant which of the two mechanisms is
   needed (this is the Auth0 analog of Keycloak's Attribute Importer mappers):
   - **Connection attribute mapping** (Management API: connection `options` with
     `mapping_mode` / `attribute_map`) to land upstream id_token claims on the user
     profile / `app_metadata`; and/or
   - a **post-login Action** to copy them into the tokens Auth0 issues to the app —
     Auth0 only emits non-standard claims to applications as **namespaced custom
     claims**:

     ```js
     exports.onExecutePostLogin = async (event, api) => {
       const ns = 'https://heka.example/'
       const identity = event.user.identities.find((i) => i.connection === 'heka-sso')
       const upstream = identity?.profileData ?? {}
       for (const claim of ['age_over_18', 'amr', 'login_config_id', 'vc_presented_attributes']) {
         if (upstream[claim] !== undefined) api.idToken.setCustomClaim(`${ns}${claim}`, upstream[claim])
       }
     }
     ```

     (Exact source of the upstream claims on `event.user` to be confirmed during the
     spike — Auth0's placement of unmapped OIDC-connection claims is the main
     tenant-side unknown.)

5. **Email is optional** — the demo login config (mDL) discloses no email, and Auth0
   OIDC-connection users may exist without one. Verify first-login creates the user
   without prompting (the analog of the Keycloak realm's optional-email user profile).

6. **Test with "Try Connection"** before wiring any app — Auth0's built-in tester runs
   the full brokered loop and shows the resulting user profile, the fastest way to
   validate §2 + §3 without an RP.

---

## 4. Demo RP

Two options, in order of effort:

1. **None (MVP)**: the *Try Connection* button plus any Auth0 quickstart sample is
   enough to demonstrate the loop.
2. **Reuse `heka-sso-web-ui`**: it already speaks generic OIDC through
   `react-oidc-context` — only `src/auth.ts` is Keycloak-shaped. Generalize the env
   wiring so the authority is configurable:
   - `VITE_OIDC_AUTHORITY=https://<tenant>.us.auth0.com` (Auth0's own issuer),
     `VITE_OIDC_CLIENT_ID=<Auth0 SPA app client id>`; keep the current `VITE_KC_*`
     path as the Keycloak preset.
   - Pass `extraQueryParams: { connection: 'heka-sso' }` — the Auth0 analog of
     `kc_idp_hint` — to skip Auth0's login widget and go straight to the bridge.
   - Auth0 SPA app config: callback/logout URLs + web origin for
     `http://localhost:5173`.
   - The dashboard must read the custom claims under their **namespaced** names
     (`https://heka.example/age_over_18`, …) when talking to Auth0.

---

## 5. Logout

- Plain RP-initiated logout *at Auth0* ends only the Auth0 session — the **bridge
  session survives** (OP session TTL 24 h) and a subsequent login is silent (no new
  wallet presentation).
- **Federated logout: VERIFIED working (A6)**. With
  `logout({ logoutParams: { federated: true } })` (auth0-react/spa-js v2), Auth0
  performs a full spec-compliant RP-initiated logout against the bridge: it
  redirects the browser to the bridge's `end_session_endpoint` with a valid
  `id_token_hint`, `client_id`, and
  `post_logout_redirect_uri=https://<tenant>.auth0.com/logout`. Required on the
  bridge: register that URI in the client's `postLogoutRedirectUris`, and (for a
  seamless chain, since the hint is valid) `OIDC_LOGOUT_AUTO_CONFIRM=true`.
- **Back-channel logout**: skip — Auth0 does not receive logout_tokens for upstream
  enterprise connections. (Bridge→Auth0 back-channel logout stays Keycloak-only.)

---

## 6. Task checklist

- [ ] **A1 — Tunnel + issuer spike**: ngrok static domain up, `OIDC_ISSUER_URL`
      switched, discovery + `/jwks` reachable from the public internet over HTTPS;
      wallet path re-verified (adb reverse / nginx multiplex).
- [ ] **A2 — PKCE verification** (gating): does Auth0's OIDC connection send
      `code_challenge` S256? If not, implement the per-client `pkceRequired` opt-out
      (config schema + `pkce.required` per client + README protocol-policy note +
      unit test).
- [ ] **A3 — Auth0 tenant setup**: connection (Back Channel, scopes `openid`, sync
      attributes), `auth0-broker` client in `OIDC_CLIENTS`, *Try Connection* green,
      first-login user created without email prompt.
- [ ] **A4 — Custom-claim propagation**: verify where unmapped upstream claims land;
      configure attribute mapping and/or the post-login Action; `age_over_18` +
      `amr: ["vc"]` visible in the app-facing id_token (namespaced).
- [ ] **A5 — Demo RP**: `heka-sso-web-ui` authority generalization +
      `connection` param, or the documented Auth0-sample path.
- [x] **A6 — Logout behavior**: federated logout verified working for OIDC
      connections (see §5) — `federated: true` in the SPA's logout, Auth0's
      `/logout` registered as the client's post-logout redirect URI,
      `OIDC_LOGOUT_AUTO_CONFIRM=true` for a seamless chain.
- [ ] **A7 — AUTH0 demo guide**: fold the working recipe into a DEMO-style
      walkthrough (this doc → a sibling of [DEMO.md](DEMO.md)), including the
      troubleshooting table (interstitial page, PKCE rejection, issuer mismatch,
      unreachable `request_uri`). Counts toward P3.4.

**Acceptance**: the full loop — RP → Auth0 login (or `connection` hint) → bridge
wallet page → heka-wallet presentation → back through Auth0 — signs the user in with
`given_name`/`family_name` mapped, custom claims present in the app's id_token, a
stable pairwise `sub` across repeat logins, and zero changes to heka-identity-service
or the wallet.

---

## 7. Risks / open questions

| # | Item | Impact | Mitigation |
|---|---|---|---|
| 1 | Auth0 OIDC connection may not send PKCE | Bridge rejects `/authorize` (`invalid_request … code_challenge`) | A2: per-client opt-out, scoped, default-on |
| 2 | Placement of non-standard upstream claims in the Auth0 user profile is the least-documented part | Custom claims (esp. `amr`, `age_over_18`) might not reach the app | A4 spike: attribute mapping + Action; worst case map them onto abused-standard claims in a dedicated login config |
| 3 | ngrok free-tier interstitial + single-tunnel limit | Dev friction only | Static domain + click-through; nginx multiplex or cloudflared |
| 4 | ~~Federated logout support for OIDC connections unclear~~ **Resolved**: verified working (§5) | — | A6 done: `federated: true` + registered post-logout URI + auto-confirm |
| 5 | Issuer URL is global — Keycloak and Auth0 demos share it | Keycloak realm import pins `localhost:3005` | Run per-demo `.env`s, or repoint the realm's IdP at the tunnel URL |

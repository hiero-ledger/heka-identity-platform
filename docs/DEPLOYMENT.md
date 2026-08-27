# Deploying the platform behind ngrok — third-party wallets & OIDC brokers

How to expose **heka-sso-service** (the "Sign in with wallet" OIDC bridge) and
**heka-identity-service** (the Credo verifier/issuer) on public HTTPS URLs with
[ngrok](https://ngrok.com), so that:

- **third-party wallets** (any OID4VP/OID4VCI wallet on a phone) can fetch credential
  offers and presentation requests and post presentations, and
- **OIDC brokers** — self-hosted (Keycloak) or SaaS (Auth0, Entra External ID, Okta,
  Cognito) — can broker logins to the bridge.

All public endpoints are configured via `.env` files; no URLs are hardcoded.
Companion docs: [INTEGRATION.md](../heka-sso-service/docs/INTEGRATION.md) (bridge
design), [DEMO.md](../heka-sso-service/docs/DEMO.md) (fully local Keycloak demo),
[AUTH0-PLAN.md](../heka-sso-service/docs/AUTH0-PLAN.md) (Auth0 specifics, verified).

## 1. What must be public, and for whom

| Component | Port | Who calls it from outside | Must be public when |
|---|---|---|---|
| heka-sso-service (OIDC issuer: discovery, `/authorize`, `/token`, `/jwks`, wallet-login page) | 3005 | SaaS broker servers (discovery/JWKS/token) + the user's browser | Using any **SaaS broker**. A local dockerized Keycloak reaches the host directly and needs no tunnel. |
| heka-identity-service **Credo public router** (OID4VP `request_uri`/`direct_post`, OID4VCI offers) | 3003 | The **wallet** on the phone | Using any wallet not on the same host. Third-party wallets **require https** (their OpenID4VP libraries reject `http://` request URIs). |
| heka-identity-service API (3000), heka-auth-service (3004), web UIs (5173/…) | — | nobody external | Never — they stay local. |

Two rules that cause most breakage:

1. **One consistent origin per service.** The bridge's `issuer` in discovery, its
   endpoint URLs, and the id_token `iss` all derive from `OIDC_ISSUER_URL` — it must
   be exactly the public URL the broker was given. Brokers reject mismatches.
2. **URLs are baked in at creation time.** Credential offers, presentation requests
   (QRs), and broker connection metadata all embed the URL that was configured when
   they were created. After changing a tunnel URL: restart the service, re-create
   QRs, and re-save the broker's connection if it cached discovery.

## 2. ngrok setup

One free ngrok account suffices: one agent can run several tunnels (free plan allows
up to 3 endpoints), and includes **one static domain** — give it to the **bridge**,
whose URL must stay stable (it is the OIDC issuer registered in every broker).
The identity-service tunnel may be ephemeral; only `.env` refers to it.

```bash
ngrok config add-authtoken <your-token>
```

Define both tunnels in the agent config (`ngrok config edit`; on Windows typically
`%LOCALAPPDATA%\ngrok\ngrok.yml`):

```yaml
version: "2"
authtoken: <your-token>
tunnels:
  sso:
    proto: http
    addr: 3005
    domain: <your-static-name>.ngrok-free.app   # the free static domain
  identity:
    proto: http
    addr: 3003
```

Start both:

```bash
ngrok start sso identity
```

Note the identity tunnel's generated URL (also visible at `http://127.0.0.1:4040`).

**ngrok free-tier caveats**: browser requests get a one-time interstitial page per
session ("You are about to visit…") — server-to-server calls (broker discovery,
token exchange) and most wallet HTTP clients are unaffected; API tests can send the
`ngrok-skip-browser-warning` header. Alternative without an interstitial:
`cloudflared tunnel --url http://localhost:3005` (ephemeral URL per run).

## 3. Configure the services

### heka-sso-service (`heka-sso-service/env/.env`)

```bash
OIDC_ISSUER_URL=https://<your-static-name>.ngrok-free.app
```

Restart, then verify: `https://<static>/.well-known/openid-configuration` must show
`issuer` equal to that same URL (all endpoint URLs follow the forwarded Host —
`provider.proxy = true` is already set).

Brokers are registered as clients in `OIDC_CLIENTS` (redirect URIs per provider —
see §5). The wallet-login configuration (`OIDC_LOGIN_CONFIGS`,
`IDENTITY_SERVICE_*`) is unrelated to the tunnels and stays as in the README.

### heka-identity-service (`heka-identity-service/.env`)

```bash
# Wallet-facing OID4VC endpoint (:3003) — offers (OID4VCI) + requests (OID4VP)
AGENT_OID4VCI_ENDPOINT=https://<identity-tunnel>.ngrok-free.app

# Only for DIDComm flows with a remote wallet (embedded in DID documents):
# AGENT_HTTP_ENDPOINT=https://<identity-tunnel>.ngrok-free.app
# AGENT_WS_ENDPOINT=wss://<identity-tunnel>.ngrok-free.app
```

Unset variables fall back to `http://localhost:<port>` — fine only when the wallet
runs on/against the same machine (e.g. `adb reverse`, first-party dev builds).
Restart after every change; QRs minted before the restart still carry the old URL.

### Order of operations

1. Start tunnels → 2. set `.env` values → 3. start/restart services →
4. (re)configure the broker (§5) → 5. issue credentials (§4) → 6. run logins.

## 4. Third-party wallets

Wallets interact **only with heka-identity-service** (`:3003`), never with the
bridge or the broker:

- **Issuance**: issue the credential the login configuration asks for (default demo
  config: `vct: mDL` in **`dc+sd-jwt`** format, claims `given_name`, `family_name`,
  `age_over_18`) from heka-identity-service-web-ui and accept the OID4VCI offer QR in
  the wallet. Issue **after** the public endpoint is configured — the offer embeds it.
- **Login**: the bridge's wallet-login page shows a QR whose `request_uri` points at
  the identity tunnel; the wallet fetches the signed request, shows consent, and
  posts the presentation back to the same tunnel (`direct_post`).
- **https is mandatory** for third-party wallets: OpenID4VP client libraries reject
  `http://` request URIs by spec. (First-party heka-wallet dev builds tolerate
  `http` via Credo's `allowInsecureHttpUrls` — third-party wallets will not.)

### Mobile device over USB: `adb reverse` (Android)

For an Android phone connected over USB, `adb reverse` makes the host's services
reachable on the **phone's own `localhost`** — an alternative to tunnels for
everything that doesn't hard-require https. Forward the ports for the flows you
use:

```bash
adb reverse tcp:3003 tcp:3003   # identity service Credo public router — wallet fetches
                                #   OID4VP requests / OID4VCI offers, posts presentations
                                #   (pairs with the localhost fallback of AGENT_OID4VCI_ENDPOINT)
adb reverse tcp:3000 tcp:3000   # identity service API — e.g. issuer logo URLs
                                #   (FILE_STORAGE_FS_URL) referenced from issuer metadata
adb reverse tcp:5173 tcp:5173   # heka-sso-web-ui — open the demo RP in the phone's
                                #   browser (same-device / DC API flow)
adb reverse tcp:8080 tcp:8080   # Keycloak — when the phone's browser runs the
                                #   login loop against the local realm
adb reverse tcp:8081 tcp:8081   # Metro bundler — heka-wallet development build
                                #   loading its JS from the host
```

Verify with `adb reverse --list`. Caveats:

- Forwards do **not survive** unplugging the phone or an adb server restart —
  re-run them (or script them) after reconnecting.
- This path suits the **first-party heka-wallet dev build** only: third-party
  wallets still reject `http://localhost:3003` request URIs (https rule above) —
  they need the ngrok tunnel regardless of USB.
- Don't mix origins within one flow: if `AGENT_OID4VCI_ENDPOINT` is set to the
  tunnel URL, the wallet uses the tunnel even over USB; unset it (localhost
  fallback) to go through `adb reverse`.

## 5. OIDC broker provider types

The bridge targets the broker common denominator (INTEGRATION.md §1): authorization
code + PKCE S256, `client_secret_basic`/`client_secret_post`, RS256/ES256, and **all
claims in the id_token** (the Auth0 floor). Every broker is registered the same way —
a static client in `OIDC_CLIENTS` with the provider's callback URI:

| Provider | Type | Redirect (callback) URI to register | Notes |
|---|---|---|---|
| **Keycloak** | self-hosted | `https://<kc-host>/realms/<realm>/broker/<idp-alias>/endpoint` | Fully local setup possible without any tunnel ([DEMO.md](../heka-sso-service/docs/DEMO.md)). If the issuer moves to the ngrok URL, update the realm's IdP endpoints/issuer to match. Enable PKCE S256 in the IdP's advanced settings — Keycloak doesn't send it by default. |
| **Auth0** | SaaS | `https://<tenant>.<region>.auth0.com/login/callback` | Verified end-to-end — see [AUTH0-PLAN.md](../heka-sso-service/docs/AUTH0-PLAN.md). Enterprise OIDC connection, **Back Channel** type, sends PKCE automatically. Federated logout works: also register `https://<tenant>.<region>.auth0.com/logout` in `postLogoutRedirectUris` and set `OIDC_LOGOUT_AUTO_CONFIRM=true`. |
| **Okta** | SaaS | `https://<okta-domain>/oauth2/v1/authorize/callback` | External IdP of type OIDC. |
| **Entra External ID** | SaaS | shown in the admin center when creating the custom OIDC identity provider | Functionally expects `email` in the id_token — use a login configuration that discloses it. |
| **Cognito** | SaaS | `https://<pool-domain>.auth.<region>.amazoncognito.com/oauth2/idpresponse` | Requires a **publicly trusted CA** certificate on the issuer — ngrok/cloudflare domains qualify; requires `kid` in JWS headers (the bridge always sets it). |

Common to all SaaS providers: they fetch
`https://<issuer>/.well-known/openid-configuration` **server-side** at connection
setup and runtime — this is precisely why the bridge needs the public tunnel. Point
the provider's "issuer/discovery URL" at the bridge's static domain, set client id +
secret matching the `OIDC_CLIENTS` entry, and enable the connection for your
application.

The demo RP (`heka-sso-web-ui`) switches brokers via `VITE_AUTH_PROVIDER`
(`keycloak` | `auth0`) — see its [README](../heka-sso-web-ui/README.md).

## 6. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Broker rejects the connection or code exchange with issuer/`iss` errors | `OIDC_ISSUER_URL` ≠ the URL the broker fetched discovery from. Fix the env, restart the bridge, and **re-save the broker's connection** (it caches discovery — e.g. Auth0 stores the issuer snapshot at creation time). |
| Wallet: cannot fetch the request / offer (timeout, NXDOMAIN) | The QR embeds a dead or stale tunnel URL. Confirm the identity tunnel is up (`http://127.0.0.1:4040`), `AGENT_OID4VCI_ENDPOINT` matches it, the service was restarted, and the QR was created after the restart. |
| Third-party wallet: "must be an https url" | `AGENT_OID4VCI_ENDPOINT` is `http://` (or unset → localhost fallback). Use the https tunnel URL. |
| Bridge error page: `invalid_request … code_challenge` | The broker didn't send PKCE. Keycloak: enable PKCE S256 on the IdP. (Auth0/Okta send it automatically.) |
| Browser shows an ngrok warning page mid-login | Free-tier interstitial — click through once per session, or use a paid plan / cloudflared. |
| Everything worked yesterday, broken today | An ephemeral tunnel URL changed. Only the identity tunnel should be ephemeral: update `AGENT_OID4VCI_ENDPOINT`, restart, re-issue QRs. The bridge's static domain never changes — if you moved it, every broker connection must be updated too. |
| USB-connected wallet suddenly can't reach `localhost` services | `adb reverse` forwards are lost on unplug / adb server restart — re-run them and check `adb reverse --list` (§4). |

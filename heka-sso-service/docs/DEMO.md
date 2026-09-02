# Demo walkthrough — "Sign in with wallet" through Keycloak (P1.7)

The full broker loop of [INTEGRATION.md](INTEGRATION.md) §1 step 9, with a real wallet
presentation: **heka-sso-web-ui → Keycloak → heka-sso-service → heka-wallet → back**.
Zero wallet or bridge logic in the app — from its perspective this is plain
"log in with Keycloak".

## Components and ports

| Component | Port | Started by |
|---|---|---|
| heka-sso-web-ui (test RP) | 5173 | `yarn dev` in `heka-sso-web-ui/` |
| Keycloak (broker, realm `heka` pre-imported) | 8080 | this project's `docker-compose.dev.yml` |
| heka-sso-service (the bridge) | 3005 | `yarn start:dev` here |
| heka-sso-service Postgres | 5434 | this project's `docker-compose.dev.yml` |
| heka-auth-service (service-account tokens, P1.6.7) | 3004 | `yarn start:dev` there (+ its Postgres on 5433) |
| heka-identity-service (Credo verifier) | 3000 + 3003 | per its README (+ its Postgres on 5432) |
| heka-wallet | — | the user's phone |

## 1. Start Keycloak (+ bridge Postgres)

```bash
cd heka-sso-service
docker compose -f docker-compose.dev.yml up -d postgres keycloak
```

Keycloak imports the **`heka` realm** from [`keycloak/realm-heka.json`](../keycloak/realm-heka.json) on first start:

- **Identity Provider `heka-sso`** (OIDC): points at the bridge, **PKCE S256 enabled**,
  *Validate signatures* via the bridge's `/jwks`, *Trust Email*, *Allowed clock skew* 15s,
  sync mode `FORCE`. Server-side endpoints (`token`/`jwks`/`userinfo`) use
  `host.docker.internal:3005` (container → host); the browser-facing authorization URL and
  the `issuer` stay on `http://localhost:3005`, matching the bridge's configured issuer.
- **Attribute Importer mappers**: `given_name → firstName`, `family_name → lastName`,
  `age_over_18` and `amr` as user attributes (the realm's user profile allows unmanaged
  attributes so they are stored).
- **Client `heka-sso-web-ui`**: public, Standard Flow only, PKCE S256, redirect/logout URIs
  and web origin for `http://localhost:5173`, plus protocol mappers exposing
  `age_over_18` and `amr` in the RP's tokens.
- **User profile**: `email` is *optional* — the demo login config discloses no email
  (mDL: `given_name`, `family_name`, `age_over_18`), so first-broker-login must not
  prompt for one. First and last name arrive via the mappers.

Admin console: `http://localhost:8080` (`admin` / `admin`). If another Keycloak already
occupies port 8080, stop it first — the imported realm replaces any manual setup.

## 2. Start the platform services

In `heka-auth-service/`: start its Postgres container (port 5433) and `yarn start:dev`.
In `heka-identity-service/`: start per its README (`:3000` API, `:3003` Credo public router).

Then prepare the demo data (once): run `heka-identity-service-web-ui`'s
`prepare-demo-user` script — it registers the `demo` user in heka-auth-service, creates
the issuer/verifier DID, and the **Passport** and **mDL** schemas.

## 3. Issue the mDL credential to the wallet

In heka-identity-service-web-ui, issue an **mDL** credential in the **`vc+sd-jwt`**
format and accept it with heka-wallet (OID4VCI offer QR). This is the credential the
login requests: the identity service stamps `vct` = schema name (`mDL`), which is what
the bridge's dev login config queries (`vct_values: ["mDL"]`, claims `given_name`,
`family_name`, `age_over_18`). The mdoc variant of mDL will **not** match — the DCQL
query pins `dc+sd-jwt`.

## 4. Start the bridge

```bash
cd heka-sso-service
yarn migration:up   # first time
yarn start:dev
```

`env/.env` already carries the working dev wiring: the P1.6.7 service account
(`demo` / the demo password) against `AUTH_SERVICE_BASE_URL`, the public verifier id +
request-signer DID (signed JAR — required, no unsigned fallback), and the
`keycloak-broker` client registered for both the `heka` and `master` realm broker
endpoints.

## 5. Start the test RP

In `heka-sso-web-ui/`, set `.env`:

```
VITE_KC_URL=http://localhost:8080
VITE_KC_REALM=heka
VITE_KC_CLIENT_ID=heka-sso-web-ui
```

then `yarn dev` and open `http://localhost:5173`.

## 6. The loop

1. The app auto-redirects to Keycloak; `kc_idp_hint=heka-sso` forwards straight to the
   bridge (drop the hint in `src/auth.ts` to see Keycloak's login page with the
   "Sign in with wallet" button instead).
2. The bridge shows the login page. On a browser with the Digital Credentials API
   (e.g. Chrome on Android with a wallet installed) it offers **"Sign in with the
   wallet on this device"** (P2.1 — OS credential picker, origin-bound); otherwise —
   or via "Show a QR code instead" — it shows the QR + same-device link, "Waiting
   for the wallet…".
3. DC API path: pick the credential in the OS picker and consent in the wallet.
   QR path: scan the QR with heka-wallet, review the consent screen (given name,
   family name, age over 18), tap **Share**.
4. The page completes (DC API verifies synchronously; the QR path gets a
   WebSocket push when the presentation verifies — P3.7 — with polling as
   fallback) in the same cookie-bound tab and returns the code to Keycloak;
   first-broker-login creates the federated user.
5. The dashboard shows the brokered claims: `given_name`/`family_name` (as first/last
   name), `age_over_18`, and `amr` containing `vc`.

Sign out ends the Keycloak session **and the bridge session** (P2.5): Keycloak
redirects the browser through the bridge's `end_session` endpoint with an
`id_token_hint`; the bridge shows its **confirmation dialog** ("Do you want to
sign out…") — set `OIDC_LOGOUT_AUTO_CONFIRM=true` to skip it in the broker
chain (P2.5.1) — then destroys the OP session, and the browser returns to
Keycloak's broker logout endpoint and on to the app, where the auto-redirect
starts the loop again. The bridge also POSTs a `sid`-matched back-channel
`logout_token` to the realm's receiver
(`OIDC_ALLOW_PRIVATE_NETWORK_CALLS=true` in `env/.env` lets it reach
`localhost:8080` in dev).

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Bridge error page: `invalid_request … code_challenge` | PKCE is **required** since P1.7. A manually configured IdP (e.g. in realm `master`) must enable *PKCE S256* in its Advanced settings. |
| Wallet: "no matching credential" | The DCQL query needs `vct: mDL` as `dc+sd-jwt` — issue the mDL credential in the SD-JWT format (step 3); the mdoc variant or the Passport credential do not match. |
| `login start failed … auth-service … is unreachable` | heka-auth-service (:3004) is down — the bridge logs in there for its identity-service token (P1.6.7). |
| `login start failed … identity-service … is unreachable` | heka-identity-service (:3000) is down. |
| Keycloak: "Invalid token" / signature errors at code exchange | Keycloak container cannot reach the bridge — check `host.docker.internal` resolves (the compose adds `host-gateway`), and that the bridge runs on the host at :3005. |
| First-broker-login prompts to fill the profile | The realm import (optional email) was not applied — the realm existed before the import. Delete the `heka` realm and restart the Keycloak container, or make `email` optional in Realm settings → User profile. |
| Sign-out shows a browser error at `host.docker.internal:3005`, or the bridge session survives sign-out | The realm predates the P2.5 logout fix: the IdP's Logout URL must be the **browser-facing** `http://localhost:3005/session/end` (the bridge's session cookie lives on `localhost`, so a `host.docker.internal` redirect can never end it). Re-import the realm or fix the IdP's Logout URL by hand. |
| Wallet cannot fetch the `request_uri` (`localhost:3003`) | The phone must reach heka-identity-service's public router — on a real device use `adb reverse tcp:3003 tcp:3003` (Android) or expose `:3003` on a LAN address and set it as the identity service's public verification endpoint. |

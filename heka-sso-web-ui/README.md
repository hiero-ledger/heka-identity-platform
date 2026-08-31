# heka-sso-web-ui

Minimal test relying party (RP) for the identity-broker flow of [heka-sso-service](../heka-sso-service). It is the "protected app" in front of the brokering IdP — **Keycloak or Auth0**, selected via `VITE_AUTH_PROVIDER`: an unauthenticated visit is redirected straight to the **IdP's own login page** (no custom login screen), where the `heka-sso` "Sign in with wallet" connection brokers authentication to heka-sso-service. After login the app shows a dashboard with the brokered claims.

The app contains no wallet or bridge logic — from its perspective this is plain "log in with the IdP" via OIDC authorization code + PKCE (`react-oidc-context` for Keycloak, `@auth0/auth0-react` for Auth0). The UI is provider-agnostic: both SDKs are bridged onto one `AuthSession` contract in `src/auth/`.

## Configuration

Vite env vars (see `.env` / `.env.example`):

| Variable | Default | Description |
|---|---|---|
| `VITE_AUTH_PROVIDER` | `keycloak` | Which auth stack to use: `keycloak` or `auth0` |
| `VITE_KC_URL` | `http://localhost:8080` | Keycloak base URL |
| `VITE_KC_REALM` | `master` | Keycloak realm |
| `VITE_KC_CLIENT_ID` | `heka-sso-web-ui` | OIDC client id registered in Keycloak |
| `VITE_AUTH0_DOMAIN` | — | Auth0 tenant domain (e.g. `<tenant>.eu.auth0.com`) |
| `VITE_AUTH0_CLIENT_ID` | — | Client id of the Auth0 SPA application |
| `VITE_AUTH0_CONNECTION` | _(unset)_ | Optional: enterprise connection to forward to directly, skipping the Auth0 login widget (analog of `kc_idp_hint`) |

## Keycloak client setup

In the realm (`master` by default), create client `heka-sso-web-ui`:

- **Client authentication off** (public client, no secret)
- **Standard flow** only
- PKCE method `S256` (Advanced → Proof Key for Code Exchange Code Challenge Method)
- Valid redirect URIs: `http://localhost:5173/*`
- Valid post-logout redirect URIs: `http://localhost:5173/*`
- Web origins: `http://localhost:5173`

The `heka-sso` identity provider (the bridge) is configured separately — see [INTEGRATION.md §1](../heka-sso-service/docs/INTEGRATION.md).

## Auth0 application setup

With `VITE_AUTH_PROVIDER=auth0` the app talks to an Auth0 tenant instead (see [AUTH0-PLAN.md](../heka-sso-service/docs/AUTH0-PLAN.md)). In the tenant, create a **Single Page Application** and set for `http://localhost:5173`: Allowed Callback URLs, Allowed Logout URLs, and Allowed Web Origins. Enable the `heka-sso` enterprise OIDC connection for the application; `VITE_AUTH0_CONNECTION=heka-sso` then skips Auth0's login widget and forwards straight to the bridge. Note that non-standard brokered claims (`amr`, `vc_presented_attributes`, …) reach the app's tokens only via a post-login Action emitting them as namespaced custom claims.

## Run

```sh
yarn install
yarn dev
```

Open http://localhost:5173 — you are redirected to the Keycloak login page.

### UI preview without an IdP

`http://localhost:5173/preview.html?state=dashboard` (also `splash`, `error`, `signed-out`) mounts the app on a fake session so the screens can be checked in a browser without Keycloak/Auth0. Dev-only: `preview.html` is not part of the production build. Design tokens and the UI plan live in [docs/](docs/). Sign in (e.g. via the `heka-sso` wallet IdP button); Keycloak creates/links the federated user and redirects back to the dashboard, which lists the brokered claims (`sub`, `given_name`, `family_name`, `email`, `amr`, `vc_presented_attributes`) and the raw ID-token payload for debugging mapper configuration. "Sign out" performs RP-initiated logout at Keycloak and lands back on the Keycloak login page.

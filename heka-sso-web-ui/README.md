# heka-sso-web-ui

Minimal test relying party (RP) for the Keycloak identity-broker flow of [heka-sso-service](../heka-sso-service). It is the "protected app" in front of Keycloak: an unauthenticated visit is redirected straight to **Keycloak's own login page** (no custom login screen), where the `heka-sso` "Sign in with wallet" identity-provider button brokers authentication to heka-sso-service. After login the app shows a dashboard with the brokered claims.

The app contains no wallet or bridge logic — from its perspective this is plain "log in with Keycloak" via OIDC authorization code + PKCE (`react-oidc-context`).

## Configuration

Vite env vars (see `.env` / `.env.example`):

| Variable | Default | Description |
|---|---|---|
| `VITE_KC_URL` | `http://localhost:8080` | Keycloak base URL |
| `VITE_KC_REALM` | `master` | Keycloak realm |
| `VITE_KC_CLIENT_ID` | `heka-sso-web-ui` | OIDC client id registered in Keycloak |

## Keycloak client setup

In the realm (`master` by default), create client `heka-sso-web-ui`:

- **Client authentication off** (public client, no secret)
- **Standard flow** only
- PKCE method `S256` (Advanced → Proof Key for Code Exchange Code Challenge Method)
- Valid redirect URIs: `http://localhost:5173/*`
- Valid post-logout redirect URIs: `http://localhost:5173/*`
- Web origins: `http://localhost:5173`

The `heka-sso` identity provider (the bridge) is configured separately — see [INTEGRATION.md §1](../heka-sso-service/docs/INTEGRATION.md).

## Run

```sh
yarn install
yarn dev
```

Open http://localhost:5173 — you are redirected to the Keycloak login page. Sign in (e.g. via the `heka-sso` wallet IdP button); Keycloak creates/links the federated user and redirects back to the dashboard, which lists the brokered claims (`sub`, `given_name`, `family_name`, `email`, `amr`, `vc_presented_attributes`) and the raw ID-token payload for debugging mapper configuration. "Sign out" performs RP-initiated logout at Keycloak and lands back on the Keycloak login page.

# heka-keycloak-theme

A **light-touch** Keycloak login theme for the OID4VP SSO Demo realm, built with [Keycloakify](https://www.keycloakify.dev/) v11 (React + Vite). Plan and rationale: [heka-sso-web-ui/docs/UI-PLAN.md §2.5 / Phase K](../heka-sso-web-ui/docs/UI-PLAN.md).

It deliberately does **not** clone the relying party's look: Keycloak is a different party on a different domain (the identity provider), and the demo should let the audience feel that hand-off. The theme only makes the stock login page presentable — a calm background, a rounded card and controls, its own neutral palette — and adds an identity line under the card ("You are signing in through *OID4VP SSO Demo*, the identity provider for *CivicTrust Demo*").

What is customised:

| File | Role |
|---|---|
| `src/login/theme.css` | The whole look: background, card/control radii, slate palette, identity-line typography. Layered over Keycloak's default CSS (`doUseDefaultCss` stays on) |
| `src/login/Template.tsx` | Ejected Keycloakify template + the identity line under the card |
| `src/login/pages/Login.tsx` | Ejected `login.ftl` (markup unchanged; kept ejected so the IdP button and form can be adjusted without forking more) |
| `src/login/i18n.ts` | One custom message (`hekaIdentityNote`) |
| `vite.config.ts` | `themeName: "heka"`, `HEKA_APP_NAME` theme property (default `CivicTrust Demo`) |

Every other page keeps Keycloakify's defaults inside the same template, so it inherits the background and card for free.

## Develop

```sh
yarn install
yarn storybook          # http://localhost:6006 — login/login.ftl stories (Heka demo realm, error state)
```

## Build the jar

Requires Java and Maven on the `PATH` (Keycloakify packages the theme with Maven).

```sh
yarn build-keycloak-theme
# → dist_keycloak/keycloak-theme-for-kc-all-other-versions.jar   (Keycloak 26+, what the demo uses)
# → dist_keycloak/keycloak-theme-for-kc-22-to-25.jar
```

## Use it in the demo realm

`heka-sso-service/docker-compose.dev.yml` rebuilds the jar in a `keycloak-theme-builder` container (from [Dockerfile.builder](Dockerfile.builder), so no local Java/Maven needed) on every `up`, hands it to Keycloak through a shared volume, and disables theme caching in dev; `heka-sso-service/keycloak/realm-heka.json` sets `"loginTheme": "heka"`. To pick up theme changes, just restart Keycloak — the builder reruns first:

```sh
cd ../heka-sso-service && docker compose -f docker-compose.dev.yml up -d --force-recreate keycloak
```

To see the page in the demo chain, run the RP with `VITE_KC_IDP_HINT=` (empty) so Keycloak's login page is not skipped.

The application name in the identity line can be changed per realm without a rebuild: Realm settings → Themes → `HEKA_APP_NAME` (Keycloakify environment variable).

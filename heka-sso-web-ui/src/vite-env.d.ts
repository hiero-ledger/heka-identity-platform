/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

interface ImportMetaEnv {
  /** `keycloak` (default) or `auth0` */
  readonly VITE_AUTH_PROVIDER?: string
  readonly VITE_KC_URL: string
  readonly VITE_KC_REALM: string
  readonly VITE_KC_CLIENT_ID: string
  /** Keycloak IdP alias to forward to (`kc_idp_hint`); default `heka-sso`, empty disables. */
  readonly VITE_KC_IDP_HINT?: string
  readonly VITE_AUTH0_DOMAIN: string
  readonly VITE_AUTH0_CLIENT_ID: string
  readonly VITE_AUTH0_CONNECTION?: string
  /** `true` (default): unauthenticated visits redirect to the IdP; `false`: land on the Welcome screen. */
  readonly VITE_AUTO_SIGN_IN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

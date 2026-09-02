/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

interface ImportMetaEnv {
  /** `keycloak` (default) or `auth0` */
  readonly VITE_AUTH_PROVIDER?: string
  readonly VITE_KC_URL: string
  readonly VITE_KC_REALM: string
  readonly VITE_KC_CLIENT_ID: string
  readonly VITE_AUTH0_DOMAIN: string
  readonly VITE_AUTH0_CLIENT_ID: string
  readonly VITE_AUTH0_CONNECTION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

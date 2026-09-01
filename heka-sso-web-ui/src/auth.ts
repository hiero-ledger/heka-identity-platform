import type { AuthProviderProps } from 'react-oidc-context'

const kcUrl: string = import.meta.env.VITE_KC_URL
const kcRealm: string = import.meta.env.VITE_KC_REALM
const kcClientId: string = import.meta.env.VITE_KC_CLIENT_ID

export const authConfig: AuthProviderProps = {
  authority: `${kcUrl}/realms/${kcRealm}`,
  client_id: kcClientId,
  redirect_uri: window.location.origin,
  post_logout_redirect_uri: window.location.origin,
  response_type: 'code',
  scope: 'openid profile email',
  onSigninCallback: () => {
    // Strip code/state from the URL after the redirect returns
    window.history.replaceState({}, document.title, window.location.pathname)
  },
  extraQueryParams: {
    kc_idp_hint: "heka-sso",
  },
}

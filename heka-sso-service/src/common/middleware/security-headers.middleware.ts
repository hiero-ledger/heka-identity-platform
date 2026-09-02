import helmet from 'helmet'

/**
 * Baseline security headers for the whole OP surface (provider endpoints and
 * the Nest routes alike). Registered ahead of the `oidc-provider` mount in
 * `MainModule.appConfigure` — `node-oidc-provider` deliberately ships without
 * helmet and leaves response hardening to the deployer.
 *
 * Deliberately narrow for now:
 * - framing is denied everywhere (`X-Frame-Options: DENY` + CSP
 *   `frame-ancestors 'none'`): nothing served by an OP — login page, consent,
 *   `form_post` response page, error pages — should ever be embeddable, and the
 *   wallet login page carries a single-use authorization request that must not
 *   be clickjackable;
 * - the rest of the CSP is left unset (`useDefaults: false`): the login page
 *   uses an inline script and a `data:` QR image, and the provider's
 *   `form_post` page needs to post to the RP, which helmet's default
 *   `script-src 'self'` / `form-action 'self'` would both break. A full CSP is
 *   a separate, page-aware pass;
 * - `Cross-Origin-Opener-Policy` is disabled: RPs may open the OP in a popup
 *   and rely on `window.opener`, which COOP `same-origin` would sever.
 *
 * Caching is *not* handled here: `no-store` is scoped to the interaction
 * routes (`noStoreMiddleware`) — discovery and JWKS must stay cacheable and the
 * provider already emits `no-store` on its own sensitive endpoints.
 */
export const securityHeaders = () =>
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        // frame-ancestors only — no default-src on purpose (see above); helmet
        // requires the explicit opt-out for that.
        'default-src': helmet.contentSecurityPolicy.dangerouslyDisableDefaultSrc,
        'frame-ancestors': ["'none'"],
      },
    },
    frameguard: { action: 'deny' },
    crossOriginOpenerPolicy: false,
  })

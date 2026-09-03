import helmet from 'helmet'

/**
 * Baseline security headers for the whole OP.
 * - framing is denied everywhere (`X-Frame-Options: DENY` + CSP `frame-ancestors 'none'`);
 * - the rest of the CSP is left unset (`useDefaults: false`);
 * - `Cross-Origin-Opener-Policy` is disabled: RPs may open the OP in a popup and rely on `window.opener`.
 */
export const securityHeaders = () =>
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': helmet.contentSecurityPolicy.dangerouslyDisableDefaultSrc,
        'frame-ancestors': ["'none'"],
      },
    },
    frameguard: { action: 'deny' },
    crossOriginOpenerPolicy: false,
  })

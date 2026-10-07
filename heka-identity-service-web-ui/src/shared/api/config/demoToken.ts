import axios from 'axios';

/**
 * Token for the public demo pages, fetched at runtime from the identity service's demo-token
 * broker (`GET /demo/token`, enabled there with `DEMO_*`). It is the short-lived Client Credentials
 * token of a dedicated demo service account; nothing is baked into the bundle any more.
 */
export const demoTokenEndpoint = '/demo/token';

/** Re-fetch this long before the broker's `expires_in` elapses. */
const REFRESH_MARGIN_MS = 30_000;
/** Lifetime assumed when the broker does not report one. */
const FALLBACK_LIFETIME_MS = 60_000;

interface DemoTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

let cached: { token: string; refreshAt: number } | null = null;
let inFlight: Promise<string> | null = null;

const fetchDemoToken = async (): Promise<string> => {
  const { data } = await axios.get<DemoTokenResponse>(
    `${process.env.REACT_APP_AGENCY_ENDPOINT}${demoTokenEndpoint}`,
  );
  if (!data?.access_token) {
    throw new Error('Demo token broker returned no access token');
  }
  const lifetimeMs =
    typeof data.expires_in === 'number' && data.expires_in > 0
      ? data.expires_in * 1000
      : FALLBACK_LIFETIME_MS;
  cached = {
    token: data.access_token,
    refreshAt:
      Date.now() + Math.max(lifetimeMs - REFRESH_MARGIN_MS, lifetimeMs / 2),
  };
  return cached.token;
};

/** The cached demo token, or a fresh one when none is cached or it is about to expire. */
export const getDemoAccessToken = (): Promise<string> => {
  if (cached && Date.now() < cached.refreshAt) {
    return Promise.resolve(cached.token);
  }
  if (!inFlight) {
    inFlight = fetchDemoToken().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
};

/** Forgets the cached token, e.g. after the identity service rejected it. */
export const invalidateDemoAccessToken = () => {
  cached = null;
};

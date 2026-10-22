export const connectionLabel = 'Agency Demo';

export const mainDidMethod = 'key';

/**
 * Pre-provisioned demo account used by the public demo pages without signing in. Only its DID
 * is known at build time (written by scripts/prepare-demo-user.ts); the access token is fetched
 * at runtime from the identity service's demo-token broker (shared/api/config/demoToken.ts).
 */
export const demoUser = {
  did: process.env.REACT_APP_DEMO_USER_DID ?? '',
};

export const baseDisplayMetadata = {
  background_color: '#171717',
  logo: {
    url: 'https://cdn.theorg.com/fda49f46-96e2-49b8-99aa-0ff5165953b7_medium.jpg',
  },
};

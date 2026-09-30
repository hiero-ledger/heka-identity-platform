/**
 * Lets non-React code (the axios interceptors, thunks) reach the current session without
 * importing the OIDC client: `OidcAuthProvider` registers an implementation while mounted.
 */
export interface SessionBridge {
  /** Current access token, or `null` when signed out. */
  getAccessToken: () => string | null;
  /** Renews the session with the refresh token; resolves to the new token or `null` when renewal failed. */
  refresh: () => Promise<string | null>;
  /** Forgets the session locally (no provider round trip), e.g. after a failed renewal. */
  dropSession: () => Promise<void>;
  /** RP-initiated logout at the provider. */
  signOut: () => Promise<void>;
}

let bridge: SessionBridge | null = null;

export const registerSessionBridge = (implementation: SessionBridge | null) => {
  bridge = implementation;
};

export const getSessionAccessToken = (): string | null =>
  bridge?.getAccessToken() ?? null;

export const refreshSessionToken = (): Promise<string | null> =>
  bridge ? bridge.refresh() : Promise.resolve(null);

export const dropSession = (): Promise<void> =>
  bridge ? bridge.dropSession() : Promise.resolve();

export const signOutSession = (): Promise<void> =>
  bridge ? bridge.signOut() : Promise.resolve();

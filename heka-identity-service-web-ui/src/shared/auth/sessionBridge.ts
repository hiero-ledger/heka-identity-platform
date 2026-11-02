import { Mutex } from 'async-mutex';

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

const renewMutex = new Mutex();

/**
 * Renews the session after `staleToken` was rejected. One renewal runs at a time; if the
 * session already holds a newer token, that one is returned without another refresh grant.
 */
export const renewSessionToken = (
  staleToken: string | null,
): Promise<string | null> =>
  renewMutex.runExclusive(() => {
    const currentToken = getSessionAccessToken();
    if (currentToken && currentToken !== staleToken) return currentToken;
    return refreshSessionToken();
  });

export const dropSession = (): Promise<void> =>
  bridge ? bridge.dropSession() : Promise.resolve();

export const signOutSession = (): Promise<void> =>
  bridge ? bridge.signOut() : Promise.resolve();

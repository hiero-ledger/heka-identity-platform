import { act } from '@testing-library/react';

import { userActions } from '@/entities/User';
import { agencyApi } from '@/shared/api/rtk/agencyApi';

import { createTestStore, MockApi } from './renderWithProviders';

type TestStore = ReturnType<typeof createTestStore>;

/** How many requests the mock client sent to `url` (exact match) with the given method */
export const requestsTo = (
  api: MockApi,
  url: string,
  method: keyof MockApi = 'get',
) => api[method].mock.calls.filter(([calledUrl]) => calledUrl === url).length;

/** Cache keys of the entries in the RTK Query cache */
export const cachedQueries = (store: TestStore) =>
  Object.keys(store.getState().agencyApi.queries);

/**
 * Fake timers for cache lifetimes. Promises keep resolving on their own: only the timers
 * (`keepUnusedDataFor`) wait for `jest.advanceTimersByTime`.
 */
export const useLifetimeTimers = () =>
  jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });

/**
 * What `SessionBridge` dispatches when the OIDC session drops (failed renewal, removed user):
 * the token mirror is cleared, then the cache is reset. Waits until mounted query hooks have
 * reacted (subscribers are notified on an animation frame).
 */
export const dropSessionWhileMounted = async (store: TestStore) => {
  act(() => {
    store.dispatch(userActions.clearSession());
    store.dispatch(agencyApi.util.resetApiState());
  });
  await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
};

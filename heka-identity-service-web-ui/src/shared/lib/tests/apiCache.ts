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

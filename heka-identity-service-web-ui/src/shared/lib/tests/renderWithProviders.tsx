import { render, RenderOptions } from '@testing-library/react';
import { AxiosInstance } from 'axios';
import { ReactElement } from 'react';
import { Provider } from 'react-redux';
import {
  MemoryRouter,
  MemoryRouterProps,
  Route,
  Routes,
} from 'react-router-dom';

import '@/translations';
import { createReduxStore, StateSchema } from '@/app/providers/StoreProvider';
import { AuthSession, AuthSessionContext } from '@/shared/auth/session';

/** Axios-shaped mock whose HTTP methods are `jest.fn()`s; stub them per test with `mockResolvedValue`. */
export type MockApi = {
  get: jest.Mock;
  post: jest.Mock;
  put: jest.Mock;
  patch: jest.Mock;
  delete: jest.Mock;
};

export const createMockApi = (): MockApi => ({
  get: jest.fn().mockResolvedValue({ data: undefined }),
  post: jest.fn().mockResolvedValue({ data: undefined }),
  put: jest.fn().mockResolvedValue({ data: undefined }),
  patch: jest.fn().mockResolvedValue({ data: undefined }),
  delete: jest.fn().mockResolvedValue({ data: undefined }),
});

export const createTestSession = (
  overrides: Partial<AuthSession> = {},
): AuthSession => ({
  provider: 'keycloak',
  isAuthenticated: true,
  isLoading: false,
  userName: 'Test User',
  signIn: jest.fn().mockResolvedValue(undefined),
  signOut: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

/** A real store with the app's reducers; thunks talk to the given mock APIs. */
export const createTestStore = (
  initialState: Partial<StateSchema> = {},
  api: MockApi = createMockApi(),
  demoApi: MockApi = createMockApi(),
) =>
  createReduxStore(initialState as StateSchema, undefined, {
    agencyApi: api as unknown as AxiosInstance,
    agencyDemoApi: demoApi as unknown as AxiosInstance,
  });

export interface RenderWithProvidersOptions
  extends Omit<RenderOptions, 'wrapper'> {
  initialState?: Partial<StateSchema>;
  api?: MockApi;
  demoApi?: MockApi;
  /** Current location, e.g. `'/issue'` or `{ pathname: '/issue', state: {...} }` */
  route?: NonNullable<MemoryRouterProps['initialEntries']>[number];
  /** Route pattern to mount the element under, for components that read `useParams` */
  path?: string;
  session?: Partial<AuthSession>;
  /** A store to render with (e.g. to spy on its `dispatch`); built from `initialState` otherwise */
  store?: ReturnType<typeof createTestStore>;
}

/**
 * Renders `ui` inside the app's providers: a real Redux store (API clients mocked), a memory
 * router, the auth session context and the English translations.
 */
export const renderWithProviders = (
  ui: ReactElement,
  {
    initialState,
    api = createMockApi(),
    demoApi = createMockApi(),
    route = '/',
    path,
    session,
    store = createTestStore(initialState, api, demoApi),
    ...renderOptions
  }: RenderWithProvidersOptions = {},
) => {
  const authSession = createTestSession(session);

  const result = render(
    <Provider store={store}>
      <AuthSessionContext.Provider value={authSession}>
        <MemoryRouter initialEntries={[route]}>
          {path ? (
            <Routes>
              <Route
                path={path}
                element={ui}
              />
            </Routes>
          ) : (
            ui
          )}
        </MemoryRouter>
      </AuthSessionContext.Provider>
    </Provider>,
    renderOptions,
  );

  return { ...result, store, api, demoApi, session: authSession };
};

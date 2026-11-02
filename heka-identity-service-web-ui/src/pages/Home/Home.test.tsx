import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';
import { Route, Routes } from 'react-router-dom';

import { StateSchema } from '@/app/providers/StoreProvider';
import { userActions } from '@/entities/User';
import {
  createMockApi,
  MockApi,
  renderWithProviders,
} from '@/shared/lib/tests/renderWithProviders';

import Home from './Home';

const userState = (signedIn: boolean): Partial<StateSchema> => ({
  user: {
    isLoading: false,
    isPreparing: false,
    data: {
      name: signedIn ? 'Jane' : null,
      tokens: { accessToken: signedIn ? 'token' : null },
    },
  },
});

const mockApi = (registeredAt?: string) => {
  const api = createMockApi();
  api.get.mockImplementation((url: string) =>
    Promise.resolve({
      data: url === '/user' ? { name: 'ACME', registeredAt } : undefined,
    }),
  );
  api.post.mockResolvedValue({ data: { did: 'did:key:z6Mk' } });
  return api;
};

const userRequests = (api: MockApi) =>
  api.get.mock.calls.filter(([url]) => url === '/user');

const renderHome = (signedIn: boolean, registeredAt?: string) =>
  renderWithProviders(
    <Routes>
      <Route
        path="/"
        element={<Home />}
      />
      <Route
        path="/demo"
        element={<p>demo page</p>}
      />
      <Route
        path="/age-demo"
        element={<p>age demo page</p>}
      />
      <Route
        path="/profile"
        element={<p>profile page</p>}
      />
    </Routes>,
    { initialState: userState(signedIn), api: mockApi(registeredAt) },
  );

describe('Home', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      blob: () => Promise.resolve(new Blob(['png'], { type: 'image/png' })),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    localStorage.clear();
  });

  test('prepares the wallet of a registered user and starts the demos', async () => {
    const user = userEvent.setup();
    const { api } = renderHome(true, '2026-01-01T00:00:00Z');

    expect(
      await screen.findByText('Welcome to Self-Sovereign Identity'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/prepare-wallet',
        expect.any(FormData),
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Get started' })).toBeEnabled(),
    );

    await user.click(screen.getByRole('button', { name: 'Get started' }));
    expect(screen.getByText('demo page')).toBeInTheDocument();
  });

  test('opens the age verification demo', async () => {
    const user = userEvent.setup();
    renderHome(true, '2026-01-01T00:00:00Z');

    const button = await screen.findByRole('button', {
      name: 'Age verification via mDL',
    });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);

    expect(screen.getByText('age demo page')).toBeInTheDocument();
  });

  test('sends a first-time user to the profile', async () => {
    renderHome(true);

    expect(await screen.findByText('profile page')).toBeInTheDocument();
  });

  test('shows the demos to signed-out visitors without preparing a wallet', async () => {
    const { api } = renderHome(false);

    expect(
      await screen.findByRole('button', { name: 'Get started' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('profile page')).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  test('does not request a profile for signed-out visitors', async () => {
    const toastError = jest.spyOn(toast, 'error');
    const { api } = renderHome(false);

    await screen.findByRole('button', { name: 'Get started' });
    // Let any request the page would make settle
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(userRequests(api)).toHaveLength(0);
    // The identity service would answer "Authorization token is missing"
    expect(toastError).not.toHaveBeenCalled();
    toastError.mockRestore();
  });

  test('requests the profile of a signed-in user once', async () => {
    const { api } = renderHome(true, '2026-01-01T00:00:00Z');

    await screen.findByRole('button', { name: 'Get started' });
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(userRequests(api)).toHaveLength(1);
  });

  test('a registered user who signs in on this page stays on it', async () => {
    const { store } = renderHome(false, '2026-01-01T00:00:00Z');
    await screen.findByRole('button', { name: 'Get started' });

    act(() => {
      store.dispatch(
        userActions.setSession({ accessToken: 'token', name: 'Jane' }),
      );
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(screen.queryByText('profile page')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get started' })).toBeEnabled();
  });

  test('stays home when the profile cannot be loaded', async () => {
    const api = mockApi();
    api.get.mockRejectedValue({
      response: { status: 500, data: { message: 'Profile unavailable' } },
    });
    renderWithProviders(
      <Routes>
        <Route
          path="/"
          element={<Home />}
        />
        <Route
          path="/profile"
          element={<p>profile page</p>}
        />
      </Routes>,
      { initialState: userState(true), api },
    );

    expect(
      await screen.findByRole('button', { name: 'Get started' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('profile page')).not.toBeInTheDocument();
  });
});

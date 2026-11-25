import { screen, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import { Route, Routes } from 'react-router-dom';

import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { LocationDisplay } from '@/shared/lib/tests/LocationDisplay';
import {
  createMockApi,
  renderWithProviders,
} from '@/shared/lib/tests/renderWithProviders';

import GithubCallback from './GithubCallback';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn(), success: jest.fn() },
}));

const renderAt = (route: string, api = createMockApi()) => {
  renderWithProviders(
    <Routes>
      <Route
        path="/github/callback"
        element={<GithubCallback />}
      />
      <Route
        path="*"
        element={<LocationDisplay />}
      />
    </Routes>,
    { api, route },
  );
  return api;
};

describe('GithubCallback', () => {
  test("posts GitHub's code and state and continues the onboarding", async () => {
    const api = createMockApi();
    api.post.mockResolvedValue({
      data: { linked: true, githubUsername: 'octocat' },
    });

    renderAt('/github/callback?code=code-1&state=state-1', api);

    expect(await screen.findByTestId('location')).toHaveTextContent(
      '/contributor/onboarding',
    );
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith(agencyEndpoints.completeGithubLink, {
      code: 'code-1',
      state: 'state-1',
    });
    expect(toast.success).toHaveBeenCalledWith(
      'Linked GitHub account @octocat.',
    );
  });

  test("a failed link shows the identity service's message once and returns to the hub", async () => {
    const api = createMockApi();
    api.post.mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { message: 'The link has expired' } },
    });

    renderAt('/github/callback?code=code-1&state=state-1', api);

    expect(await screen.findByTestId('location')).toHaveTextContent(
      /^\/contributor$/,
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith('The link has expired');
  });

  test.each([
    ['without a code', '/github/callback?state=state-1'],
    ['without a state', '/github/callback?code=code-1'],
    [
      'with an error',
      '/github/callback?error=access_denied&code=code-1&state=state-1',
    ],
  ])('a callback %s is not posted', async (_, route) => {
    const api = renderAt(route);

    expect(await screen.findByTestId('location')).toHaveTextContent(
      /^\/contributor$/,
    );
    expect(api.post).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      'GitHub did not return the parameters needed to link the account.',
    );
  });
});

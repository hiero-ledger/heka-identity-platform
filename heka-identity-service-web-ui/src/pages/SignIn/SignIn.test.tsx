import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';

import { StateSchema } from '@/app/providers/StoreProvider';
import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';

import SignInView from './SignIn';

const userState = (accessToken: string | null): Partial<StateSchema> => ({
  user: {
    isLoading: false,
    isPreparing: false,
    data: { name: null, tokens: { accessToken } },
  },
});

const renderSignIn = (
  options: Parameters<typeof renderWithProviders>[1] = {},
) =>
  renderWithProviders(
    <Routes>
      <Route
        path="/sign-in"
        element={<SignInView />}
      />
      <Route
        path="/"
        element={<p>home page</p>}
      />
    </Routes>,
    { route: '/sign-in', initialState: userState(null), ...options },
  );

describe('SignInView', () => {
  test('starts the provider sign-in', async () => {
    const user = userEvent.setup();
    const { session } = renderSignIn();

    expect(
      screen.queryByRole('button', { name: 'Create account' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(session.signIn).toHaveBeenCalled();
  });

  test('offers registration when the provider supports it', async () => {
    const user = userEvent.setup();
    const signUp = jest.fn().mockResolvedValue(undefined);
    renderSignIn({ session: { signUp } });

    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(signUp).toHaveBeenCalled();
  });

  test('shows the sign-in error', () => {
    renderSignIn({ session: { error: 'Access denied' } });

    expect(screen.getByRole('alert')).toHaveTextContent('Access denied');
  });

  test('redirects signed-in users home', () => {
    renderSignIn({ initialState: userState('token') });

    expect(screen.getByText('home page')).toBeInTheDocument();
  });
});

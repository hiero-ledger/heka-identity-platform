import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';

import { StateSchema } from '@/app/providers/StoreProvider';
import { setViewportWidth } from '@/components/testUtils/viewport';
import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';

// Forward clicks on the mobile sign-in icon
jest.mock('@/shared/assets/icons/logout.svg', () => ({
  __esModule: true,
  default: (props: { onClick?: () => void }) =>
    props.onClick ? (
      <button
        type="button"
        aria-label="sign in icon"
        onClick={props.onClick}
      />
    ) : (
      <span />
    ),
}));

import AuthenticatedLayout from './AuthenticatedLayout';
import UnauthenticatedLayout from './UnauthenticatedLayout';

const userState = (signedIn: boolean): Partial<StateSchema> => ({
  user: {
    isLoading: false,
    isPreparing: false,
    data: {
      name: signedIn ? 'Jane Doe' : null,
      tokens: { accessToken: signedIn ? 'token' : null },
    },
  },
});

const renderLayout = (
  layout: React.ReactElement,
  route: string,
  signedIn: boolean,
) =>
  renderWithProviders(
    <Routes>
      <Route element={layout}>
        <Route
          path="/"
          element={<p>home page</p>}
        />
        <Route
          path="/demo"
          element={<p>demo page</p>}
        />
        <Route
          path="/profile"
          element={<p>profile page</p>}
        />
        <Route
          path="/sign-in"
          element={<p>sign in page</p>}
        />
      </Route>
    </Routes>,
    { route, initialState: userState(signedIn) },
  );

describe('AuthenticatedLayout', () => {
  afterEach(() => setViewportWidth(1024));

  test('renders the sidebar and the page on desktop', async () => {
    const user = userEvent.setup();

    renderLayout(<AuthenticatedLayout />, '/demo', true);

    expect(screen.getByText('demo page')).toBeInTheDocument();
    expect(screen.getByText('Issue credential')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Heka Identity Service' }),
    );
    expect(screen.getByText('home page')).toBeInTheDocument();
  });

  test('renders the mobile header with the profile button', async () => {
    setViewportWidth(400);
    const user = userEvent.setup();

    renderLayout(<AuthenticatedLayout />, '/demo', true);

    expect(screen.getByText('demo page')).toBeInTheDocument();
    expect(screen.getByText('Issue')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Jane Doe' }));
    expect(screen.getByText('profile page')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Heka Identity Service' }),
    );
    expect(screen.getByText('home page')).toBeInTheDocument();
  });

  test('offers sign in on mobile when signed out', async () => {
    setViewportWidth(400);
    const user = userEvent.setup();

    renderLayout(<AuthenticatedLayout />, '/demo', false);

    expect(
      screen.queryByRole('button', { name: 'Jane Doe' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'sign in icon' }));
    expect(screen.getByText('sign in page')).toBeInTheDocument();
  });
});

describe('UnauthenticatedLayout', () => {
  afterEach(() => setViewportWidth(1024));

  test('renders the sign-in panel and navigates back home', async () => {
    const user = userEvent.setup();

    renderLayout(<UnauthenticatedLayout />, '/sign-in', false);

    expect(screen.getByText('sign in page')).toBeInTheDocument();
    expect(screen.getByText('Sign in')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('home page')).toBeInTheDocument();
  });

  test('navigates home from the logo on mobile', async () => {
    setViewportWidth(400);
    const user = userEvent.setup();

    renderLayout(<UnauthenticatedLayout />, '/sign-in', false);

    expect(screen.getByText('Sign in')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Heka Identity Service' }),
    );
    expect(screen.getByText('home page')).toBeInTheDocument();
  });
});

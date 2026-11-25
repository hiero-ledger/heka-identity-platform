import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';

import { StateSchema } from '@/app/providers/StoreProvider';
import { LocationDisplay } from '@/shared/lib/tests/LocationDisplay';
import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';

import { DesktopNavigationMenu, MobileNavigationMenu } from './NavigationMenu';

// The menus are built when the module loads (NavigationMenu.contributorVerification.test.tsx has the feature on)
jest.mock('@/shared/config/features', () => ({
  features: { revocation: true, contributorVerification: false },
}));

const signedInState: Partial<StateSchema> = {
  user: {
    isLoading: false,
    isPreparing: false,
    data: { name: 'Jane Doe', tokens: { accessToken: 'token' } },
  },
};

const signedOutState: Partial<StateSchema> = {
  user: {
    isLoading: false,
    isPreparing: false,
    data: { name: null, tokens: { accessToken: null } },
  },
};

const renderMenu = (
  menu: React.ReactElement,
  initialState: Partial<StateSchema>,
  route = '/',
) =>
  renderWithProviders(
    <>
      {menu}
      <Routes>
        <Route
          path="*"
          element={<LocationDisplay />}
        />
      </Routes>
    </>,
    { initialState, route },
  );

const location = () => screen.getByTestId('location');

describe('DesktopNavigationMenu', () => {
  test('navigates between sections when signed in', async () => {
    const user = userEvent.setup();

    renderMenu(<DesktopNavigationMenu />, signedInState);

    await user.click(screen.getByText('Issue credential'));
    expect(location()).toHaveTextContent('/issue-credential/templates');

    await user.click(screen.getByText('Verify credential'));
    expect(location()).toHaveTextContent('/verify-credential/templates');

    await user.click(screen.getByText('Demo'));
    expect(location()).toHaveTextContent(/^\/$/);
  });

  test('menu items are links operable from the keyboard', async () => {
    const user = userEvent.setup();

    renderMenu(<DesktopNavigationMenu />, signedInState);

    const issue = screen.getByRole('link', { name: 'Issue credential' });
    issue.focus();
    await user.keyboard('{Enter}');
    expect(location()).toHaveTextContent('/issue-credential/templates');
    expect(
      screen.getByRole('link', { name: 'Issue credential' }),
    ).toHaveAttribute('aria-current', 'page');

    // Like a native link, Space does not follow it
    screen.getByRole('link', { name: 'Verify credential' }).focus();
    await user.keyboard(' ');
    expect(location()).toHaveTextContent('/issue-credential/templates');
  });

  test('Issue credential is the current section on the issued credentials page', () => {
    renderMenu(
      <DesktopNavigationMenu />,
      signedInState,
      '/issue-credential/issued-credentials',
    );

    expect(
      screen.getByRole('link', { name: 'Issue credential' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('menu items are disabled for the keyboard while the wallet is prepared', async () => {
    const user = userEvent.setup();

    renderMenu(<DesktopNavigationMenu />, {
      user: { ...signedInState.user!, isPreparing: true },
    });

    const issue = screen.getByRole('link', { name: 'Issue credential' });
    expect(issue).toHaveAttribute('aria-disabled', 'true');
    expect(issue).toHaveAttribute('tabindex', '-1');
    issue.focus();
    await user.keyboard('{Enter}');
    expect(location()).toHaveTextContent(/^\/$/);
  });

  test('has no Contributor Hub item while contributor verification is off', () => {
    renderMenu(<DesktopNavigationMenu />, signedInState);

    expect(screen.getAllByRole('link')).toHaveLength(3);
    expect(screen.queryByText('Contributor Hub')).not.toBeInTheDocument();
  });

  test('opens the profile from the user button', async () => {
    const user = userEvent.setup();

    renderMenu(<DesktopNavigationMenu />, signedInState, '/demo');

    await user.click(screen.getByRole('button', { name: 'Jane Doe' }));
    expect(location()).toHaveTextContent('/profile');
  });

  test('sends signed-out users to sign in', async () => {
    const user = userEvent.setup();

    renderMenu(<DesktopNavigationMenu />, signedOutState);

    expect(
      screen.queryByRole('button', { name: 'Jane Doe' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByText('Issue credential'));
    expect(location()).toHaveTextContent('/sign-in');

    await user.click(screen.getByText('Demo'));
    expect(location()).toHaveTextContent(/^\/$/);

    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(location()).toHaveTextContent('/sign-in');
  });
});

describe('MobileNavigationMenu', () => {
  test('navigates between sections when signed in', async () => {
    const user = userEvent.setup();

    renderMenu(<MobileNavigationMenu />, signedInState, '/demo');

    await user.click(screen.getByText('Issue'));
    expect(location()).toHaveTextContent('/issue-credential/templates');

    await user.click(screen.getByText('Verify'));
    expect(location()).toHaveTextContent('/verify-credential/templates');
  });

  test('has no Contributor Hub item while contributor verification is off', () => {
    renderMenu(<MobileNavigationMenu />, signedInState);

    expect(screen.getAllByRole('link')).toHaveLength(3);
    expect(screen.queryByText('Contributor Hub')).not.toBeInTheDocument();
  });

  test('sends signed-out users to sign in', async () => {
    const user = userEvent.setup();

    renderMenu(<MobileNavigationMenu />, signedOutState, '/demo');

    await user.click(screen.getByText('Verify'));
    expect(location()).toHaveTextContent('/sign-in');

    await user.click(screen.getByText('Demo'));
    expect(location()).toHaveTextContent(/^\/$/);
  });
});

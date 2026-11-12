import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';

import { StateSchema } from '@/app/providers/StoreProvider';
import { LocationDisplay } from '@/shared/lib/tests/LocationDisplay';
import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';

import { DesktopNavigationMenu, MobileNavigationMenu } from './NavigationMenu';

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

  test('shows DIDs directly before Issue credential and opens the DID list (AC1)', async () => {
    const user = userEvent.setup();

    renderMenu(<DesktopNavigationMenu />, signedInState);

    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(
      ['Demo', 'DIDs', 'Issue credential', 'Verify credential'],
    );

    await user.click(screen.getByRole('link', { name: 'DIDs' }));
    expect(location()).toHaveTextContent(/^\/dids$/);

    await user.click(screen.getByText('Demo'));
    screen.getByRole('link', { name: 'DIDs' }).focus();
    await user.keyboard('{Enter}');
    expect(location()).toHaveTextContent(/^\/dids$/);
  });

  test.each([
    ['/dids', 'DIDs'],
    ['/dids/did%3Akey%3Az6Mk', 'DIDs'],
    ['/issue-credential/templates', 'Issue credential'],
    ['/issue-credential/template', 'Issue credential'],
    ['/issue-credential/issued-credentials', 'Issue credential'],
    ['/verify-credential/advanced-verification', 'Verify credential'],
    ['/age-demo', 'Demo'],
  ])('at %s only %s is the current page (AC2)', (route, current) => {
    renderMenu(<DesktopNavigationMenu />, signedInState, route);

    const currentItems = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page')
      .map((link) => link.textContent);
    expect(currentItems).toEqual([current]);
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

    await user.click(screen.getByText('DIDs'));
    expect(location()).toHaveTextContent('/sign-in');

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

  test('shows DIDs directly before Issue and opens the DID list (AC1)', async () => {
    const user = userEvent.setup();

    renderMenu(<MobileNavigationMenu />, signedInState, '/demo');

    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(
      ['Demo', 'DIDs', 'Issue', 'Verify'],
    );

    await user.click(screen.getByText('DIDs'));
    expect(location()).toHaveTextContent(/^\/dids$/);
    expect(screen.getByRole('link', { name: 'DIDs' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('highlights DIDs on a details page, not Issue (AC2)', () => {
    renderMenu(
      <MobileNavigationMenu />,
      signedInState,
      '/dids/did%3Ahedera%3Atestnet%3Az6Mk_0.0.12345',
    );

    expect(screen.getByRole('link', { name: 'DIDs' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Issue' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  test('sends signed-out users to sign in', async () => {
    const user = userEvent.setup();

    renderMenu(<MobileNavigationMenu />, signedOutState, '/demo');

    await user.click(screen.getByText('Verify'));
    expect(location()).toHaveTextContent('/sign-in');

    await user.click(screen.getByText('Demo'));
    expect(location()).toHaveTextContent(/^\/$/);

    await user.click(screen.getByText('DIDs'));
    expect(location()).toHaveTextContent('/sign-in');
  });
});

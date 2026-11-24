import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';

import { StateSchema } from '@/app/providers/StoreProvider';
import { LocationDisplay } from '@/shared/lib/tests/LocationDisplay';
import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';

import { DesktopNavigationMenu, MobileNavigationMenu } from './NavigationMenu';

// A build with REACT_APP_FEATURE_CONTRIBUTOR_VERIFICATION=true (jest.mock applies to the whole file)
jest.mock('@/shared/config/features', () => ({
  features: { revocation: true, contributorVerification: true },
}));

const signedInState: Partial<StateSchema> = {
  user: {
    isLoading: false,
    isPreparing: false,
    data: { name: 'Jane Doe', tokens: { accessToken: 'token' } },
  },
};

const renderMenu = (menu: React.ReactElement, route = '/') =>
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
    { initialState: signedInState, route },
  );

describe.each([
  ['DesktopNavigationMenu', <DesktopNavigationMenu key="desktop" />],
  ['MobileNavigationMenu', <MobileNavigationMenu key="mobile" />],
])('%s with contributor verification on', (_, menu) => {
  test('opens the Contributor Hub', async () => {
    const user = userEvent.setup();

    renderMenu(menu);

    await user.click(screen.getByRole('link', { name: 'Contributor Hub' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/contributor');
  });

  test('Contributor Hub is the current section during onboarding', () => {
    renderMenu(menu, '/contributor/onboarding');

    expect(
      screen.getByRole('link', { name: 'Contributor Hub' }),
    ).toHaveAttribute('aria-current', 'page');
  });
});

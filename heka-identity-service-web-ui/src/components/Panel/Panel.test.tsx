import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { setViewportWidth } from '@/components/testUtils/viewport';

import { BasicPanel, ColorizedPanel, PanelWithMenu, TopPanel } from './Panel';
import { AdvancedMenuIcons, AdvancedMenuItem } from './shared/AdvancedMenuItem';

const icons = ['car', 'documents', 'wallet', 'vault'] as const;

describe('BasicPanel', () => {
  afterEach(() => setViewportWidth(1024));

  test.each(icons)('renders the title with the %s icon on desktop', (icon) => {
    render(
      <BasicPanel
        title="Profile"
        icon={icon}
      />,
    );

    expect(screen.getByText('Profile')).toHaveStyle({ maxWidth: '50%' });
  });

  test.each(icons)('renders the %s icon on mobile', (icon) => {
    setViewportWidth(400);

    render(
      <BasicPanel
        title="Profile"
        icon={icon}
      />,
    );

    expect(screen.getByText('Profile')).toBeInTheDocument();
  });

  test('uses the full width for the title without an icon', () => {
    render(<BasicPanel title="Profile" />);

    expect(screen.getByText('Profile')).toHaveStyle({ maxWidth: '100%' });
  });
});

describe('TopPanel', () => {
  test.each(icons)('renders the title with the %s icon', (icon) => {
    const { container } = render(
      <TopPanel
        title="Sign in"
        icon={icon}
      />,
    );

    expect(screen.getByText('Sign in')).toBeInTheDocument();
    expect((container.firstChild as HTMLElement).childElementCount).toBe(2);
  });
});

describe('PanelWithMenu', () => {
  afterEach(() => setViewportWidth(1024));

  test('shows the menu inline on desktop', () => {
    render(
      <PanelWithMenu
        title="Issue"
        activeItem="Schemas"
        panelMenu={<span>menu items</span>}
      />,
    );

    expect(screen.getByText('Issue')).toBeInTheDocument();
    expect(screen.getByText('menu items')).toBeInTheDocument();
    expect(screen.queryByText('Schemas')).not.toBeInTheDocument();
  });

  test('toggles the menu popup on mobile', async () => {
    setViewportWidth(400);
    const user = userEvent.setup();

    render(
      <PanelWithMenu
        title="Issue"
        activeItem="Schemas"
        panelMenu={<span>menu items</span>}
      />,
    );

    expect(screen.queryByText('menu items')).not.toBeInTheDocument();

    await user.click(screen.getByText('Schemas'));
    expect(screen.getByText('menu items')).toBeInTheDocument();

    await user.click(screen.getByText('menu items'));
    expect(screen.queryByText('menu items')).not.toBeInTheDocument();
  });

  test('opens the mobile menu from the keyboard', async () => {
    setViewportWidth(400);
    const user = userEvent.setup();

    render(
      <PanelWithMenu
        title="Issue"
        activeItem="Schemas"
        panelMenu={<span>menu items</span>}
      />,
    );

    const toggle = screen.getByRole('button', { name: 'Schemas' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    toggle.focus();
    await user.keyboard('{Enter}');

    expect(screen.getByText('menu items')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('ColorizedPanel', () => {
  test('renders logo and title in a readable color', () => {
    render(
      <ColorizedPanel
        title="ACME"
        logo="/acme.png"
        backgroundColor="#000000"
      />,
    );

    expect(screen.getByRole('img', { name: 'ACME' })).toHaveAttribute(
      'src',
      '/acme.png',
    );
    expect(screen.getByRole('heading', { name: 'ACME' })).toHaveStyle({
      color: 'rgb(255, 255, 255)',
    });
  });
});

describe('AdvancedMenuItem', () => {
  afterEach(() => setViewportWidth(1024));

  const renderItem = (
    icon: AdvancedMenuIcons | undefined,
    setIsPopupOpen?: jest.Mock,
  ) =>
    render(
      <MemoryRouter>
        <Routes>
          <Route
            path="/"
            element={
              <AdvancedMenuItem
                title="Advanced issue"
                to="/advanced"
                icon={icon}
                setIsPopupOpen={setIsPopupOpen}
              />
            }
          />
          <Route
            path="/advanced"
            element={<p>advanced page</p>}
          />
        </Routes>
      </MemoryRouter>,
    );

  test('navigates to its route and closes the popup', async () => {
    const user = userEvent.setup();
    const setIsPopupOpen = jest.fn();

    renderItem(AdvancedMenuIcons.Credentials, setIsPopupOpen);

    await user.click(screen.getByText('Advanced issue'));

    expect(screen.getByText('advanced page')).toBeInTheDocument();
    expect(setIsPopupOpen).toHaveBeenCalledWith(false);
  });

  test.each([AdvancedMenuIcons.Credentials, AdvancedMenuIcons.Car])(
    'renders icon %s on mobile and navigates without a popup',
    async (icon) => {
      setViewportWidth(400);
      const user = userEvent.setup();

      renderItem(icon);

      await user.click(screen.getByText('Advanced issue'));
      expect(screen.getByText('advanced page')).toBeInTheDocument();
    },
  );

  test('renders the car icon on desktop', () => {
    renderItem(AdvancedMenuIcons.Car);

    expect(screen.getByText('Advanced issue')).toBeInTheDocument();
  });
});

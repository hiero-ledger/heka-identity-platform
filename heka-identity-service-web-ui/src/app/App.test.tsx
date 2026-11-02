import { act, render, screen } from '@testing-library/react';
import { PropsWithChildren } from 'react';
import toast from 'react-hot-toast';

jest.mock('@/shared/auth/OidcAuthProvider', () => ({
  OidcAuthProvider: ({ children }: PropsWithChildren) => (
    <div data-testid="oidc-provider">{children}</div>
  ),
}));
jest.mock('@/shared/lib/notifications', () => ({
  NotificationsConnector: () => <p>notifications connector</p>,
}));
jest.mock(
  '@/app/routes/Router',
  () =>
    function MockRouter() {
      return <p>router</p>;
    },
);

import { App } from './App';

describe('App', () => {
  afterEach(() => {
    act(() => toast.remove());
  });

  test('mounts the router and notifications inside the auth provider', () => {
    render(<App />);

    const provider = screen.getByTestId('oidc-provider');
    expect(provider).toHaveTextContent('router');
    expect(provider).toHaveTextContent('notifications connector');
  });

  test('renders toasts with the app toast component', async () => {
    render(<App />);

    act(() => {
      toast.success('Saved');
    });

    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });
});

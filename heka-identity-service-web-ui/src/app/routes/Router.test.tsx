import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';

import { StateSchema } from '@/app/providers/StoreProvider';
import { AuthSession, AuthSessionContext } from '@/shared/auth/session';
import {
  createTestSession,
  createTestStore,
} from '@/shared/lib/tests/renderWithProviders';

// A function declaration is hoisted together with the jest.mock calls that use it
function mockPage(name: string) {
  return function MockPage() {
    return <p>{name} page</p>;
  };
}
jest.mock('@/pages/Home/Home', () => mockPage('home'));
jest.mock('@/pages/Profile/Profile', () => mockPage('profile'));
jest.mock('@/pages/SignIn/SignIn', () => mockPage('sign in'));
jest.mock('@/pages/Demo/Demo', () => mockPage('demo'));
jest.mock('@/pages/AgeVerificationDemo/AgeVerificationDemo', () =>
  mockPage('age demo'),
);
jest.mock('@/pages/IssueCredential/IssueCredential', () => mockPage('issue'));
jest.mock('@/pages/IssueCredential/CredentialOffer/CredentialOffer', () =>
  mockPage('credential offer'),
);
jest.mock(
  '@/pages/IssueCredential/IssueFromTemplate/IssueFromTemplate',
  () => ({
    IssueFromTemplate: mockPage('issue from template'),
  }),
);
jest.mock('@/pages/VerifyCredential/VerifyCredential', () =>
  mockPage('verify'),
);
jest.mock(
  '@/pages/VerifyCredential/VerificationRequest/VerificationRequest',
  () => mockPage('verification request'),
);
jest.mock(
  '@/pages/VerifyCredential/VerificationFromTemplate/VerificationFromTemplate',
  () => ({ VerificationFromTemplate: mockPage('verification from template') }),
);

import Router from './Router';

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

const renderRouter = (
  path: string,
  signedIn: boolean,
  session: Partial<AuthSession> = {},
) => {
  window.history.pushState({}, '', path);
  return render(
    <Provider store={createTestStore(userState(signedIn))}>
      <AuthSessionContext.Provider
        value={createTestSession({ isAuthenticated: signedIn, ...session })}
      >
        <Router />
      </AuthSessionContext.Provider>
    </Provider>,
  );
};

describe('Router', () => {
  afterEach(() => window.history.pushState({}, '', '/'));

  test('renders only a loader while the session is restored', () => {
    renderRouter('/profile', true, { isLoading: true });

    expect(screen.queryByText('profile page')).not.toBeInTheDocument();
    expect(screen.queryByText('home page')).not.toBeInTheDocument();
  });

  test.each([
    ['/', 'home'],
    ['/profile', 'profile'],
    ['/demo', 'demo'],
    ['/age-demo', 'age demo'],
    ['/issue-credential/templates', 'issue'],
    ['/issue-credential/from-template', 'issue from template'],
    ['/issue-credential/credential-offer', 'credential offer'],
    ['/verify-credential/templates', 'verify'],
    ['/verify-credential/from-template', 'verification from template'],
    ['/verify-credential/verification-request', 'verification request'],
  ])('signed in, %s renders the %s page', (path, page) => {
    renderRouter(path, true);

    expect(screen.getByText(`${page} page`)).toBeInTheDocument();
    // Pages are wrapped into the authenticated layout
    expect(screen.getByText('Issue credential')).toBeInTheDocument();
  });

  test('a reloaded deep link stays put before Redux mirrors the session', () => {
    // On reload the OIDC session is restored first; the Redux user slice catches up in an effect
    renderRouter('/profile', false, { isAuthenticated: true });

    expect(screen.getByText('profile page')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/profile');
  });

  test('signed in, unknown routes redirect home', () => {
    renderRouter('/sign-in', true);

    expect(screen.getByText('home page')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  test.each([
    ['/', 'home'],
    ['/demo', 'demo'],
    ['/age-demo', 'age demo'],
  ])('signed out, %s renders the public %s page', (path, page) => {
    renderRouter(path, false);

    expect(screen.getByText(`${page} page`)).toBeInTheDocument();
  });

  test('signed out, sign in is rendered in the unauthenticated layout', () => {
    renderRouter('/sign-in', false);

    expect(screen.getByText('sign in page')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  test('signed out, private routes redirect home', () => {
    renderRouter('/issue-credential/templates', false);

    expect(screen.getByText('home page')).toBeInTheDocument();
    expect(screen.queryByText('issue page')).not.toBeInTheDocument();
  });
});

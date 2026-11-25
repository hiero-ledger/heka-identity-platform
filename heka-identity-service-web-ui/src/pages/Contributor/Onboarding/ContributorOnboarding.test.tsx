import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InternalAxiosRequestConfig } from 'axios';
import { PropsWithChildren, useEffect } from 'react';
import toast from 'react-hot-toast';

import { StateSchema } from '@/app/providers/StoreProvider';
import {
  ContributorBinding,
  ContributorGpgChallenge,
  ContributorOnboardingStatus,
  ContributorSchema,
  contributorReducer,
} from '@/entities/Contributor';
import { $agencyApi } from '@/shared/api/config/api';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { registerSessionBridge } from '@/shared/auth/sessionBridge';
import {
  createMockApi,
  createTestStore,
  MockApi,
  renderWithProviders,
} from '@/shared/lib/tests/renderWithProviders';
import {
  mockWebWalletExtension,
  postFromExtension,
} from '@/shared/lib/webWallet/testUtils';

import ContributorOnboarding from './ContributorOnboarding';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn(), success: jest.fn() },
}));

// Expose the encoded value; the real component draws an SVG
jest.mock('@/components/QRCode', () => ({
  QRCode: ({ content }: { content: string }) => (
    <div data-testid="qr-code">{content}</div>
  ),
}));

const apiError = (status: number, message: string) => ({
  isAxiosError: true,
  response: { status, data: { message } },
});

const challenge: ContributorGpgChallenge = {
  challengeId: 'challenge-1',
  nonce: 'nonce-1',
  expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
  githubUsername: 'octocat',
  githubAccountId: '583231',
};

const binding: ContributorBinding = {
  githubAccountId: '583231',
  githubUsername: 'octocat',
  walletId: 'wallet-1',
  gpgFingerprint: 'ABCD',
  verifiedAt: '2026-01-01T00:00:00.000Z',
  linkedAt: '2025-12-31T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const verifiedStatus: ContributorOnboardingStatus = {
  verificationStatus: 'GpgVerified',
  binding,
  auditEvents: [],
};

/** Renders the wizard at a step; the status it loads on mount reports that step */
const renderAtStep = (
  contributor: Partial<ContributorSchema>,
  api = createMockApi(),
) => {
  const status: ContributorOnboardingStatus =
    contributor.currentStep === 3
      ? verifiedStatus
      : {
          verificationStatus: 'GitHubConnected',
          github: { accountId: '583231', username: 'octocat' },
          auditEvents: [],
        };
  api.get.mockImplementation((url: string) =>
    Promise.resolve({
      data:
        url === agencyEndpoints.contributorOnboardingStatus
          ? status
          : undefined,
    }),
  );
  const initialState: Partial<StateSchema> = {
    contributor: {
      ...contributorReducer(undefined, { type: 'init' }),
      githubLinked: true,
      githubUsername: 'octocat',
      ...contributor,
    },
  };
  renderWithProviders(<ContributorOnboarding />, { api, initialState });
  return api;
};

/** The stepper's mark on a failed step */
const failedStepMark = () => screen.queryByText('✗');

const offerStatePolls = (api: MockApi) =>
  api.get.mock.calls.filter(([url]) =>
    url.startsWith('/v2/contributor-credential/offer/'),
  ).length;

describe('ContributorOnboarding', () => {
  afterEach(() => jest.restoreAllMocks());

  test('a failed challenge request marks the step as failed until the next attempt', async () => {
    const user = userEvent.setup();
    const api = renderAtStep({ currentStep: 1, completedSteps: [0] });
    api.post.mockRejectedValueOnce(apiError(409, 'Link GitHub first'));

    await user.click(
      screen.getByRole('button', { name: 'Generate Challenge' }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Generate Challenge' }),
      ).toBeEnabled(),
    );
    expect(toast.error).toHaveBeenCalledWith('Link GitHub first');
    expect(failedStepMark()).toBeInTheDocument();

    api.post.mockResolvedValueOnce({ data: challenge });
    await user.click(
      screen.getByRole('button', { name: 'Generate Challenge' }),
    );

    expect(
      await screen.findByText('Sign the challenge with your GPG key'),
    ).toBeInTheDocument();
    expect(api.post).toHaveBeenLastCalledWith(
      agencyEndpoints.requestGpgChallenge,
    );
    expect(failedStepMark()).not.toBeInTheDocument();
  });

  test('a rejected signature marks the step as failed; asking for a new challenge clears it', async () => {
    const user = userEvent.setup();
    const api = renderAtStep({
      currentStep: 2,
      completedSteps: [0, 1],
      activeChallenge: challenge,
    });
    api.post.mockRejectedValueOnce(apiError(400, 'Signature does not match'));

    await user.type(
      screen.getByLabelText('Paste the signed output here'),
      'signature',
    );
    await user.click(screen.getByRole('button', { name: 'Submit Signature' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Signature does not match',
    );
    expect(failedStepMark()).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Generate a new challenge' }),
    );

    expect(screen.getByText('Generate a GPG Challenge')).toBeInTheDocument();
    expect(failedStepMark()).not.toBeInTheDocument();
  });

  describe('receiving the credential', () => {
    const OFFER = 'openid-credential-offer://?credential_offer_uri=x';
    const OTHER_OFFER = 'openid-credential-offer://?credential_offer_uri=y';

    const verified = {
      currentStep: 3 as const,
      completedSteps: [0, 1, 2] as Array<0 | 1 | 2 | 3>,
      binding,
    };

    /** An offer that expires in ten minutes of the (fake) clock */
    const offerAnswer = () => ({
      credentialOffer: OFFER,
      txCode: '49381726',
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      issuanceSessionId: 'session-1',
    });

    const offerState = (state: string) => ({
      data: { state, expiresAt: offerAnswer().expiresAt },
    });

    const credentialStepMark = () =>
      screen.getByText('Credential').previousElementSibling;

    const poll = () => act(() => jest.advanceTimersByTimeAsync(2000));

    const setup = () => {
      jest.useFakeTimers();
      const user = userEvent.setup({
        advanceTimers: jest.advanceTimersByTime,
      });
      const api = renderAtStep(verified);
      const offer = offerAnswer();
      api.post.mockResolvedValueOnce({ data: offer });
      const requestOffer = () =>
        user.click(
          screen.getByRole('button', { name: 'Request credential offer' }),
        );
      return { user, api, offer, requestOffer };
    };

    afterEach(() => jest.useRealTimers());

    test('shows the offer as a QR code with its transaction code and expiry, without the extension', async () => {
      const postMessage = jest.spyOn(window, 'postMessage');
      const { api, requestOffer } = setup();

      await requestOffer();

      expect(await screen.findByTestId('qr-code')).toHaveTextContent(OFFER);
      expect(api.post).toHaveBeenCalledWith(
        agencyEndpoints.contributorCredentialOffer,
      );
      expect(screen.getByText('49381726')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Copy code' }),
      ).toBeInTheDocument();
      expect(screen.getByText(/^The offer expires /)).toBeInTheDocument();
      await act(() => jest.advanceTimersByTimeAsync(1500));
      expect(
        screen.queryByRole('button', { name: 'Open in Heka Web Wallet' }),
      ).not.toBeInTheDocument();
      expect(postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'RECEIVE_OFFER' }),
        expect.anything(),
      );
    });

    test('polls the offer until the wallet completes it', async () => {
      const { api, requestOffer } = setup();
      api.get
        .mockResolvedValueOnce(offerState('OfferUriRetrieved'))
        .mockResolvedValueOnce(offerState('Completed'));

      await requestOffer();
      await screen.findByTestId('qr-code');
      await poll();
      expect(screen.getByTestId('qr-code')).toBeInTheDocument();
      await poll();

      expect(
        screen.getByText('Your wallet has received the credential.'),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('qr-code')).not.toBeInTheDocument();
      expect(credentialStepMark()).toHaveTextContent('✓');
      expect(api.get).toHaveBeenCalledWith(
        agencyEndpoints.contributorCredentialOfferState('session-1'),
      );

      await poll();
      expect(offerStatePolls(api)).toBe(2);
    });

    test('an offer whose issuance failed can be replaced', async () => {
      const { api, requestOffer, user } = setup();
      api.get.mockResolvedValueOnce(offerState('Error'));

      await requestOffer();
      await screen.findByTestId('qr-code');
      await poll();

      expect(
        screen.getByText('The wallet could not receive the credential.'),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('qr-code')).not.toBeInTheDocument();

      api.post.mockResolvedValueOnce({
        data: { ...offerAnswer(), issuanceSessionId: 'session-2' },
      });
      await user.click(
        screen.getByRole('button', { name: 'Request a new offer' }),
      );

      expect(await screen.findByTestId('qr-code')).toBeInTheDocument();
      expect(api.post).toHaveBeenCalledTimes(2);
    });

    test('an expired offer stops the polling and can be replaced', async () => {
      const { api, requestOffer } = setup();
      api.get.mockResolvedValue(offerState('OfferCreated'));

      await requestOffer();
      await screen.findByTestId('qr-code');
      await act(() => jest.advanceTimersByTimeAsync(10 * 60_000 + 2000));

      expect(screen.getByText('This offer has expired.')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Request a new offer' }),
      ).toBeInTheDocument();
      const polls = offerStatePolls(api);
      await poll();
      expect(offerStatePolls(api)).toBe(polls);
    });

    test('a failed poll stops the polling until the user checks again', async () => {
      const { api, requestOffer, user } = setup();
      api.get
        .mockRejectedValueOnce(apiError(503, 'Service unavailable'))
        .mockResolvedValueOnce(offerState('Completed'));

      await requestOffer();
      await screen.findByTestId('qr-code');
      await poll();

      expect(
        screen.getByText("The offer's state could not be checked."),
      ).toBeInTheDocument();
      expect(toast.error).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('qr-code')).toBeInTheDocument();
      await poll();
      expect(offerStatePolls(api)).toBe(1);

      await user.click(screen.getByRole('button', { name: 'Check again' }));
      await poll();

      expect(
        screen.getByText('Your wallet has received the credential.'),
      ).toBeInTheDocument();
    });

    test('after a failed poll, a new offer can be requested instead', async () => {
      const { api, requestOffer, user } = setup();
      api.get
        .mockRejectedValueOnce(apiError(503, 'Service unavailable'))
        .mockResolvedValueOnce(offerState('Completed'));

      await requestOffer();
      await screen.findByTestId('qr-code');
      await poll();
      expect(
        screen.getByText("The offer's state could not be checked."),
      ).toBeInTheDocument();

      api.post.mockResolvedValueOnce({
        data: {
          ...offerAnswer(),
          credentialOffer: OTHER_OFFER,
          issuanceSessionId: 'session-2',
        },
      });
      await user.click(
        screen.getByRole('button', { name: 'Request a new offer' }),
      );

      await waitFor(() =>
        expect(screen.getByTestId('qr-code')).toHaveTextContent(OTHER_OFFER),
      );
      expect(
        screen.queryByText("The offer's state could not be checked."),
      ).not.toBeInTheDocument();
      await poll();
      expect(api.get).toHaveBeenLastCalledWith(
        agencyEndpoints.contributorCredentialOfferState('session-2'),
      );
      expect(
        screen.getByText('Your wallet has received the credential.'),
      ).toBeInTheDocument();
    });

    test("a poll answered after the wallet's status doesn't undo the completion", async () => {
      const { api, requestOffer } = setup();
      let answerPoll: (answer: unknown) => void = () => {};
      api.get.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            answerPoll = resolve;
          }),
      );

      await requestOffer();
      await screen.findByTestId('qr-code');
      await poll();
      expect(offerStatePolls(api)).toBe(1);

      act(() => {
        postFromExtension('RECEIVE_STATUS', {
          offerUri: OFFER,
          state: 'done',
          message: 'Stored',
        });
      });
      await act(async () => answerPoll(offerState('Error')));

      expect(
        screen.getByText('Your wallet has received the credential.'),
      ).toBeInTheDocument();
      expect(
        screen.queryByText('The wallet could not receive the credential.'),
      ).not.toBeInTheDocument();
      await poll();
      expect(offerStatePolls(api)).toBe(1);
    });

    test('hands the offer to the Heka Web Wallet, whose status completes only its own offer', async () => {
      const { sent } = mockWebWalletExtension();
      const { user, offer, requestOffer } = setup();

      await requestOffer();
      await user.click(
        await screen.findByRole('button', { name: 'Open in Heka Web Wallet' }),
      );

      expect(sent).toEqual([
        {
          source: 'heka-web-wallet-bridge',
          type: 'RECEIVE_OFFER',
          payload: { offerUri: OFFER, expiresAt: offer.expiresAt },
        },
      ]);

      act(() => {
        postFromExtension('RECEIVE_STATUS', {
          offerUri: OTHER_OFFER,
          state: 'done',
          message: 'Stored',
        });
      });
      expect(screen.getByTestId('qr-code')).toBeInTheDocument();
      expect(credentialStepMark()).toHaveTextContent('4');

      act(() => {
        postFromExtension('RECEIVE_STATUS', {
          offerUri: OFFER,
          state: 'done',
          message: 'Stored',
        });
      });
      expect(
        screen.getByText('Your wallet has received the credential.'),
      ).toBeInTheDocument();
      expect(credentialStepMark()).toHaveTextContent('✓');
    });

    test("a refused offer shows the identity service's message once and marks the step", async () => {
      const postMessage = jest.spyOn(window, 'postMessage');
      const { api, requestOffer } = setup();
      api.post.mockReset();
      api.post.mockRejectedValueOnce(
        apiError(503, 'The contributor credential issuer is not set up'),
      );

      await requestOffer();

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          'The contributor credential issuer is not set up',
        ),
      );
      expect(toast.error).toHaveBeenCalledTimes(1);
      expect(failedStepMark()).toBeInTheDocument();
      expect(screen.queryByTestId('qr-code')).not.toBeInTheDocument();
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Request credential offer' }),
        ).toBeEnabled(),
      );
      expect(postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'RECEIVE_OFFER' }),
        expect.anything(),
      );
    });

    test('stops polling when the page is left', async () => {
      const { api, requestOffer } = setup();
      api.get.mockResolvedValue(offerState('OfferCreated'));

      await requestOffer();
      await screen.findByTestId('qr-code');
      await poll();
      expect(offerStatePolls(api)).toBe(1);

      cleanup();
      await poll();

      expect(offerStatePolls(api)).toBe(1);
    });

    test('promises no profile page to receive it from later', async () => {
      renderAtStep(verified);

      // Also lets the status loaded on mount settle
      await screen.findByRole('button', { name: 'Request credential offer' });
      expect(screen.queryByText(/profile/i)).not.toBeInTheDocument();
    });
  });

  describe('unlinking the GitHub account', () => {
    const verified = {
      currentStep: 3 as const,
      completedSteps: [0, 1, 2] as Array<0 | 1 | 2 | 3>,
      binding,
    };

    const openDialog = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(
        screen.getByRole('button', { name: 'Unlink GitHub account' }),
      );
      return screen.findByRole('dialog');
    };

    test('after a confirmation that issued credentials stay valid, starts the wizard over', async () => {
      const user = userEvent.setup();
      const api = renderAtStep(verified);
      api.delete.mockResolvedValueOnce({ data: undefined });
      api.get.mockResolvedValueOnce({
        data: { verificationStatus: 'NotConnected', auditEvents: [] },
      });

      const dialog = await openDialog(user);
      expect(dialog).toHaveTextContent(
        'Credentials already issued to you stay valid until they expire.',
      );
      await user.click(
        within(dialog).getByRole('button', { name: 'Unlink GitHub account' }),
      );

      expect(
        await screen.findByText('Link your GitHub account'),
      ).toBeInTheDocument();
      expect(api.delete).toHaveBeenCalledWith(agencyEndpoints.unlinkGithub);
      expect(api.get).toHaveBeenCalledWith(
        agencyEndpoints.contributorOnboardingStatus,
      );
      expect(
        screen.getByText('Credential').previousElementSibling,
      ).toHaveTextContent('4');
    });

    test('cancelling keeps the binding', async () => {
      const user = userEvent.setup();
      const api = renderAtStep(verified);

      const dialog = await openDialog(user);
      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      expect(api.delete).not.toHaveBeenCalled();
      expect(screen.getByText('Identity Verified!')).toBeInTheDocument();
    });

    test('a failed unlink keeps the step and marks it', async () => {
      const user = userEvent.setup();
      const api = renderAtStep(verified);
      api.delete.mockRejectedValueOnce(apiError(500, 'Database unavailable'));

      const dialog = await openDialog(user);
      await user.click(
        within(dialog).getByRole('button', { name: 'Unlink GitHub account' }),
      );

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith('Database unavailable'),
      );
      expect(screen.getByText('Identity Verified!')).toBeInTheDocument();
      expect(failedStepMark()).toBeInTheDocument();
    });
  });

  describe('loading the status', () => {
    test('a full page load requests it, although the session is registered after the page mounted', async () => {
      // As OidcAuthProvider on a full load: its effect registers the session after the page's own
      const SessionRegisteredAfterPage = ({ children }: PropsWithChildren) => {
        useEffect(() => {
          registerSessionBridge({
            getAccessToken: () => 'token',
            refresh: () => Promise.resolve(null),
            dropSession: () => Promise.resolve(),
            signOut: () => Promise.resolve(),
          });
          return () => registerSessionBridge(null);
        }, []);
        return <>{children}</>;
      };
      // The real API client, so its interceptor adds the token when the request goes out
      const adapter = jest.fn(async (config: InternalAxiosRequestConfig) => ({
        data: verifiedStatus,
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }));
      const defaultAdapter = $agencyApi.defaults.adapter;
      $agencyApi.defaults.adapter = adapter;

      try {
        registerSessionBridge(null);
        renderWithProviders(
          <SessionRegisteredAfterPage>
            <ContributorOnboarding />
          </SessionRegisteredAfterPage>,
          { store: createTestStore({}, $agencyApi as unknown as MockApi) },
        );

        expect(
          await screen.findByText('Identity Verified!'),
        ).toBeInTheDocument();
        expect(adapter).toHaveBeenCalledTimes(1);
        const [request] = adapter.mock.calls[0];
        expect(request.url).toBe(agencyEndpoints.contributorOnboardingStatus);
        expect(request.headers.Authorization).toBe('Bearer token');
      } finally {
        $agencyApi.defaults.adapter = defaultAdapter;
      }
    });

    test('a failed status fetch can be retried, and its mark goes once it succeeds', async () => {
      const user = userEvent.setup();
      const api = createMockApi();
      api.get
        .mockRejectedValueOnce(apiError(502, 'GitHub is unavailable'))
        .mockResolvedValueOnce({
          data: {
            verificationStatus: 'GpgVerified',
            binding,
            auditEvents: [],
          },
        });
      renderAtStep({ currentStep: 1, completedSteps: [0] }, api);

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Your onboarding status could not be loaded.',
      );
      expect(failedStepMark()).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Try again' }));

      expect(await screen.findByText('Identity Verified!')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(failedStepMark()).not.toBeInTheDocument();
      expect(api.get).toHaveBeenCalledTimes(2);
    });
  });
});

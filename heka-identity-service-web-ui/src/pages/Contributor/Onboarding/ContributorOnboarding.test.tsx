import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';

import { StateSchema } from '@/app/providers/StoreProvider';
import {
  ContributorBinding,
  ContributorGpgChallenge,
  ContributorSchema,
  contributorReducer,
} from '@/entities/Contributor';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import {
  createMockApi,
  renderWithProviders,
} from '@/shared/lib/tests/renderWithProviders';

import ContributorOnboarding from './ContributorOnboarding';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn(), success: jest.fn() },
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
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const renderAtStep = (
  contributor: Partial<ContributorSchema>,
  api = createMockApi(),
) => {
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
    // The Heka Web Wallet's content script answers the page's PING; other messages are recorded
    const withWalletExtension = () =>
      jest.spyOn(window, 'postMessage').mockImplementation(((message: {
        type?: string;
      }) => {
        if (message?.type !== 'PING') return;
        window.dispatchEvent(
          new MessageEvent('message', {
            data: { source: 'heka-extension-bridge', type: 'PING_RESPONSE' },
            origin: window.location.origin,
          }),
        );
      }) as typeof window.postMessage);

    const verified = {
      currentStep: 3 as const,
      completedSteps: [0, 1, 2] as Array<0 | 1 | 2 | 3>,
      binding,
    };

    test('requests an offer, shows its transaction code and hands the offer to the wallet', async () => {
      const user = userEvent.setup();
      const postMessage = withWalletExtension();
      const api = renderAtStep(verified);
      api.post.mockResolvedValueOnce({
        data: {
          credentialOffer: 'openid-credential-offer://?credential_offer_uri=x',
          txCode: '493817',
          expiresAt: '2026-01-01T00:10:00.000Z',
        },
      });

      await user.click(
        screen.getByRole('button', { name: /Receive into Web Wallet/ }),
      );

      expect(await screen.findByText('493817')).toBeInTheDocument();
      expect(api.post).toHaveBeenCalledWith(
        agencyEndpoints.contributorCredentialOffer,
      );
      expect(postMessage).toHaveBeenCalledWith(
        {
          source: 'heka-web-wallet-bridge',
          type: 'RECEIVE_OFFER',
          payload: {
            offerUri: 'openid-credential-offer://?credential_offer_uri=x',
            expiresAt: '2026-01-01T00:10:00.000Z',
          },
        },
        window.location.origin,
      );
    });

    test("a refused offer shows the identity service's message and sends the wallet nothing", async () => {
      const user = userEvent.setup();
      const postMessage = withWalletExtension();
      const api = renderAtStep(verified);
      api.post.mockRejectedValueOnce(
        apiError(409, 'GPG verification is not complete'),
      );

      await user.click(
        screen.getByRole('button', { name: /Receive into Web Wallet/ }),
      );

      expect(
        await screen.findByText(/Failed to send credential offer/),
      ).toBeInTheDocument();
      expect(toast.error).toHaveBeenCalledTimes(1);
      expect(toast.error).toHaveBeenCalledWith(
        'GPG verification is not complete',
      );
      expect(postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'RECEIVE_OFFER' }),
        expect.anything(),
      );
    });

    test('promises no profile page to receive it from later', () => {
      renderAtStep(verified);

      expect(screen.queryByText(/profile/i)).not.toBeInTheDocument();
    });
  });
});

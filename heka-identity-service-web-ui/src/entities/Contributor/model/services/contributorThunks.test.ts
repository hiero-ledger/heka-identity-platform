import toast from 'react-hot-toast';

import { agencyEndpoints } from '@/shared/api/config/endpoints';
import {
  createMockApi,
  createTestStore,
  MockApi,
} from '@/shared/lib/tests/renderWithProviders';

import { completeGithubLink } from './completeGithubLink';
import { getContributorCredentialOfferState } from './getContributorCredentialOfferState';
import { getContributorOnboardingStatus } from './getContributorOnboardingStatus';
import { requestContributorCredentialOffer } from './requestContributorCredentialOffer';
import { requestContributorGpgChallenge } from './requestContributorGpgChallenge';
import { startGithubLink } from './startGithubLink';
import { unlinkGithub } from './unlinkGithub';
import { verifyContributorGpgChallenge } from './verifyContributorGpgChallenge';
import {
  ContributorCredentialOffer,
  ContributorGpgChallenge,
  ContributorOnboardingStatus,
} from '../types/contributor';

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
  expiresAt: '2026-01-01T00:05:00.000Z',
  githubUsername: 'octocat',
  githubAccountId: '583231',
};

const offer: ContributorCredentialOffer = {
  credentialOffer: 'openid-credential-offer://?credential_offer_uri=x',
  txCode: '123456',
  expiresAt: '2026-01-01T00:10:00.000Z',
  issuanceSessionId: 'session-1',
};

type Store = ReturnType<typeof createTestStore>;
type SettledAction = { meta: { requestStatus: string }; payload?: unknown };

const setup = () => {
  const api = createMockApi();
  const store = createTestStore({}, api);
  return { api, store };
};

describe('contributor thunks', () => {
  test('startGithubLink posts to the link start endpoint and returns the authorization URL', async () => {
    const { api, store } = setup();
    api.post.mockResolvedValue({
      data: { authorizationUrl: 'https://github.com/login/oauth/authorize?x' },
    });

    const action = await store.dispatch(startGithubLink());

    expect(api.post).toHaveBeenCalledWith(agencyEndpoints.startGithubLink);
    expect(action.type).toBe('contributor/startGithubLink/fulfilled');
    expect(action.payload).toEqual({
      authorizationUrl: 'https://github.com/login/oauth/authorize?x',
    });
  });

  test("completeGithubLink posts GitHub's code and state", async () => {
    const { api, store } = setup();
    api.post.mockResolvedValue({
      data: { linked: true, githubUsername: 'octocat' },
    });

    const result = await store
      .dispatch(completeGithubLink({ code: 'code-1', state: 'state-1' }))
      .unwrap();

    expect(api.post).toHaveBeenCalledWith(agencyEndpoints.completeGithubLink, {
      code: 'code-1',
      state: 'state-1',
    });
    expect(result).toEqual({ linked: true, githubUsername: 'octocat' });
  });

  test('getContributorOnboardingStatus reads the status', async () => {
    const { api, store } = setup();
    const status: ContributorOnboardingStatus = {
      verificationStatus: 'GitHubConnected',
      github: { accountId: '583231', username: 'octocat' },
      auditEvents: [],
    };
    api.get.mockResolvedValue({ data: status });

    const result = await store
      .dispatch(getContributorOnboardingStatus())
      .unwrap();

    expect(api.get).toHaveBeenCalledWith(
      agencyEndpoints.contributorOnboardingStatus,
    );
    expect(result).toEqual(status);
  });

  test('requestContributorGpgChallenge posts to the challenge endpoint', async () => {
    const { api, store } = setup();
    api.post.mockResolvedValue({ data: challenge });

    const result = await store
      .dispatch(requestContributorGpgChallenge())
      .unwrap();

    expect(api.post).toHaveBeenCalledWith(agencyEndpoints.requestGpgChallenge);
    expect(result).toEqual(challenge);
  });

  test('verifyContributorGpgChallenge posts the challenge id and the signature', async () => {
    const { api, store } = setup();
    api.post.mockResolvedValue({
      data: { verified: true, message: 'ok', gpgFingerprint: 'ABCD' },
    });

    const result = await store
      .dispatch(
        verifyContributorGpgChallenge({
          challengeId: 'challenge-1',
          signature: '-----BEGIN PGP SIGNED MESSAGE-----',
        }),
      )
      .unwrap();

    expect(api.post).toHaveBeenCalledWith(agencyEndpoints.verifyGpgChallenge, {
      challengeId: 'challenge-1',
      signature: '-----BEGIN PGP SIGNED MESSAGE-----',
    });
    expect(result.verified).toBe(true);
  });

  test.each<[string, (store: Store) => Promise<SettledAction>]>([
    ['startGithubLink', (store) => store.dispatch(startGithubLink())],
    [
      'completeGithubLink',
      (store) =>
        store.dispatch(
          completeGithubLink({ code: 'code-1', state: 'state-1' }),
        ),
    ],
    [
      'requestContributorGpgChallenge',
      (store) => store.dispatch(requestContributorGpgChallenge()),
    ],
    [
      'verifyContributorGpgChallenge',
      (store) =>
        store.dispatch(
          verifyContributorGpgChallenge({ challengeId: 'c', signature: 's' }),
        ),
    ],
    [
      'requestContributorCredentialOffer',
      (store) => store.dispatch(requestContributorCredentialOffer()),
    ],
  ])('%s shows the server message and rejects with it', async (_, run) => {
    const { api, store } = setup();
    api.post.mockRejectedValue(apiError(409, 'Link GitHub first'));

    const action = await run(store);

    expect(action.meta.requestStatus).toBe('rejected');
    expect(action.payload).toBe('Link GitHub first');
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith('Link GitHub first');
  });

  test('getContributorCredentialOfferState reads the state of an offer', async () => {
    const { api, store } = setup();
    api.get.mockResolvedValue({
      data: { state: 'Completed', expiresAt: offer.expiresAt },
    });

    const result = await store
      .dispatch(getContributorCredentialOfferState('session/1'))
      .unwrap();

    expect(api.get).toHaveBeenCalledWith(
      '/v2/contributor-credential/offer/session%2F1',
    );
    expect(result).toEqual({ state: 'Completed', expiresAt: offer.expiresAt });
  });

  test('unlinkGithub deletes the binding', async () => {
    const { api, store } = setup();

    const action = await store.dispatch(unlinkGithub());

    expect(api.delete).toHaveBeenCalledWith(agencyEndpoints.unlinkGithub);
    expect(action.meta.requestStatus).toBe('fulfilled');
  });

  test.each<[string, (store: Store, api: MockApi) => Promise<SettledAction>]>([
    [
      'getContributorCredentialOfferState',
      (store, api) => {
        api.get.mockRejectedValue(apiError(503, 'Service unavailable'));
        return store.dispatch(getContributorCredentialOfferState('s'));
      },
    ],
    [
      'unlinkGithub',
      (store, api) => {
        api.delete.mockRejectedValue(apiError(503, 'Service unavailable'));
        return store.dispatch(unlinkGithub());
      },
    ],
  ])('%s shows the server message and rejects with it', async (_, run) => {
    const { api, store } = setup();

    const action = await run(store, api);

    expect(action.meta.requestStatus).toBe('rejected');
    expect(action.payload).toBe('Service unavailable');
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith('Service unavailable');
  });

  test('getContributorOnboardingStatus shows the server message and rejects with it', async () => {
    const { api, store } = setup();
    api.get.mockRejectedValue(apiError(502, 'GitHub is unavailable'));

    const action = await store.dispatch(getContributorOnboardingStatus());

    expect(action.payload).toBe('GitHub is unavailable');
    expect(toast.error).toHaveBeenCalledWith('GitHub is unavailable');
  });
});

describe('requestContributorCredentialOffer', () => {
  test('posts to the offer endpoint and returns the offer with its transaction code and session', async () => {
    const { api, store } = setup();
    api.post.mockResolvedValue({ data: offer });

    const result = await store
      .dispatch(requestContributorCredentialOffer())
      .unwrap();

    expect(api.post).toHaveBeenCalledWith(
      agencyEndpoints.contributorCredentialOffer,
    );
    expect(result).toEqual(offer);
    expect(toast.error).not.toHaveBeenCalled();
  });

  test.each([
    [
      'not an OID4VCI offer URI',
      { ...offer, credentialOffer: 'https://example.com/offer' },
    ],
    ['without a transaction code', { ...offer, txCode: '' }],
    ['without an expiry', { ...offer, expiresAt: '' }],
    ['with an unreadable expiry', { ...offer, expiresAt: 'soon' }],
    ['without an issuance session', { ...offer, issuanceSessionId: '' }],
    ['empty', undefined],
  ])('rejects an answer %s', async (_, data) => {
    const { api, store } = setup();
    api.post.mockResolvedValue({ data });

    const action = await store.dispatch(requestContributorCredentialOffer());

    const message =
      'The identity service returned an incomplete credential offer.';
    expect(action.meta.requestStatus).toBe('rejected');
    expect(action.payload).toBe(message);
    expect(toast.error).toHaveBeenCalledWith(message);
  });
});

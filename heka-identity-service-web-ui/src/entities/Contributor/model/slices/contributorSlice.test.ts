import { createTestStore } from '@/shared/lib/tests/renderWithProviders';

import { contributorActions, contributorReducer } from './contributorSlice';
import {
  getContributorActiveChallenge,
  getContributorBinding,
  getContributorCompletedSteps,
  getContributorError,
  getContributorGithubLinked,
  getContributorGithubUsername,
  getContributorIsLoading,
  getContributorStep,
} from '../selectors/contributorSelectors';
import { getContributorOnboardingStatus } from '../services/getContributorOnboardingStatus';
import { requestContributorGpgChallenge } from '../services/requestContributorGpgChallenge';
import { startGithubLink } from '../services/startGithubLink';
import { verifyContributorGpgChallenge } from '../services/verifyContributorGpgChallenge';
import {
  ContributorBinding,
  ContributorGpgChallenge,
  ContributorOnboardingStatus,
  ContributorSchema,
} from '../types/contributor';

const initial = (): ContributorSchema =>
  contributorReducer(undefined, { type: 'init' });

const binding: ContributorBinding = {
  githubAccountId: '583231',
  githubUsername: 'octocat',
  walletId: 'wallet-1',
  gpgFingerprint: 'ABCD',
  verifiedAt: '2026-01-01T00:00:00.000Z',
  linkedAt: '2025-12-31T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const challenge: ContributorGpgChallenge = {
  challengeId: 'challenge-1',
  nonce: 'nonce-1',
  expiresAt: '2026-01-01T00:05:00.000Z',
  githubUsername: 'octocat',
  githubAccountId: '583231',
};

const status = (
  overrides: Partial<ContributorOnboardingStatus>,
): ContributorOnboardingStatus => ({
  verificationStatus: 'NotConnected',
  auditEvents: [],
  ...overrides,
});

const verifyArgs = { challengeId: 'challenge-1', signature: 'sig' };

describe('contributorSlice', () => {
  test('starts at the first step with nothing linked', () => {
    expect(initial()).toEqual({
      currentStep: 0,
      completedSteps: [],
      githubLinked: false,
      githubUsername: null,
      githubAccountId: null,
      activeChallenge: null,
      verificationResult: null,
      binding: null,
      isLoading: false,
      error: null,
    });
  });

  test('a user without a linked GitHub account stays on the first step', () => {
    const state = contributorReducer(
      initial(),
      getContributorOnboardingStatus.fulfilled(status({}), 'r'),
    );

    expect(state.currentStep).toBe(0);
    expect(state.completedSteps).toEqual([]);
    expect(state.githubLinked).toBe(false);
  });

  test('a linked GitHub account moves the wizard to the challenge step', () => {
    const state = contributorReducer(
      initial(),
      getContributorOnboardingStatus.fulfilled(
        status({
          verificationStatus: 'GitHubConnected',
          github: { accountId: '583231', username: 'octocat' },
        }),
        'r',
      ),
    );

    expect(state).toMatchObject({
      currentStep: 1,
      completedSteps: [0],
      githubLinked: true,
      githubAccountId: '583231',
      githubUsername: 'octocat',
      binding: null,
    });
  });

  test('a verified GPG key moves the wizard to the credential step, with the binding', () => {
    const state = contributorReducer(
      initial(),
      getContributorOnboardingStatus.fulfilled(
        status({ verificationStatus: 'GpgVerified', binding }),
        'r',
      ),
    );

    expect(state).toMatchObject({
      currentStep: 3,
      completedSteps: [0, 1, 2],
      githubLinked: true,
      githubAccountId: '583231',
      githubUsername: 'octocat',
      binding,
    });
  });

  test('a new challenge becomes active and moves the wizard to the sign step', () => {
    let state = contributorReducer(
      initial(),
      requestContributorGpgChallenge.pending('r'),
    );
    expect(state.isLoading).toBe(true);

    state = contributorReducer(
      state,
      requestContributorGpgChallenge.fulfilled(challenge, 'r'),
    );

    expect(state).toMatchObject({
      isLoading: false,
      activeChallenge: challenge,
      currentStep: 2,
      completedSteps: [1],
    });
  });

  test('an accepted signature moves to the credential step and keeps the binding until the status refreshes it', () => {
    const linked: ContributorBinding = {
      ...binding,
      gpgFingerprint: undefined,
      verifiedAt: undefined,
    };
    const state = contributorReducer(
      {
        ...initial(),
        currentStep: 2,
        activeChallenge: challenge,
        binding: linked,
      },
      verifyContributorGpgChallenge.fulfilled(
        { verified: true, message: 'Verified', gpgFingerprint: 'ABCD' },
        'r',
        verifyArgs,
      ),
    );

    expect(state).toMatchObject({
      currentStep: 3,
      completedSteps: [2],
      binding: linked,
      error: null,
    });
  });

  test('a rejected signature keeps the sign step and records the reason', () => {
    const state = contributorReducer(
      { ...initial(), currentStep: 2, activeChallenge: challenge },
      verifyContributorGpgChallenge.fulfilled(
        { verified: false, message: 'Signature does not match' },
        'r',
        verifyArgs,
      ),
    );

    expect(state.currentStep).toBe(2);
    expect(state.error).toBe('Signature does not match');
  });

  test.each([
    ['startGithubLink', startGithubLink.rejected(null, 'r', undefined, 'm1')],
    [
      'getContributorOnboardingStatus',
      getContributorOnboardingStatus.rejected(null, 'r', undefined, 'm1'),
    ],
    [
      'requestContributorGpgChallenge',
      requestContributorGpgChallenge.rejected(null, 'r', undefined, 'm1'),
    ],
    [
      'verifyContributorGpgChallenge',
      verifyContributorGpgChallenge.rejected(null, 'r', verifyArgs, 'm1'),
    ],
  ])('a failed %s keeps its message as the error', (_, action) => {
    const state = contributorReducer({ ...initial(), isLoading: true }, action);

    expect(state.isLoading).toBe(false);
    expect(state.error).toBe('m1');
  });

  test.each([
    ['startGithubLink', startGithubLink.pending('r')],
    [
      'getContributorOnboardingStatus',
      getContributorOnboardingStatus.pending('r'),
    ],
    [
      'requestContributorGpgChallenge',
      requestContributorGpgChallenge.pending('r'),
    ],
    [
      'verifyContributorGpgChallenge',
      verifyContributorGpgChallenge.pending('r', verifyArgs),
    ],
  ])('starting %s clears the previous error', (_, action) => {
    const state = contributorReducer({ ...initial(), error: 'old' }, action);

    expect(state.error).toBeNull();
  });

  test('clearError and setCurrentStep', () => {
    let state = contributorReducer(
      { ...initial(), currentStep: 2, error: 'old' },
      contributorActions.clearError(),
    );
    expect(state.error).toBeNull();

    state = contributorReducer(state, contributorActions.setCurrentStep(1));
    expect(state.currentStep).toBe(1);
  });

  test('markStepCompleted adds a step once', () => {
    let state = contributorReducer(
      { ...initial(), currentStep: 3, completedSteps: [0, 1, 2] },
      contributorActions.markStepCompleted(3),
    );
    state = contributorReducer(state, contributorActions.markStepCompleted(3));

    expect(state.completedSteps).toEqual([0, 1, 2, 3]);
  });
});

describe('contributor selectors', () => {
  test('read the contributor state', () => {
    const state = createTestStore({
      contributor: {
        ...initial(),
        currentStep: 2,
        completedSteps: [0, 1],
        githubLinked: true,
        githubUsername: 'octocat',
        activeChallenge: challenge,
        binding,
        isLoading: true,
        error: 'oops',
      },
    }).getState();

    expect(getContributorStep(state)).toBe(2);
    expect(getContributorCompletedSteps(state)).toEqual([0, 1]);
    expect(getContributorGithubLinked(state)).toBe(true);
    expect(getContributorGithubUsername(state)).toBe('octocat');
    expect(getContributorActiveChallenge(state)).toEqual(challenge);
    expect(getContributorBinding(state)).toEqual(binding);
    expect(getContributorIsLoading(state)).toBe(true);
    expect(getContributorError(state)).toBe('oops');
  });
});

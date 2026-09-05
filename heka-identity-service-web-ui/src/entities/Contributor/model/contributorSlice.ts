/**
 * contributorSlice.ts
 *
 * Redux slice managing contributor onboarding state throughout the 4-step wizard.
 *
 * State tracks:
 *   - GitHub OAuth status (linked / not linked)
 *   - Active GPG challenge (challengeId, nonce, expiresAt)
 *   - Verification result (gpgFingerprint, binding)
 *   - Credential issuance status
 *   - Loading and error states per async action
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';

import { getContributorOnboardingStatus } from '@/entities/User/model/services/getContributorOnboardingStatus';
import { getGithubAuthorizationUrl } from '@/entities/User/model/services/getGithubAuthorizationUrl';
import { requestContributorGpgChallenge, ContributorGpgChallenge } from '@/entities/User/model/services/requestContributorGpgChallenge';
import { verifyContributorGpgChallenge, VerifyContributorGpgChallengeResult } from '@/entities/User/model/services/verifyContributorGpgChallenge';
import { ContributorBinding, ContributorOnboardingStatus } from '@/entities/User/model/types/user';

export type OnboardingStep = 0 | 1 | 2 | 3;

export interface ContributorState {
  /** Current wizard step (0-indexed). */
  currentStep: OnboardingStep;
  /** Steps the user has completed. */
  completedSteps: OnboardingStep[];
  /** Whether a GitHub account is linked to this session. */
  githubLinked: boolean;
  /** GitHub username returned after OAuth. */
  githubUsername: string | null;
  /** GitHub account ID returned after OAuth. */
  githubAccountId: string | null;
  /** The active GPG challenge. Present from Step 2 onwards. */
  activeChallenge: ContributorGpgChallenge | null;
  /** GPG verification result. Present after Step 3. */
  verificationResult: VerifyContributorGpgChallengeResult | null;
  /** The contributor wallet binding (populated after verification). */
  binding: ContributorBinding | null;
  /** Whether the credential has been issued and received into the wallet. */
  credentialIssued: boolean;
  /** Global loading flag for async actions. */
  isLoading: boolean;
  /** Error message from the most recent failed action. */
  error: string | null;
}

const initialState: ContributorState = {
  currentStep: 0,
  completedSteps: [],
  githubLinked: false,
  githubUsername: null,
  githubAccountId: null,
  activeChallenge: null,
  verificationResult: null,
  binding: null,
  credentialIssued: false,
  isLoading: false,
  error: null,
};

export const contributorSlice = createSlice({
  name: 'contributor',
  initialState,
  reducers: {
    setCurrentStep(state, action: PayloadAction<OnboardingStep>) {
      state.currentStep = action.payload;
    },
    markStepCompleted(state, action: PayloadAction<OnboardingStep>) {
      if (!state.completedSteps.includes(action.payload)) {
        state.completedSteps.push(action.payload);
      }
    },
    setGithubLinked(
      state,
      action: PayloadAction<{ githubAccountId: string; githubUsername: string }>,
    ) {
      state.githubLinked = true;
      state.githubAccountId = action.payload.githubAccountId;
      state.githubUsername = action.payload.githubUsername;
    },
    setCredentialIssued(state) {
      state.credentialIssued = true;
      if (!state.completedSteps.includes(3)) {
        state.completedSteps.push(3);
      }
    },
    clearError(state) {
      state.error = null;
    },
    resetOnboarding() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    // ── getGithubAuthorizationUrl ─────────────────────────────────────────
    builder
      .addCase(getGithubAuthorizationUrl.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(getGithubAuthorizationUrl.fulfilled, (state) => {
        state.isLoading = false;
      })
      .addCase(getGithubAuthorizationUrl.rejected, (state, action) => {
        state.isLoading = false;
        state.error = (action.payload as string) ?? 'Failed to get GitHub authorization URL';
      });

    // ── getContributorOnboardingStatus ───────────────────────────────────
    builder
      .addCase(getContributorOnboardingStatus.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(
        getContributorOnboardingStatus.fulfilled,
        (state, action: PayloadAction<ContributorOnboardingStatus>) => {
          const isGithubLinked =
            action.payload.verificationStatus === 'GitHubConnected' ||
            action.payload.verificationStatus === 'GpgVerified';
          const isGpgVerified =
            action.payload.verificationStatus === 'GpgVerified';

          state.isLoading = false;
          state.githubLinked = isGithubLinked;
          state.githubAccountId =
            action.payload.github?.accountId ??
            action.payload.binding?.githubAccountId ??
            null;
          state.githubUsername =
            action.payload.github?.username ??
            action.payload.binding?.githubUsername ??
            null;
          state.binding = action.payload.binding ?? null;
          if (isGithubLinked && !state.completedSteps.includes(0)) {
            state.completedSteps.push(0);
          }
          if (isGithubLinked && state.currentStep === 0) {
            state.currentStep = 1;
          }
          if (isGpgVerified && !state.completedSteps.includes(1)) {
            state.completedSteps.push(1);
          }
          if (isGpgVerified && !state.completedSteps.includes(2)) {
            state.completedSteps.push(2);
          }
          if (isGpgVerified) {
            state.currentStep = 3;
          }
          state.credentialIssued = Boolean(action.payload.credentialIssued);
        },
      )
      .addCase(getContributorOnboardingStatus.rejected, (state, action) => {
        state.isLoading = false;
        state.error = (action.payload as string) ?? 'Failed to fetch onboarding status';
      });

    // ── requestContributorGpgChallenge ───────────────────────────────────
    builder
      .addCase(requestContributorGpgChallenge.pending, (state) => {
        state.isLoading = true;
        state.error = null;
        state.activeChallenge = null;
      })
      .addCase(
        requestContributorGpgChallenge.fulfilled,
        (state, action: PayloadAction<ContributorGpgChallenge>) => {
          state.isLoading = false;
          state.activeChallenge = action.payload;
          if (!state.completedSteps.includes(1)) {
            state.completedSteps.push(1);
          }
          state.currentStep = 2;
        },
      )
      .addCase(requestContributorGpgChallenge.rejected, (state, action) => {
        state.isLoading = false;
        state.error = (action.payload as string) ?? 'Failed to request GPG challenge';
      });

    // ── verifyContributorGpgChallenge ────────────────────────────────────
    builder
      .addCase(verifyContributorGpgChallenge.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(
        verifyContributorGpgChallenge.fulfilled,
        (state, action: PayloadAction<VerifyContributorGpgChallengeResult>) => {
          state.isLoading = false;
          state.verificationResult = action.payload;
          if (action.payload.verified) {
            state.binding = action.payload.binding ?? null;
            if (!state.completedSteps.includes(2)) {
              state.completedSteps.push(2);
            }
            state.currentStep = 3;
          } else {
            state.error = action.payload.message ?? 'GPG signature verification failed';
          }
        },
      )
      .addCase(verifyContributorGpgChallenge.rejected, (state, action) => {
        state.isLoading = false;
        state.error = (action.payload as string) ?? 'GPG challenge verification failed';
      });
  },
});

export const {
  setCurrentStep,
  markStepCompleted,
  setGithubLinked,
  setCredentialIssued,
  clearError,
  resetOnboarding,
} = contributorSlice.actions;

export default contributorSlice.reducer;

import { PayloadAction } from '@reduxjs/toolkit';

import { buildSlice } from '@/shared/lib/store';

import { getContributorOnboardingStatus } from '../services/getContributorOnboardingStatus';
import { requestContributorGpgChallenge } from '../services/requestContributorGpgChallenge';
import { startGithubLink } from '../services/startGithubLink';
import { verifyContributorGpgChallenge } from '../services/verifyContributorGpgChallenge';
import { ContributorSchema, OnboardingStep } from '../types/contributor';

const initialState: ContributorSchema = {
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

export const contributorSlice = buildSlice({
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
      action: PayloadAction<{
        githubAccountId: string;
        githubUsername: string;
      }>,
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
    builder
      .addCase(startGithubLink.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(startGithubLink.fulfilled, (state) => {
        state.isLoading = false;
      })
      .addCase(startGithubLink.rejected, (state, action) => {
        state.isLoading = false;
        state.error =
          action.payload ?? 'Failed to start GitHub account linking';
      });

    builder
      .addCase(getContributorOnboardingStatus.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(getContributorOnboardingStatus.fulfilled, (state, action) => {
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
      })
      .addCase(getContributorOnboardingStatus.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? 'Failed to fetch onboarding status';
      });

    builder
      .addCase(requestContributorGpgChallenge.pending, (state) => {
        state.isLoading = true;
        state.error = null;
        state.activeChallenge = null;
      })
      .addCase(requestContributorGpgChallenge.fulfilled, (state, action) => {
        state.isLoading = false;
        state.activeChallenge = action.payload;
        if (!state.completedSteps.includes(1)) {
          state.completedSteps.push(1);
        }
        state.currentStep = 2;
      })
      .addCase(requestContributorGpgChallenge.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? 'Failed to request GPG challenge';
      });

    builder
      .addCase(verifyContributorGpgChallenge.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(verifyContributorGpgChallenge.fulfilled, (state, action) => {
        state.isLoading = false;
        state.verificationResult = action.payload;
        if (action.payload.verified) {
          state.binding = action.payload.binding ?? null;
          if (!state.completedSteps.includes(2)) {
            state.completedSteps.push(2);
          }
          state.currentStep = 3;
        } else {
          state.error =
            action.payload.message ?? 'GPG signature verification failed';
        }
      })
      .addCase(verifyContributorGpgChallenge.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? 'GPG challenge verification failed';
      });
  },
});

export const { reducer: contributorReducer, actions: contributorActions } =
  contributorSlice;

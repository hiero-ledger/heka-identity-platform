// ContributorOnboarding.tsx
import React, { useCallback, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

import ROUTES from '@/app/routes/RoutePaths';
import { contributorSlice } from '@/entities/Contributor/model/contributorSlice';
import {
  getContributorStep,
  getContributorCompletedSteps,
  getContributorActiveChallenge,
  getContributorBinding,
  getContributorCredentialIssued,
  getContributorError,
  getContributorGithubUsername,
  getContributorIsLoading,
} from '@/entities/Contributor/model/contributorSelectors';
import { getContributorOnboardingStatus } from '@/entities/User/model/services/getContributorOnboardingStatus';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { $agencyApi } from '@/shared/api/config/api';
import { getAccessToken } from '@/shared/api/utils/token';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';
import { OnboardingStepper } from '@/pages/Contributor/components/OnboardingStepper';

import ChallengeStep from './steps/ChallengeStep';
import GithubLoginStep from './steps/GithubLoginStep';
import SignStep from './steps/SignStep';
import VerifyStep from './steps/VerifyStep';

import * as cls from './ContributorOnboarding.module.scss';

const ContributorOnboarding: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const currentStep     = useSelector(getContributorStep);
  const completedSteps  = useSelector(getContributorCompletedSteps);
  const activeChallenge = useSelector(getContributorActiveChallenge);
  const binding          = useSelector(getContributorBinding);
  const credentialIssued = useSelector(getContributorCredentialIssued);
  const isLoading        = useSelector(getContributorIsLoading);
  const error            = useSelector(getContributorError);
  const githubUsername   = useSelector(getContributorGithubUsername);

  // Load the current onboarding status on mount so we can fast-forward
  // the wizard if the user has already completed some steps.
  useEffect(() => {
    if (getAccessToken()) {
      void dispatch(getContributorOnboardingStatus());
    }
  }, [dispatch]);

  // Clear any Redux-level errors (handleError already toasts them globally)
  useEffect(() => {
    if (error) {
      dispatch(contributorSlice.actions.clearError());
    }
  }, [error, dispatch]);

  const handleChallengeReady = useCallback(() => {
    dispatch(contributorSlice.actions.setCurrentStep(2));
  }, [dispatch]);

  const handleVerified = useCallback(() => {
    dispatch(contributorSlice.actions.setCurrentStep(3));
    // Re-fetch status so the binding is populated in Redux
    // (the verify endpoint only returns gpgFingerprint, not the full binding)
    void dispatch(getContributorOnboardingStatus());
  }, [dispatch]);

  const handleRequestCredential = useCallback(async () => {
    if (!binding?.githubAccountId) {
      throw new Error('Contributor binding is missing. Complete GPG verification first.');
    }

    const response = await $agencyApi.post<{ credentialOffer: string }>(
      agencyEndpoints.contributorCredentialOffer,
      { githubAccountId: binding.githubAccountId },
    );

    window.postMessage(
      {
        source: 'heka-web-wallet-bridge',
        type: 'RECEIVE_OFFER',
        payload: { offerUri: response.data.credentialOffer },
      },
      '*',
    );
    dispatch(contributorSlice.actions.setCredentialIssued());
  }, [binding?.githubAccountId, dispatch]);

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <GithubLoginStep />;

      case 1:
        return (
          <ChallengeStep
            githubUsername={githubUsername}
            onChallengeReady={handleChallengeReady}
          />
        );

      case 2:
        if (!activeChallenge) {
          // Guard: shouldn't happen but fall back to challenge step
          dispatch(contributorSlice.actions.setCurrentStep(1));
          return null;
        }
        return (
          <SignStep
            challenge={activeChallenge}
            onVerified={handleVerified}
          />
        );

      case 3:
        return (
          <VerifyStep
            binding={binding}
            credentialIssued={credentialIssued}
            onRequestCredential={handleRequestCredential}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className={cls.container}>
      {/* Page header */}
      <div className={cls.header}>
        <button
          className={cls.backBtn}
          onClick={() => navigate(ROUTES.CONTRIBUTOR)}
          aria-label="Back to contributor hub"
        >
          <span className={cls.backIcon}>←</span>
          Back
        </button>
        <div>
          <h1 className={cls.title}>Contributor Onboarding</h1>
          <p className={cls.subtitle}>
            Verify your identity and receive your Hiero contributor credential
          </p>
        </div>
      </div>

      {/* Progress stepper */}
      <OnboardingStepper
        currentStep={currentStep}
        completedSteps={completedSteps as number[]}
        errorStep={error ? currentStep : undefined}
      />

      {/* Loading bar */}
      {isLoading && (
        <div className={cls.loadingBar}>
          <div className={cls.loadingBarFill} />
        </div>
      )}

      {/* Active step */}
      <div key={currentStep} className={cls.stepWrapper}>
        {renderStep()}
      </div>
    </div>
  );
};

export default ContributorOnboarding;
import React, { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import ROUTES from '@/app/routes/RoutePaths';
import {
  contributorActions,
  getContributorActiveChallenge,
  getContributorBinding,
  getContributorCompletedSteps,
  getContributorError,
  getContributorGithubUsername,
  getContributorIsLoading,
  getContributorOnboardingStatus,
  getContributorStep,
  requestContributorCredentialOffer,
} from '@/entities/Contributor';
import { OnboardingStepper } from '@/pages/Contributor/components/OnboardingStepper';
import { getSessionAccessToken } from '@/shared/auth/sessionBridge';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';

import ChallengeStep from './steps/ChallengeStep';
import GithubLoginStep from './steps/GithubLoginStep';
import SignStep from './steps/SignStep';
import VerifyStep from './steps/VerifyStep';

import * as cls from './ContributorOnboarding.module.scss';

const ContributorOnboarding: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const currentStep = useSelector(getContributorStep);
  const completedSteps = useSelector(getContributorCompletedSteps);
  const activeChallenge = useSelector(getContributorActiveChallenge);
  const binding = useSelector(getContributorBinding);
  const isLoading = useSelector(getContributorIsLoading);
  const error = useSelector(getContributorError);
  const githubUsername = useSelector(getContributorGithubUsername);
  const [walletTxCode, setWalletTxCode] = useState<string | null>(null);
  const [walletOfferExpiresAt, setWalletOfferExpiresAt] = useState<
    string | null
  >(null);

  // The status fast-forwards the wizard past the steps the user has completed
  useEffect(() => {
    if (getSessionAccessToken()) {
      void dispatch(getContributorOnboardingStatus());
    }
  }, [dispatch]);

  const handleChallengeReady = useCallback(() => {
    dispatch(contributorActions.setCurrentStep(2));
  }, [dispatch]);

  const handleVerified = useCallback(() => {
    dispatch(contributorActions.setCurrentStep(3));
    // The verify response has no binding; the status returns the verified one
    void dispatch(getContributorOnboardingStatus());
  }, [dispatch]);

  const handleCredentialStored = useCallback(() => {
    dispatch(contributorActions.markStepCompleted(3));
  }, [dispatch]);

  // The stepper marks the current step as failed until the user acts again: the thunks clear the
  // error when they start, and going back to request a new challenge clears it here
  const handleNeedNewChallenge = useCallback(() => {
    dispatch(contributorActions.clearError());
    dispatch(contributorActions.setCurrentStep(1));
  }, [dispatch]);

  const handleRequestCredential = useCallback(async () => {
    const { credentialOffer, txCode, expiresAt } = await dispatch(
      requestContributorCredentialOffer(),
    ).unwrap();

    setWalletTxCode(txCode);
    setWalletOfferExpiresAt(expiresAt);
    window.postMessage(
      {
        source: 'heka-web-wallet-bridge',
        type: 'RECEIVE_OFFER',
        payload: { offerUri: credentialOffer, expiresAt },
      },
      window.location.origin,
    );
  }, [dispatch]);

  useEffect(() => {
    if (currentStep === 2 && !activeChallenge) {
      dispatch(contributorActions.setCurrentStep(1));
    }
  }, [activeChallenge, currentStep, dispatch]);

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
        if (!activeChallenge) return null;
        return (
          <SignStep
            challenge={activeChallenge}
            onVerified={handleVerified}
            onNeedNewChallenge={handleNeedNewChallenge}
          />
        );

      case 3:
        return (
          <VerifyStep
            binding={binding}
            onRequestCredential={handleRequestCredential}
            onCredentialStored={handleCredentialStored}
            txCode={walletTxCode}
            offerExpiresAt={walletOfferExpiresAt}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className={cls.container}>
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

      <OnboardingStepper
        currentStep={currentStep}
        completedSteps={completedSteps as number[]}
        errorStep={error ? currentStep : undefined}
      />

      {isLoading && (
        <div className={cls.loadingBar}>
          <div className={cls.loadingBarFill} />
        </div>
      )}

      <div
        key={currentStep}
        className={cls.stepWrapper}
      >
        {renderStep()}
      </div>
    </div>
  );
};

export default ContributorOnboarding;

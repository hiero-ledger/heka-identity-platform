import React, { useCallback, useEffect } from 'react';
import { useSelector } from 'react-redux';

import { requestContributorGpgChallenge } from '@/entities/User/model/services/requestContributorGpgChallenge';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';

import * as cls from './Step.module.scss';

interface Props {
  githubUsername: string | null;
  onChallengeReady: () => void;
}

const ChallengeStep: React.FC<Props> = ({
  githubUsername,
  onChallengeReady,
}) => {
  const dispatch = useAppDispatch();

  const handleRequestChallenge = useCallback(async () => {
    if (!githubUsername) return;

    try {
      await dispatch(requestContributorGpgChallenge()).unwrap();
      onChallengeReady();
    } catch {
      // Error is handled in the Redux slice and displayed by the parent
    }
  }, [dispatch, githubUsername, onChallengeReady]);

  return (
    <div className={cls.step}>
      <div className={cls.stepIcon}>🔏</div>

      <h2 className={cls.stepHeading}>Generate a GPG Challenge</h2>

      {githubUsername && (
        <div className={cls.connectedBadge}>
          <span className={cls.connectedDot} />
          <span>
            Connected as <strong>@{githubUsername}</strong>
          </span>
        </div>
      )}

      <p className={cls.stepDescription}>
        Heka will generate a unique challenge nonce that you will sign with your GPG key.
        This proves that you control the GPG key registered on your GitHub account.
      </p>

      <ul className={cls.infoList}>
        <li>
          <span className={cls.infoIcon}>⏱️</span>
          <span>The challenge expires in 10 minutes — sign it promptly</span>
        </li>
        <li>
          <span className={cls.infoIcon}>🔐</span>
          <span>Use the GPG key associated with your GitHub account commits</span>
        </li>
        <li>
          <span className={cls.infoIcon}>💻</span>
          <span>Signing happens locally on your machine — the private key never leaves your device</span>
        </li>
      </ul>

      <button
        id="generate-challenge-btn"
        className={cls.primaryBtn}
        onClick={() => void handleRequestChallenge()}
        disabled={!githubUsername}
      >
        Generate Challenge
      </button>
    </div>
  );
};

export default ChallengeStep;

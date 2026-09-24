import React, { useCallback } from 'react';
import { useSelector } from 'react-redux';

import { getGithubAuthorizationUrl } from '@/entities/User/model/services/getGithubAuthorizationUrl';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';

import * as cls from './Step.module.scss';

interface Props {
  onSkip?: () => void;
}

const GithubLoginStep: React.FC<Props> = () => {
  const dispatch = useAppDispatch();

  const handleGithubLogin = useCallback(async () => {
    try {
      const result = await dispatch(getGithubAuthorizationUrl()).unwrap();
      // Redirect the browser to GitHub's OAuth page
      window.location.href = result.authorizationUrl;
    } catch (err) {
      // The error is already saved in the Redux store and shown via toast
      console.error('Failed to get GitHub authorization URL:', err);
    }
  }, [dispatch]);

  return (
    <div className={cls.step}>
      <div className={cls.stepIcon}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
        </svg>
      </div>

      <h2 className={cls.stepHeading}>Connect your GitHub account</h2>
      <p className={cls.stepDescription}>
        Heka needs to verify your GitHub identity before generating your contributor
        credential. Click below to authorise with GitHub.
      </p>

      <ul className={cls.infoList}>
        <li>
          <span className={cls.infoIcon}>🔒</span>
          <span>Heka only reads your public profile and account ID — no write access</span>
        </li>
        <li>
          <span className={cls.infoIcon}>🪪</span>
          <span>Your GitHub Account ID is used as the primary identity claim in your credential</span>
        </li>
        <li>
          <span className={cls.infoIcon}>🔑</span>
          <span>You will be redirected back here automatically after authorisation</span>
        </li>
      </ul>

      <button
        id="github-login-btn"
        className={cls.primaryBtn}
        onClick={() => void handleGithubLogin()}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
        </svg>
        Continue with GitHub
      </button>

      <p className={cls.privacyNote}>
        By continuing, you agree to Hiera's{' '}
        <a
          href="https://hiero.org/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className={cls.link}
        >
          privacy policy
        </a>
        . Your private key never leaves your device.
      </p>
    </div>
  );
};

export default GithubLoginStep;

// ContributorHub.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';

import ROUTES from '@/app/routes/RoutePaths';

import * as cls from './ContributorHub.module.scss';

const STEPS = [
  {
    title: 'Connect GitHub',
    text: 'Link your GitHub account via OAuth to prove account ownership',
  },
  {
    title: 'GPG Challenge',
    text: 'Sign a nonce with your GPG key to prove commit-signing capability',
  },
  {
    title: 'Receive Credential',
    text: 'Get your GithubContributorCredential issued into your Web Wallet',
  },
];

const ContributorHub: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className={cls.container}>
      {/* Hero */}
      <div className={cls.heroPanel}>
        <div className={cls.heroIconWrap}>
          <span className={cls.heroIcon}>🏅</span>
        </div>
        <h1 className={cls.heroTitle}>Hiero Contributor Portal</h1>
        <p className={cls.heroSubtitle}>
          Verify your identity, receive your contributor credential, and unlock
          identity-gated participation in the Hiero ecosystem.
        </p>
      </div>

      {/* Steps overview */}
      <div>
        <p className={cls.sectionLabel}>3 Steps</p>
        <div className={cls.stepsGrid}>
          {STEPS.map((step, i) => (
            <div className={cls.stepRow} key={step.title}>
              <div className={cls.stepNumCol}>
                <span className={cls.stepNum}>{i + 1}</span>
                {i < STEPS.length - 1 && <span className={cls.stepLine} />}
              </div>
              <div className={cls.stepCard}>
                <h3 className={cls.stepTitle}>{step.title}</h3>
                <p className={cls.stepText}>{step.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Wallet status notice */}
      <div className={cls.walletNotice}>
        <div className={cls.walletIconWrap}>
          <span className={cls.walletIcon}>🔐</span>
        </div>
        <div>
          <p className={cls.walletTitle}>Install the Heka Web Wallet</p>
          <p className={cls.walletText}>
            For the best experience, install the{' '}
            <a
              href="https://chrome.google.com/webstore"
              target="_blank"
              rel="noopener noreferrer"
              className={cls.link}
            >
              Heka Web Wallet Chrome extension
            </a>{' '}
            before starting. Receiving the credential into your wallet is optional — you can
            complete onboarding without it.
          </p>
        </div>
      </div>

      <button
        id="start-onboarding-btn"
        className={cls.startBtn}
        onClick={() => navigate(ROUTES.CONTRIBUTOR_ONBOARDING)}
      >
        Start Contributor Onboarding
        <span className={cls.btnArrow}>→</span>
      </button>
    </div>
  );
};

export default ContributorHub;
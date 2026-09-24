import React, { useCallback, useState } from 'react';

import type { ContributorBinding } from '@/entities/User/model/types/user';

import * as cls from './Step.module.scss';

interface Props {
  binding: ContributorBinding | null;
  credentialIssued: boolean;
  onRequestCredential: () => Promise<void>;
}

type WalletStatus = 'idle' | 'sending' | 'sent' | 'error' | 'not_installed';

const VerifyStep: React.FC<Props> = ({ binding, credentialIssued, onRequestCredential }) => {
  const [walletStatus, setWalletStatus] = useState<WalletStatus>('idle');

  const EXTENSION_SOURCE = 'heka-extension-bridge';
  const HEKA_SOURCE = 'heka-web-wallet-bridge';

  const handleReceiveInWallet = useCallback(async () => {
    setWalletStatus('sending');

    // Check if the Heka extension is installed by sending a PING
    // The extension content script responds with PONG if installed
    const pingResult = await new Promise<boolean>((resolve) => {
      const handleMessage = (event: MessageEvent) => {
        if (event.data?.source === EXTENSION_SOURCE && event.data?.type === 'PING_RESPONSE') {
          clearTimeout(timeout);
          window.removeEventListener('message', handleMessage);
          resolve(true);
        }
      };
      
      const timeout = setTimeout(() => {
        window.removeEventListener('message', handleMessage);
        resolve(false);
      }, 1500);

      window.addEventListener('message', handleMessage);
      window.postMessage({ source: HEKA_SOURCE, type: 'PING' }, '*');
    });

    if (!pingResult) {
      setWalletStatus('not_installed');
      return;
    }

    try {
      await onRequestCredential();
      setWalletStatus('sent');
    } catch {
      setWalletStatus('error');
    }
  }, [onRequestCredential]);

  return (
    <div className={cls.step}>
      {/* Success banner */}
      <div className={cls.successBanner}>
        <span className={cls.successCheck}>✓</span>
        <div>
          <h2 className={cls.successHeading}>Identity Verified!</h2>
          <p className={cls.successSubtext}>
            Your GPG key has been verified against your GitHub account.
          </p>
        </div>
      </div>

      {/* Binding details */}
      {binding && (
        <div className={cls.bindingCard}>
          <div className={cls.bindingRow}>
            <span className={cls.bindingLabel}>GitHub Account</span>
            <span className={cls.bindingValue}>@{binding.githubUsername}</span>
          </div>
          <div className={cls.bindingRow}>
            <span className={cls.bindingLabel}>Account ID</span>
            <code className={cls.bindingCode}>{binding.githubAccountId}</code>
          </div>
          {binding.gpgFingerprint && (
            <div className={cls.bindingRow}>
              <span className={cls.bindingLabel}>GPG Fingerprint</span>
              <code className={cls.bindingCode}>{binding.gpgFingerprint}</code>
            </div>
          )}
          <div className={cls.bindingRow}>
            <span className={cls.bindingLabel}>Verified At</span>
            <span className={cls.bindingValue}>
              {binding.verifiedAt
                ? new Date(binding.verifiedAt).toLocaleString()
                : 'Just now'}
            </span>
          </div>
        </div>
      )}

      {/* Credential receive section — optional feature */}
      <div className={cls.walletSection}>
        <h3 className={cls.walletHeading}>Receive your Credential <span className={cls.optionalTag}>Optional</span></h3>
        <p className={cls.walletDescription}>
          Your <code className={cls.inlineCode}>GithubContributorCredential</code> is ready to be
          issued. You can receive it into your Heka Web Wallet extension now, or do it later from
          your profile.
        </p>

        {walletStatus === 'not_installed' && (
          <div className={cls.warningBox}>
            <span>⚠️</span>
            <div>
              <p>Heka Web Wallet extension not detected.</p>
              <a
                href="https://chrome.google.com/webstore"
                target="_blank"
                rel="noopener noreferrer"
                className={cls.link}
              >
                Install from Chrome Web Store
              </a>
              {' · '}
              <button
                className={cls.textBtn}
                onClick={() => void handleReceiveInWallet()}
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {walletStatus === 'sent' && (
          <div className={cls.successBox}>
            <span>✅</span>
            <p>Offer sent to your Heka Web Wallet. Check the extension popup to complete receipt.</p>
          </div>
        )}

        {walletStatus === 'error' && (
          <div className={cls.errorBox}>
            <span>⚠️</span>
            <p>Failed to send credential offer. Please try again or use your wallet manually.</p>
          </div>
        )}

        {(walletStatus === 'idle' || walletStatus === 'error' || walletStatus === 'not_installed') && (
          <button
            id="receive-in-wallet-btn"
            className={cls.walletBtn}
            onClick={() => void handleReceiveInWallet()}
            disabled={credentialIssued}
          >
            {credentialIssued ? '✓ Credential already in Wallet' : '🔐 Receive into Web Wallet'}
          </button>
        )}

        <p className={cls.skipNote}>
          You can always receive your credential later from your Heka profile page.
          Completing this step is <strong>not required</strong> to finish onboarding.
        </p>
      </div>
    </div>
  );
};

export default VerifyStep;

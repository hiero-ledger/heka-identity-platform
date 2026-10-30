import React, { useCallback, useEffect, useState } from 'react';

import type { ContributorBinding } from '@/entities/User/model/types/user';

import * as cls from './Step.module.scss';

interface Props {
  binding: ContributorBinding | null;
  credentialIssued: boolean;
  onRequestCredential: () => Promise<void>;
  onCredentialStored: () => void;
}

type WalletStatus = 'idle' | 'sending' | 'sent' | 'received' | 'error' | 'not_installed';

const VerifyStep: React.FC<Props> = ({
  binding,
  credentialIssued,
  onRequestCredential,
  onCredentialStored,
}) => {
  const [walletStatus, setWalletStatus] = useState<WalletStatus>('idle');
  const [receiveError, setReceiveError] = useState<string | null>(null);

  const EXTENSION_SOURCE = 'heka-extension-bridge';
  const HEKA_SOURCE = 'heka-web-wallet-bridge';
  const stored = credentialIssued || walletStatus === 'received';

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.source !== EXTENSION_SOURCE || event.data?.type !== 'RECEIVE_STATUS') return;
      const status = event.data.payload as { state?: string; message?: string } | undefined;
      if (status?.state === 'done') {
        setReceiveError(null);
        setWalletStatus('received');
        onCredentialStored();
      } else if (status?.state === 'error') {
        setReceiveError(status.message ?? 'The wallet could not store the credential.');
        setWalletStatus('error');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onCredentialStored]);

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
              <p>
                Heka Web Wallet extension not detected. Load it from this project&apos;s Chrome
                extension build, then try again.
              </p>
              <button
                className={cls.textBtn}
                onClick={() => void handleReceiveInWallet()}
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {walletStatus === 'sent' && !stored && (
          <div className={cls.successBox}>
            <span>✅</span>
            <p>Offer sent to your Heka Web Wallet. Keep the extension popup open until the credential is stored.</p>
          </div>
        )}

        {walletStatus === 'error' && (
          <div className={cls.errorBox}>
            <span>⚠️</span>
            <p>{receiveError ?? 'Failed to send credential offer. Please try again or use your wallet manually.'}</p>
          </div>
        )}

        {(stored || walletStatus === 'idle' || walletStatus === 'error' || walletStatus === 'not_installed') && (
          <button
            id="receive-in-wallet-btn"
            className={cls.walletBtn}
            onClick={() => void handleReceiveInWallet()}
            disabled={stored}
          >
            {stored ? '✓ Credential already in Wallet' : '🔐 Receive into Web Wallet'}
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

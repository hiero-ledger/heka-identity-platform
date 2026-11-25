import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CredentialOfferView } from '@/components/Steps/CredentialOffer/states/CredentialOfferView';
import {
  ContributorBinding,
  ContributorCredentialOffer,
  getContributorCredentialOfferState,
  requestContributorCredentialOffer,
  unlinkGithub,
} from '@/entities/Contributor';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';
import { onReceiveStatus } from '@/shared/lib/webWallet';
import { Button } from '@/shared/ui/Button';
import useConfirmDialog, { ConfirmForm } from '@/shared/ui/ConfirmDialog';
import { Column } from '@/shared/ui/Grid';

import * as cls from './Step.module.scss';

const OFFER_POLL_INTERVAL_MS = 2000;

interface Props {
  binding: ContributorBinding | null;
  onCredentialStored: () => void;
  onUnlinked: () => void;
}

/** The requested offer: polled while `pending`, `unchecked` after a failed poll */
type OfferProgress =
  | 'pending'
  | 'unchecked'
  | 'received'
  | 'failed'
  | 'expired';

const VerifyStep: React.FC<Props> = ({
  binding,
  onCredentialStored,
  onUnlinked,
}) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const [offer, setOffer] = useState<ContributorCredentialOffer | null>(null);
  const [progress, setProgress] = useState<OfferProgress>('pending');
  const [isRequesting, setIsRequesting] = useState(false);

  const handleRequestOffer = useCallback(async () => {
    setIsRequesting(true);
    try {
      setOffer(await dispatch(requestContributorCredentialOffer()).unwrap());
      setProgress('pending');
    } catch {
      // The thunk shows the error, and the stepper marks the step as failed
    } finally {
      setIsRequesting(false);
    }
  }, [dispatch]);

  const handleReceived = useCallback(() => {
    setProgress('received');
    onCredentialStored();
  }, [onCredentialStored]);

  // The identity service sees the issuance whichever wallet redeems the offer
  useEffect(() => {
    if (!offer || progress !== 'pending') return;
    let isCurrent = true;
    const polling = setInterval(async () => {
      if (Date.parse(offer.expiresAt) <= Date.now()) {
        setProgress('expired');
        return;
      }
      const result = await dispatch(
        getContributorCredentialOfferState(offer.issuanceSessionId),
      );
      if (!isCurrent) return;
      if (getContributorCredentialOfferState.rejected.match(result)) {
        setProgress('unchecked');
      } else if (result.payload.state === 'Completed') {
        handleReceived();
      } else if (result.payload.state === 'Error') {
        setProgress('failed');
      }
    }, OFFER_POLL_INTERVAL_MS);
    return () => {
      isCurrent = false;
      clearInterval(polling);
    };
  }, [dispatch, handleReceived, offer, progress]);

  // The Heka Web Wallet reports a stored credential before the next poll
  useEffect(() => {
    if (!offer) return;
    return onReceiveStatus(offer.credentialOffer, (status) => {
      if (status.state === 'done') handleReceived();
    });
  }, [handleReceived, offer]);

  const handleUnlink = useCallback(async () => {
    try {
      await dispatch(unlinkGithub()).unwrap();
      onUnlinked();
    } catch {
      // The thunk shows the error
    }
  }, [dispatch, onUnlinked]);

  const { dialogProps, confirm: confirmUnlink } = useConfirmDialog({
    text: t('Contributor.titles.unlink'),
    details: t('Contributor.messages.unlinkDetails'),
    acceptButtonText: t('Contributor.buttons.unlink'),
    onAccept: handleUnlink,
  });

  const requestOfferButton = (label: string) => (
    <Button
      onPress={() => void handleRequestOffer()}
      isLoading={isRequesting}
    >
      {label}
    </Button>
  );

  const renderOffer = () => {
    if (!offer)
      return requestOfferButton(t('Contributor.buttons.requestOffer'));

    switch (progress) {
      case 'received':
        return (
          <div className={cls.successBox}>
            <p>{t('Contributor.messages.credentialReceived')}</p>
          </div>
        );
      case 'failed':
      case 'expired':
        return (
          <>
            {progress === 'failed' ? (
              <div className={cls.errorBox}>
                <p>{t('Contributor.messages.offerFailed')}</p>
              </div>
            ) : (
              <div className={cls.warningBox}>
                <p>{t('Contributor.messages.offerExpired')}</p>
              </div>
            )}
            {requestOfferButton(t('Contributor.buttons.requestNewOffer'))}
          </>
        );
      default:
        return (
          <>
            {progress === 'unchecked' && (
              <div className={cls.warningBox}>
                <p>{t('Contributor.messages.offerUnchecked')}</p>
                <Button
                  buttonType="outlined"
                  isSmall
                  onPress={() => setProgress('pending')}
                >
                  {t('Contributor.buttons.checkAgain')}
                </Button>
              </div>
            )}
            <Column className={cls.offerPanel}>
              <CredentialOfferView
                value={offer.credentialOffer}
                txCode={offer.txCode}
                expiresAt={offer.expiresAt}
              />
            </Column>
          </>
        );
    }
  };

  return (
    <div className={cls.step}>
      <div className={cls.successBanner}>
        <span className={cls.successCheck}>✓</span>
        <div>
          <h2 className={cls.successHeading}>Identity Verified!</h2>
          <p className={cls.successSubtext}>
            Your GPG key has been verified against your GitHub account.
          </p>
        </div>
      </div>

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
          <div className={cls.bindingActions}>
            <Button
              buttonType="outlined"
              isSmall
              onPress={confirmUnlink}
            >
              {t('Contributor.buttons.unlink')}
            </Button>
          </div>
        </div>
      )}

      <div className={cls.walletSection}>
        <h3 className={cls.walletHeading}>
          Receive your Credential{' '}
          <span className={cls.optionalTag}>Optional</span>
        </h3>
        <p className={cls.walletDescription}>
          {t('Contributor.descriptions.receiveCredential')}
        </p>

        {renderOffer()}

        <p className={cls.skipNote}>
          Completing this step is <strong>not required</strong> to finish
          onboarding.
        </p>
      </div>

      <ConfirmForm {...dialogProps} />
    </div>
  );
};

export default VerifyStep;

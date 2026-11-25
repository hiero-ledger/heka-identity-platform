import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

import { useLatest } from '@/shared/lib/hooks/useLatest';
import {
  detectWebWallet,
  isCredentialOfferUri,
  isPresentationRequestUri,
  onExtensionReady,
  onNextResponse,
  onPresentStatus,
  onReceiveStatus,
  sendOffer,
  sendPresentationRequest,
  WebWalletResponse,
  WebWalletStatus,
} from '@/shared/lib/webWallet';
import { Button } from '@/shared/ui/Button';

const DETECTION_TIMEOUT_MS = 1500;

interface WebWalletButtonProps {
  /** An `openid-credential-offer:` or `openid4vp:` URI; the button stays hidden for any other */
  uri: string;
  /** The offer's expiry, passed on to the wallet */
  expiresAt?: string;
  /**
   * Receives the wallet's statuses of this item, and its refusal of the item as an `error`;
   * without it, an error is shown as a toast
   */
  onStatus?: (status: WebWalletStatus) => void;
}

/** Hands an OpenID offer or request to the Heka Web Wallet; rendered only when the extension answers */
export const WebWalletButton = ({
  uri,
  expiresAt,
  onStatus,
}: WebWalletButtonProps) => {
  const { t } = useTranslation();
  const [isDetected, setIsDetected] = useState(false);
  const onStatusRef = useLatest(onStatus);
  const unsubscribeRef = useRef<() => void>();

  useEffect(() => {
    const detection = new AbortController();
    void detectWebWallet(DETECTION_TIMEOUT_MS, detection.signal).then(
      (info) => {
        if (info) setIsDetected(true);
      },
    );
    // The bridge may arrive after the timeout, when the holder connects this site
    const unsubscribe = onExtensionReady(() => setIsDetected(true));
    return () => {
      detection.abort();
      unsubscribe();
    };
  }, []);

  // Stop listening to the sent item's answer and statuses when the URI changes or the button unmounts
  useEffect(
    () => () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = undefined;
    },
    [uri],
  );

  const isOffer = isCredentialOfferUri(uri);

  const onPress = useCallback(() => {
    const handleStatus = (status: WebWalletStatus) => {
      if (onStatusRef.current) onStatusRef.current(status);
      else if (status.state === 'error') {
        toast.error(status.message || t('WebWallet.messages.failed'));
      }
    };
    const handleResponse = (response: WebWalletResponse) => {
      if (response.type === 'ERROR') {
        handleStatus({ state: 'error', message: response.message });
      }
    };

    unsubscribeRef.current?.();
    const unsubscribeStatus = isOffer
      ? onReceiveStatus(uri, handleStatus)
      : onPresentStatus(uri, handleStatus);
    const cancelResponse = onNextResponse(
      isOffer ? 'RECEIVE_OFFER' : 'PRESENT_REQUEST',
      handleResponse,
    );
    unsubscribeRef.current = () => {
      unsubscribeStatus();
      cancelResponse();
    };

    if (isOffer) sendOffer(uri, expiresAt);
    else sendPresentationRequest(uri);
  }, [expiresAt, isOffer, onStatusRef, t, uri]);

  if (!isDetected || (!isOffer && !isPresentationRequestUri(uri))) {
    return null;
  }

  return (
    <Button
      buttonType="filled"
      onPress={onPress}
    >
      {t('WebWallet.buttons.open')}
    </Button>
  );
};

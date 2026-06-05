import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';

import { PresentationRequestContext } from '@/components/Steps';
import { getPresentationRequestIsLoading } from '@/entities/Presentation/model/selectors/presentationSelector';
import { requestPresentation } from '@/entities/Presentation/model/services/requestPresentation';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';
import { Button } from '@/shared/ui/Button';
import { Column, Row } from '@/shared/ui/Grid';
import { Loader } from '@/shared/ui/Loader/Loader';

import * as cls from '../VerificationRequest.module.scss';

interface DcApiPresentationProps {
  context: PresentationRequestContext;
  onBack?: () => void;
}

/**
 * Presentation via the W3C Digital Credentials API. Unlike the QR flow, the request must be
 * initiated from a user gesture (the button below), since `navigator.credentials.get()` requires
 * transient activation. The browser orchestrates the rest: on this device the OS picker opens; on
 * desktop the browser shows its own QR and runs a cross-device (Bluetooth) handshake to a phone —
 * the same `requestPresentation` thunk (`useDcApi: true`) drives both. While in flight the request
 * can be aborted (Cancel) via the thunk's AbortSignal, which matters for the long cross-device wait.
 */
export const DcApiPresentation = ({
  context,
  onBack,
}: DcApiPresentationProps) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const isLoading = useSelector(getPresentationRequestIsLoading);
  const [error, setError] = useState<string | undefined>();
  const requestRef = useRef<{ abort: () => void } | null>(null);

  const onPresent = async () => {
    if (!context.protocolType || !context.credentialType || !context.schema) {
      setError(t('VerifyCredential.errors.BadContext'));
      return;
    }

    setError(undefined);

    const request = dispatch(
      requestPresentation({
        protocolType: context.protocolType,
        credentialType: context.credentialType,
        schema: context.schema,
        requestedAttributes: context.attributes,
        did: context.did,
        useDemo: context.useDemo,
        useDcApi: true,
      }),
    );
    requestRef.current = request;

    const result = await request;
    requestRef.current = null;

    if (requestPresentation.rejected.match(result)) {
      // `meta.aborted` is set when we abort via Cancel; otherwise the payload carries the
      // classified DcApiErrorCode ('cancelled' | 'unsupported' | 'failed') from the thunk.
      const code = result.meta.aborted ? 'cancelled' : result.payload;
      if (code === 'cancelled') {
        setError(t('PresentationOptions.errors.cancelled'));
      } else if (code === 'unsupported') {
        setError(t('PresentationOptions.errors.unsupported'));
      } else {
        setError(t('PresentationOptions.errors.failed'));
      }
    }
  };

  const onCancel = () => {
    requestRef.current?.abort();
  };

  return (
    <Column className={cls.requestContent}>
      <Column
        justifyContent="flex-start"
        alignItems="flex-start"
        className={cls.header}
      >
        <Row className={cls.title}>{t('PresentationOptions.titles.dcApi')}</Row>
        <Row className={cls.description}>
          <p>{t('PresentationOptions.descriptions.dcApi')}</p>
        </Row>
      </Column>
      <Column
        className={cls.mainContent}
        justifyContent="center"
        alignItems="center"
      >
        {isLoading ? (
          <Column className={cls.buttonGroup}>
            <Loader />
            <Button
              buttonType="text"
              onPress={onCancel}
            >
              {t('PresentationOptions.buttons.cancel')}
            </Button>
          </Column>
        ) : (
          <Column className={cls.buttonGroup}>
            <Button
              buttonType="filled"
              onPress={onPresent}
            >
              {t('PresentationOptions.buttons.present')}
            </Button>
            {error && (
              <Row className={cls.description}>
                <p>{error}</p>
              </Row>
            )}
            {onBack && (
              <Button
                buttonType="text"
                className={cls.textButton}
                onPress={onBack}
              >
                {t('Common.buttons.back')}
              </Button>
            )}
          </Column>
        )}
      </Column>
    </Column>
  );
};

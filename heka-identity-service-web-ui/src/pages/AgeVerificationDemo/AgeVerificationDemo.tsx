import { useEffect, useRef, useState } from 'react';

import { BasicPanel } from '@/components/Panel';
import { QRCode } from '@/components/QRCode';
import { StepHeader } from '@/components/StepTitle';
import { $agencyApi } from '@/shared/api/config/api';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { OpenIdPresentationState } from '@/entities/Presentation/model/types/presentation';
import IconCar from '@/shared/assets/icons/car.svg';
import SuccessIcon from '@/shared/assets/icons/success.svg';
import { Button } from '@/shared/ui/Button';
import { Column, Row } from '@/shared/ui/Grid';
import { Loader } from '@/shared/ui/Loader/Loader';

import * as stpCls from '../../components/Steps/Steps.module.scss';
import * as vrCls from '../../components/Steps/VerificationRequest/VerificationRequest.module.scss';

import * as cls from './AgeVerificationDemo.module.scss';

const MDL_TEMPLATE_ID = 'dc5cca95-3099-4499-ad44-d8214e98978d';
const MDL_AGE_FIELD = 'age_over_18';
const POLL_INTERVAL_MS = 2000;

type DemoState = 'idle' | 'loading' | 'qr' | 'verified' | 'error';

const AgeVerificationDemo = () => {
  const [demoState, setDemoState] = useState<DemoState>('idle');
  const [qrContent, setQrContent] = useState<string>('');
  const [sessionId, setSessionId] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  useEffect(() => {
    if (demoState !== 'qr' || !sessionId) return;

    pollingRef.current = setInterval(async () => {
      try {
        const res = await $agencyApi.get(
          agencyEndpoints.updateOpenIdPresentationState(sessionId),
        );
        if (res.data?.state === OpenIdPresentationState.ResponseVerified) {
          stopPolling();
          setDemoState('verified');
        }
      } catch {
        // silently retry
      }
    }, POLL_INTERVAL_MS);

    return stopPolling;
  }, [demoState, sessionId]);

  const handleVerifyClick = async () => {
    setDemoState('loading');
    setErrorMsg('');
    try {
      const res = await $agencyApi.post('/v2/credentials/proof-by-template', {
        templateId: MDL_TEMPLATE_ID,
        fields: [MDL_AGE_FIELD],
      });
      setQrContent(res.data.request);
      setSessionId(res.data.id);
      setDemoState('qr');
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : 'Failed to create verification request';
      setErrorMsg(msg);
      setDemoState('error');
    }
  };

  const handleReset = () => {
    stopPolling();
    setDemoState('idle');
    setQrContent('');
    setSessionId('');
    setErrorMsg('');
  };

  if (demoState === 'verified') {
    return (
      <Row className={cls.AgeDemo}>
        <BasicPanel
          title="Age Verification"
          icon="car"
        />
        <Column
          className={vrCls.presentationReceivedWrapper}
          justifyContent="center"
          alignItems="center"
        >
          <Row className={vrCls.presentationImageWrapper}>
            <IconCar
              height={230}
              width={240}
            />
            <SuccessIcon
              height={126}
              width={126}
              className={vrCls.successIcon}
            />
          </Row>
          <Row className={vrCls.title}>Age Verified</Row>
          <Column className={vrCls.buttonGroup}>
            <Button
              buttonType="outlined"
              onPress={handleReset}
            >
              Start Over
            </Button>
          </Column>
        </Column>
      </Row>
    );
  }

  if (demoState === 'loading' || demoState === 'qr') {
    return (
      <Row className={cls.AgeDemo}>
        <BasicPanel
          title="Age Verification"
          icon="car"
        />
        <Column className={vrCls.requestContent}>
          <Column
            justifyContent="flex-start"
            alignItems="flex-start"
            className={vrCls.header}
          >
            <Row className={vrCls.title}>Verification Request</Row>
            <Row className={vrCls.description}>
              <p>
                Scan the QR code with your mobile wallet to share your age from
                your mDL.
              </p>
            </Row>
          </Column>
          <Column
            className={vrCls.mainContent}
            justifyContent="center"
            alignItems="center"
          >
            {demoState === 'loading' && <Loader />}
            {demoState === 'qr' && qrContent && (
              <QRCode content={qrContent} />
            )}
          </Column>
          {demoState === 'qr' && (
            <Row
              className={stpCls.stepNavigation}
              justifyContent="flex-end"
            >
              <Button
                buttonType="outlined"
                onPress={handleReset}
              >
                Cancel
              </Button>
            </Row>
          )}
        </Column>
      </Row>
    );
  }

  return (
    <Row className={cls.AgeDemo}>
      <BasicPanel
        title="Age Verification"
        icon="car"
      />
      <Column
        className={stpCls.stepContent}
        alignItems="center"
      >
        <StepHeader
          title={
            demoState === 'error'
              ? 'Something went wrong'
              : 'Age Verification Demo'
          }
          details={
            demoState === 'error'
              ? [errorMsg]
              : [
                  "Verify a holder's age using their mobile driver's license (mDL).",
                ]
          }
        />
        <Row className={stpCls.stepNavigation}>
          <Button onPress={handleVerifyClick}>Verify Age by mDL</Button>
        </Row>
      </Column>
    </Row>
  );
};

export default AgeVerificationDemo;

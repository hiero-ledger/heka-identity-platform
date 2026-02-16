import React, { useEffect } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';

import { VerificationRequestProps } from '@/components/Steps';
import { PendingPresentation } from '@/components/Steps/VerificationRequest/states/PendingPresentation';
import { PresentationReceived } from '@/components/Steps/VerificationRequest/states/PresentationReceived';
import {
  getPresentationRequest,
  getIsPresentationCompleted,
} from '@/entities/Presentation/model/selectors/presentationSelector';
import { requestPresentation } from '@/entities/Presentation/model/services/requestPresentation';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';
import { Row } from '@/shared/ui/Grid';

import * as cls from '../VerificationRequest.module.scss';

export const PresentationRequested = <T extends object>({
  context,
}: VerificationRequestProps<T>) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const presentationRequest = useSelector(getPresentationRequest);

  useEffect(() => {
    if (!context.protocolType || !context.credentialType || !context.schema) {
      toast.error(t('VerifyCredential.errors.BadContext'));
      return;
    }

    dispatch(
      requestPresentation({
        protocolType: context.protocolType,
        credentialType: context.credentialType,
        schema: context.schema,
        requestedAttributes: context.attributes,
        did: context.did,
        useDemo: context.useDemo,
      }),
    );
  }, [
    t,
    dispatch,
    context.protocolType,
    context.credentialType,
    context.did,
    context.schema,
    context.attributes,
    context.useDemo,
  ]);

  return (
    <PendingPresentation
      value={presentationRequest}
      protocolType={context.protocolType}
      useDemo={context.useDemo}
    />
  );
};

export const OpenIdVerificationRequest = <T extends object>(
  props: VerificationRequestProps<T>,
) => {
  const isPresentationCompleted = useSelector(getIsPresentationCompleted);

  return (
    <Row className={cls.VerificationRequest}>
      {isPresentationCompleted ? (
        <PresentationReceived {...props} />
      ) : (
        <PresentationRequested {...props} />
      )}
    </Row>
  );
};

import React, { useCallback } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';

import { VerificationRequestProps } from '@/components/Steps';
import { PendingPresentation } from '@/components/Steps/VerificationRequest/states/PendingPresentation';
import { PresentationReceived } from '@/components/Steps/VerificationRequest/states/PresentationReceived';
import { getIsPresentationCompleted } from '@/entities/Presentation/model/selectors/presentationSelector';
import { requestPresentation } from '@/entities/Presentation/model/services/requestPresentation';
import { useConnection } from '@/shared/hooks/connection';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';
import { Row } from '@/shared/ui/Grid';

import * as cls from '../VerificationRequest.module.scss';

export const PresentationRequested = <T extends object>({
  context,
}: VerificationRequestProps<T>) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const sendPresentationRequest = useCallback(
    (connectionId?: string) => {
      if (
        !context.protocolType ||
        !context.credentialType ||
        !context.attributes ||
        !context.schema
      ) {
        toast.error(t('VerifyCredential.errors.BadContext'));
        return;
      }

      dispatch(
        requestPresentation({
          protocolType: context.protocolType,
          credentialType: context.credentialType,
          connectionId,
          schema: context.schema,
          requestedAttributes: context.attributes,
          did: context.did,
          useDemo: context.useDemo,
        }),
      );
    },
    [
      t,
      dispatch,
      context.protocolType,
      context.credentialType,
      context.did,
      context.schema,
      context.attributes,
      context.useDemo,
    ],
  );

  const { connectionInvitation } = useConnection({
    onComplete: sendPresentationRequest,
  });

  return (
    <PendingPresentation
      value={connectionInvitation}
      protocolType={context.protocolType}
    />
  );
};

export const AnoncredsVerificationRequest = <T extends object>(
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

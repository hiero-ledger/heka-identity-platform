import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';

import { VerificationRequestProps } from '@/components/Steps';
import { DcApiPresentation } from '@/components/Steps/VerificationRequest/states/DcApiPresentation';
import { PendingPresentation } from '@/components/Steps/VerificationRequest/states/PendingPresentation';
import { PresentationReceived } from '@/components/Steps/VerificationRequest/states/PresentationReceived';
import {
  getPresentationRequest,
  getIsPresentationCompleted,
} from '@/entities/Presentation/model/selectors/presentationSelector';
import { requestPresentation } from '@/entities/Presentation/model/services/requestPresentation';
import { isDcApiSupported } from '@/shared/lib/dcApi';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';
import { Button } from '@/shared/ui/Button';
import { Column, Row } from '@/shared/ui/Grid';

import * as cls from '../VerificationRequest.module.scss';

const QrPresentation = <T extends object>({
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

const VerificationMethodSelect = ({
  onSelect,
}: {
  onSelect: (method: 'qr' | 'dcApi') => void;
}) => {
  const { t } = useTranslation();

  return (
    <Column className={cls.requestContent}>
      <Column
        justifyContent="flex-start"
        alignItems="flex-start"
        className={cls.header}
      >
        <Row className={cls.title}>{t('PresentationOptions.titles.chooseMethod')}</Row>
        <Row className={cls.description}>
          <p>{t('PresentationOptions.descriptions.chooseMethod')}</p>
        </Row>
      </Column>
      <Column
        className={cls.mainContent}
        justifyContent="center"
        alignItems="center"
      >
        <Column className={cls.buttonGroup}>
          <Button
            buttonType="filled"
            onPress={() => onSelect('dcApi')}
          >
            {t('PresentationOptions.buttons.dcApi')}
          </Button>
          <Button
            buttonType="filled"
            onPress={() => onSelect('qr')}
          >
            {t('PresentationOptions.buttons.qr')}
          </Button>
        </Column>
      </Column>
    </Column>
  );
};

export const PresentationRequested = <T extends object>(
  props: VerificationRequestProps<T>,
) => {
  const supportsDcApi = useMemo(() => isDcApiSupported(), []);
  const [method, setMethod] = useState<'qr' | 'dcApi' | null>(
    supportsDcApi ? null : 'qr',
  );

  if (method === null) {
    return <VerificationMethodSelect onSelect={setMethod} />;
  }

  if (method === 'dcApi') {
    return (
      <DcApiPresentation
        context={props.context}
        onBack={() => setMethod(null)}
      />
    );
  }

  return <QrPresentation {...props} />;
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

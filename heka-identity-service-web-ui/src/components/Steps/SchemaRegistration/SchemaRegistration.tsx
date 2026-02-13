import React, { useCallback } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';

import { InfoRow } from '@/components/Steps/SchemaRegistration/InfoRow/InfoRow';
import { StepTitle } from '@/components/StepTitle';
import { ProtocolType, Schema } from '@/entities/Schema';
import { selectSchemaLoading } from '@/entities/Schema/model/selectors/schemasSelector';
import { getSingleSchema } from '@/entities/Schema/model/services/getSingleSchema';
import { registerSchema } from '@/entities/Schema/model/services/registerSchema';
import {
  CredentialFormat,
  credentialFormatToCredentialRegistrationFormat,
} from '@/entities/Schema/model/types/schema';
import { ApiError, errorMessage } from '@/shared/api/utils/error';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';
import { Button } from '@/shared/ui/Button';
import { Row } from '@/shared/ui/Grid';
import Column from '@/shared/ui/Grid/Column/Column';

import * as stpCls from '../Steps.module.scss';

import * as cls from './SchemaRegistration.module.scss';

interface SelectSchemaStepProps {
  title: string;
  protocolType?: ProtocolType;
  credentialType?: string;
  network?: string;
  did?: string;
  schema?: Schema;
  schemaName?: string;
  onPrev: () => void;
  onNext: () => void;
}

export const SchemaRegistration = ({
  title,
  schema,
  onPrev,
  onNext,
  ...props
}: SelectSchemaStepProps) => {
  const isLoading = useSelector(selectSchemaLoading);
  const dispatch = useAppDispatch();
  const { t } = useTranslation();

  const handleRegister = useCallback(async () => {
    if (
      !props.protocolType ||
      !props.credentialType ||
      !props.network ||
      !props.did
    ) {
      toast.error('Schema registration context is invalid');
      return false;
    }

    try {
      await dispatch(
        registerSchema({
          schemaId: schema!.id,
          protocol: props.protocolType!,
          credentialFormat: credentialFormatToCredentialRegistrationFormat(
            props.credentialType as CredentialFormat,
          ),
          network: props.network!,
          did: props.did!,
        }),
      ).unwrap();
      await dispatch(getSingleSchema(schema!.id)).unwrap();
      return onNext();
    } catch (error) {
      toast.error(
        errorMessage(
          (error as ApiError).response?.data.message ?? 'Unknown server error',
        ),
      );
    }
  }, [props, dispatch, onNext, schema]);

  return (
    <>
      <StepTitle title={title} />
      <Column className={cls.wrapper}>
        <p className={cls.description}>
          {t('SchemaRegistration.titles.main', {
            schemaName: schema?.name,
          })}
        </p>
        <Column className={cls.registrations}>
          <InfoRow
            property={'protocol'}
            title={t(`SchemaRegistration.titles.protocolType`)}
            value={props.protocolType}
          ></InfoRow>
          <InfoRow
            property={'credentialType'}
            title={t(`SchemaRegistration.titles.credentialFormat`)}
            value={credentialFormatToCredentialRegistrationFormat(
              props.credentialType as CredentialFormat,
            )}
          ></InfoRow>
          <InfoRow
            property={'network'}
            title={t(`SchemaRegistration.titles.network`)}
            value={props.network}
          ></InfoRow>
          <InfoRow
            property={'did'}
            title={t(`SchemaRegistration.titles.did`)}
            value={props.did}
          ></InfoRow>
        </Column>
      </Column>
      <Row className={stpCls.stepNavigation}>
        <Button
          buttonType="outlined"
          leftIcon="arrow-back"
          onPress={onPrev}
        >
          {t('Common.buttons.back')}
        </Button>
        <Button
          isLoading={isLoading}
          rightIcon="forward"
          onPress={handleRegister}
        >
          {t('IssueCredential.buttons.register')}
        </Button>
      </Row>
    </>
  );
};

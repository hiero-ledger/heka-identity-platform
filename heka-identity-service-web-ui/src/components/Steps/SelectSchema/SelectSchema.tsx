import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';

import { CreateSchemaModal } from '@/components/CreateSchema/CreateSchema';
import { PlusButton } from '@/components/PlusButton';
import { useMobile } from '@/components/Screen/Screen';
import { Option } from '@/components/Steps/SelectProtocolType/SelectProtocolType.const';
import { StepTitle } from '@/components/StepTitle';
import { defaultSchemaBackgroundColor } from '@/const/color';
import { defaultLogoImagePath } from '@/const/image';
import { ProtocolType, Schema } from '@/entities/Schema';
import {
  getSchema,
  getSchemas,
} from '@/entities/Schema/model/selectors/schemasSelector';
import { getDemoSchemaList } from '@/entities/Schema/model/services/getDemoSchemaList';
import { getSchemaList } from '@/entities/Schema/model/services/getSchemaList';
import { useSchemasActions } from '@/entities/Schema/model/slices/schemasSlice';
import {
  CredentialFormat,
  credentialFormatToCredentialRegistrationFormat,
  SchemaField,
} from '@/entities/Schema/model/types/schema';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';
import { Button } from '@/shared/ui/Button';
import { ButtonCards } from '@/shared/ui/ButtonCards';
import { Column, Row } from '@/shared/ui/Grid';
import { Select } from '@/shared/ui/Select';
import { calculateBorderColor, getTextColor } from '@/shared/utils/colors';

import * as stepCls from '../Steps.module.scss';

import * as cls from './SelectSchema.module.scss';

interface SelectSchemaStepProps {
  title: string;
  schema?: Schema;
  setSchema: (value: Schema) => void;
  setSchemaJson?: (value: Schema) => void;
  hasSchemaCreation?: boolean;
  onPrev?: () => void;
  onNext: () => void;
  useDemo?: boolean;
  useForVerification?: boolean;
  useForTemplate?: boolean;
  protocol?: ProtocolType;
  credentialType?: CredentialFormat;
  network?: string;
}

export const SelectSchema = ({
  title,
  protocol,
  credentialType,
  network,
  schema,
  hasSchemaCreation,
  setSchema,
  onPrev,
  onNext,
  useDemo = false,
  useForVerification = false,
  useForTemplate = false,
}: SelectSchemaStepProps) => {
  const { t } = useTranslation();
  const isMobile = useMobile();

  const [isSchemaModalOpen, setSchemaModalOpen] = useState(false);

  const dispatch = useAppDispatch();
  const { updateSchema } = useSchemasActions();

  const schemasList = useSelector(getSchemas);
  const singleSchema = useSelector(getSchema);

  const backgroundColor: string =
    schema?.bgColor ?? defaultSchemaBackgroundColor;

  useEffect(() => {
    if (useDemo) {
      dispatch(getDemoSchemaList());
    } else {
      dispatch(getSchemaList({ isHidden: false }));
    }
  }, [dispatch, useDemo]);

  useEffect(() => {
    if (singleSchema) {
      setSchema(singleSchema);
    }
    if (schemasList && !singleSchema) {
      setSchema(schemasList[0]);
    }
    // Attention: Don't add setSchema to dependencies array. It will provide infinity load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [singleSchema, schemasList]);

  useEffect(() => {
    if (schema) setSchema(schema);
    // Attention: Don't add setSchema to dependencies array. It will provide infinity load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, schemasList]);

  const selectOptions: Option[] = useMemo(() => {
    return (
      (schemasList ?? []).map((schema: Schema) => ({
        value: schema.id,
        content: schema.name ?? schema.id,
      })) ?? []
    );
  }, [schemasList]);

  const onSelectSchema = useCallback(
    (value: string) => {
      const selectedSchema = (schemasList ?? []).find(
        (schema) => schema.id === value,
      );
      if (!selectedSchema) return;
      updateSchema(selectedSchema);
    },
    [schemasList, updateSchema],
  );

  const onCreateSchema = useCallback(() => {
    setSchemaModalOpen(true);
  }, []);

  const onSchemaCreated = useCallback(
    async (schema: Schema) => {
      await dispatch(getSchemaList({ isHidden: false }));
      setSchema(schema);
    },
    // Attention: Don't add setSchema to dependencies array. It will provide infinity load
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dispatch],
  );

  const isSchemaRegistered = useCallback(() => {
    const isRegistered =
      schema?.registrations?.find(
        (s) =>
          (!protocol || s.protocol === protocol) &&
          (!credentialType ||
            s.credentialFormat ===
              credentialFormatToCredentialRegistrationFormat(
                credentialType,
              ).toString()) &&
          (!network || s.network === network),
      ) !== undefined;
    return isRegistered;
  }, [schema, protocol, credentialType, network]);

  return (
    <>
      <Row className={cls.header}>
        <StepTitle title={title} />
        {hasSchemaCreation && <PlusButton onPress={onCreateSchema} />}
      </Row>
      {!isMobile && (
        <ButtonCards
          selected={schema?.id}
          options={selectOptions}
          onChange={onSelectSchema}
          limitWidth
        />
      )}
      {isMobile && (
        <Select
          items={selectOptions}
          defaultSelectedKey={schema?.id}
          onSelect={onSelectSchema}
        />
      )}
      {useForVerification && schema && !isSchemaRegistered() && (
        <Row className={cls.warningText}>
          {useForTemplate
            ? t('Template.warnings.verification.schemaIsNotRegistered')
            : t('VerifyCredential.warnings.schemaIsNotRegistered')}
        </Row>
      )}
      {schema && (
        <Column className={cls.schemaDetail}>
          <div
            style={{
              backgroundColor,
              color: getTextColor(backgroundColor),
            }}
            className={cls.credentialCard}
          >
            <img
              src={schema.logo ?? defaultLogoImagePath}
              alt="schema logo"
              height={64}
              width={64}
              style={{ borderColor: calculateBorderColor(backgroundColor) }}
            />
            <span className={cls.schemaName}>{schema.name ?? schema.id}</span>
            <p className={cls.schemaLabel}>
              {schema.issuerName &&
                t('IssueCredential.schema.issuedBy', {
                  issuerName: schema.issuerName,
                })}
            </p>
          </div>
          <Column className={cls.column}>
            {schema.fields &&
              schema.fields.map((attribute: SchemaField) => (
                <Row
                  key={attribute.id}
                  justifyContent="flex-start"
                  alignItems="center"
                  className={cls.attribute}
                >
                  {attribute.name}
                </Row>
              ))}
          </Column>
        </Column>
      )}
      <Row className={stepCls.stepNavigation}>
        {onPrev && (
          <Button
            buttonType="outlined"
            leftIcon="arrow-back"
            onPress={onPrev}
          >
            {t('Common.buttons.back')}
          </Button>
        )}
        <Button
          rightIcon="forward"
          isDisabled={!schema || (useForVerification && !isSchemaRegistered())}
          onPress={onNext}
        >
          {t('Common.buttons.next')}
        </Button>
      </Row>
      <CreateSchemaModal
        isOpen={isSchemaModalOpen}
        onOpenChange={setSchemaModalOpen}
        onSchemaCreated={onSchemaCreated}
      />
    </>
  );
};

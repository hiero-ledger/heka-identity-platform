import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import { AppDispatch } from '@/app/providers/StoreProvider';
import ROUTES from '@/app/routes/RoutePaths';
import { SaveTemplateModal } from '@/components/SaveTemplateModal';
import { StepHeader } from '@/components/StepTitle';
import {
  Openid4CredentialFormat,
  ProtocolType,
} from '@/entities/Schema/model/types/schema';
import { getVerificationTemplatesIsLoading } from '@/entities/VerificationTemplate/model/selectors/verificationTemplatesSelector';
import { createVerificationTemplate } from '@/entities/VerificationTemplate/model/services/createVerificationTemplate';
import { updateVerificationTemplate } from '@/entities/VerificationTemplate/model/services/updateVerificationTemplate';
import { VerifyCredentialContext } from '@/pages/VerifyCredential/VerifyCredential.config';
import { Button } from '@/shared/ui/Button';
import { CheckboxGroup } from '@/shared/ui/CheckboxGroup/CheckboxGroup';
import { Row } from '@/shared/ui/Grid';

import * as cls from './RequestFieldsVerification.module.scss';

interface RequestFieldsVerificationProps {
  title: string;
  context: VerifyCredentialContext;
  onPrev: () => void;
  onNext: (attributes: Array<string>) => void;
}

export const RequestFieldsVerification = ({
  title,
  context,
  onPrev,
  onNext,
}: RequestFieldsVerificationProps) => {
  const { t } = useTranslation();
  const dispatch: AppDispatch = useDispatch();
  const navigate = useNavigate();
  const isLoading = useSelector(getVerificationTemplatesIsLoading);
  const [isTemplateModalOpen, setTemplateModalOpen] = useState(false);
  const { schema, protocolType, credentialType } = context;

  const [selectedAttributes, setSelectedAttributes] = useState<Array<string>>(
    [],
  );

  const allOptions = useMemo(() => {
    return schema?.fields?.map((field) => field.name) ?? [];
  }, [schema?.fields]);

  const supportSelectiveDisclosure = useMemo(
    () =>
      protocolType === ProtocolType.Aries ||
      credentialType === Openid4CredentialFormat.SdJwt,
    [protocolType, credentialType],
  );

  const initialOptions = useMemo(() => {
    return supportSelectiveDisclosure
      ? context.attributes
      : (schema?.fields?.map((field) => field.name) ?? []);
  }, [supportSelectiveDisclosure, context.attributes, schema?.fields]);

  useEffect(() => {
    if (initialOptions) {
      setSelectedAttributes(initialOptions);
    }
  }, [initialOptions]);

  const onChangeSelectedAttributes = useCallback(
    (attributes: Array<string>) => {
      setSelectedAttributes(attributes);
    },
    [setSelectedAttributes],
  );

  const onRequestPresentation = useCallback(() => {
    onNext(selectedAttributes);
  }, [onNext, selectedAttributes]);

  const onCreateTemplate = useCallback(
    async (name: string) => {
      await dispatch(
        createVerificationTemplate({
          name,
          protocolType: context.protocolType!,
          credentialType: context.credentialType!,
          network: context.network!,
          did: context.did!,
          schema: context.schema!,
          attributes: selectedAttributes,
        }),
      );
      navigate(ROUTES.VERIFY_CREDENTIAL_TEMPLATES);
    },
    [navigate, selectedAttributes, dispatch, context],
  );

  const onUpdateTemplate = useCallback(async () => {
    if (!context.templateId) return;

    await dispatch(
      updateVerificationTemplate({
        templateId: context.templateId,
        params: {
          protocolType: context.protocolType,
          credentialType: context.credentialType,
          network: context.network,
          did: context.did,
          schema: context.schema,
          attributes: selectedAttributes,
        },
      }),
    );
    toast.success(
      t('Template.messages.updateSuccess', { name: context.templateName }),
    );
    navigate(ROUTES.VERIFY_CREDENTIAL_TEMPLATES);
  }, [dispatch, selectedAttributes, context, t, navigate]);

  const handleSaveTemplateModalOpen = useCallback(
    (value: boolean) => setTemplateModalOpen(value),
    [],
  );

  const getTitle = () => {
    if (context.wizardType === 'template')
      return context.templateId
        ? t('VerifyCredential.titles.editTemplate')
        : t('VerifyCredential.titles.newTemplate');
    else return title;
  };

  const getDetails = (): string[] => {
    const details = [
      t('VerifyCredential.titles.description.schemaName', {
        name: context.schema?.name,
      }),
      t('VerifyCredential.titles.description.target', {
        protocol: context.protocolType,
        credentialFormat: context.credentialType,
      }),
    ];

    if (context.templateName)
      return [
        context.templateName &&
          t('VerifyCredential.titles.description.templateName', {
            name: context.templateName,
          }),
        ...details,
      ];
    else return details;
  };

  return (
    <>
      <StepHeader
        title={getTitle()}
        details={getDetails()}
      />{' '}
      <CheckboxGroup
        options={allOptions}
        initial={initialOptions}
        setSelected={onChangeSelectedAttributes}
        disabled={!supportSelectiveDisclosure}
      />
      <Row className={cls.stepNavigation}>
        <Button
          buttonType="outlined"
          leftIcon="arrow-back"
          onPress={onPrev}
        >
          {t('Common.buttons.back')}
        </Button>

        {context.wizardType === 'template' && !context.templateId && (
          <Button
            buttonType="filled"
            onPress={() => setTemplateModalOpen(true)}
          >
            {t('Common.buttons.save')}
          </Button>
        )}

        {context.wizardType === 'template' && context.templateId && (
          <>
            <Button
              buttonType="outlined"
              onPress={() => setTemplateModalOpen(true)}
            >
              {t('Common.buttons.saveAs')}
            </Button>
            <Button
              buttonType="filled"
              onPress={onUpdateTemplate}
            >
              {t('Common.buttons.save')}
            </Button>
          </>
        )}

        {context.wizardType === 'issue' && (
          <Button
            buttonType="outlined"
            onPress={() => setTemplateModalOpen(true)}
          >
            {t('Common.buttons.saveAsTemplate')}
          </Button>
        )}

        {(context.wizardType === 'issue' || context.wizardType === 'demo') && (
          <Button
            onPress={onRequestPresentation}
            isDisabled={selectedAttributes?.length === 0}
          >
            {t('Flow.buttons.request')}
          </Button>
        )}
      </Row>
      <SaveTemplateModal
        isOpen={isTemplateModalOpen}
        isLoading={isLoading}
        onSave={onCreateTemplate}
        onOpenChange={handleSaveTemplateModalOpen}
      />
    </>
  );
};

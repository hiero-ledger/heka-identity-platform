import { joiResolver } from '@hookform/resolvers/joi';
import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import { AppDispatch } from '@/app/providers/StoreProvider';
import ROUTES from '@/app/routes/RoutePaths';
import { SaveTemplateModal } from '@/components/SaveTemplateModal';
import * as layoutCls from '@/components/Steps/PreparationStepLayout/PreparationStepLayout.module.scss';
import { StepHeader } from '@/components/StepTitle';
import { getIssuanceTemplatesIsLoading } from '@/entities/IssuanceTemplate/model/selectors/issuanceTemplatesSelector';
import { createIssuanceTemplate } from '@/entities/IssuanceTemplate/model/services/createIssuanceTemplate';
import { updateIssuanceTemplate } from '@/entities/IssuanceTemplate/model/services/updateIssuanceTemplate';
import {
  IssueCredentialContext,
  IssueCredentialSteps,
} from '@/pages/IssueCredential/IssueCredential.config';
import { Button } from '@/shared/ui/Button';
import { Row } from '@/shared/ui/Grid';
import { TextInput } from '@/shared/ui/TextInput';

import { buildFormData } from './CredentialData.form';
import * as stepCls from '../Steps.module.scss';

interface FillCredentialDataProps {
  title: string;
  context: IssueCredentialContext;
  onPrev: () => void;
  onNext: (values: Record<string, string>) => void;
}

export const FillCredentialData = ({
  title,
  context,
  onPrev,
  onNext,
}: FillCredentialDataProps) => {
  const { t } = useTranslation();
  const dispatch: AppDispatch = useDispatch();
  const navigate = useNavigate();
  const isLoading = useSelector(getIssuanceTemplatesIsLoading);
  const [isTemplateModalOpen, setTemplateModalOpen] = useState(false);
  const { schema } = context;

  const { handleSubmit, control, getValues } = useForm({
    resolver: joiResolver(buildFormData(schema?.fields)),
    defaultValues: context.credentialValues ?? {},
    mode: 'onChange',
  });

  const onIssueCredential = useCallback(
    (credentialValues: Record<string, string>) => {
      onNext(credentialValues);
    },
    [onNext],
  );

  const onCreateTemplate = useCallback(
    async (name: string) => {
      await dispatch(
        createIssuanceTemplate({
          name,
          protocolType: context.protocolType!,
          credentialType: context.credentialType!,
          network: context.network!,
          did: context.did!,
          schema: context.schema!,
          credentialValues: getValues(),
        }),
      );
      navigate(ROUTES.ISSUE_CREDENTIAL_TEMPLATES);
    },
    [navigate, dispatch, context],
  );

  const onUpdateTemplate = useCallback(async () => {
    if (!context.templateId) return;
    await dispatch(
      updateIssuanceTemplate({
        templateId: context.templateId,
        params: {
          protocolType: context.protocolType,
          credentialType: context.credentialType,
          network: context.network,
          did: context.did,
          schema: context.schema,
          credentialValues: getValues(),
        },
      }),
    );
    toast.success(
      t('Template.messages.updateSuccess', { name: context.templateName }),
    );
    navigate(ROUTES.ISSUE_CREDENTIAL_TEMPLATES);
  }, [dispatch, getValues, context, t, navigate]);

  const handleSaveTemplateModalOpen = useCallback(
    (value: boolean) => setTemplateModalOpen(value),
    [],
  );

  const getTitle = useCallback(() => {
    if (context.wizardType === 'template')
      return context.templateId
        ? t('IssueCredential.titles.editTemplate')
        : t('IssueCredential.titles.newTemplate');
    else return title;
  }, [t, context, title]);

  const getDetails = useCallback((): string[] => {
    const details = [
      t('IssueCredential.titles.description.schemaName', {
        name: context.schema?.name,
      }),
      t('IssueCredential.titles.description.target', {
        protocol: context.protocolType,
        credentialFormat: context.credentialType,
        network: context.network,
      }),
      t('IssueCredential.titles.description.did', {
        did: context.did,
      }),
    ];

    if (context.templateName)
      return [
        context.templateName &&
          t('IssueCredential.titles.description.templateName', {
            name: context.templateName,
          }),
        ...details,
      ];
    else return details;
  }, [t, context]);

  return (
    <>
      <StepHeader
        title={getTitle()}
        details={getDetails()}
      />
      <form
        id={IssueCredentialSteps.IssueNewCredential}
        className={stepCls.stepForm}
        onSubmit={handleSubmit(onIssueCredential)}
      >
        {schema?.fields &&
          schema?.fields.map((attribute) => (
            <TextInput
              key={attribute.id}
              label={attribute.name}
              name={attribute.name}
              control={control}
            />
          ))}
      </form>

      <Row className={layoutCls.stepNavigation}>
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
            type="submit"
            form={IssueCredentialSteps.IssueNewCredential}
          >
            {t('Flow.buttons.issue')}
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

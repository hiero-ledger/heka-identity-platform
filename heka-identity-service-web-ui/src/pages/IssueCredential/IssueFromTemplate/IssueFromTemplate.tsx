import { joiResolver } from '@hookform/resolvers/joi';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';

import { AppDispatch } from '@/app/providers/StoreProvider';
import { RootState } from '@/app/providers/StoreProvider/config/store';
import ROUTES from '@/app/routes/RoutePaths';
import { ColorizedPanel } from '@/components/Panel';
import { SaveIssuanceTemplateModal } from '@/components/SaveIssuanceTemplateModal';
import { buildFormData } from '@/components/Steps/FillCredentialData/CredentialData.form';
import { StepHeader } from '@/components/StepTitle';
import { defaultSchemaBackgroundColor } from '@/const/color';
import { defaultLogoImagePath } from '@/const/image';
import { useCredentialActions } from '@/entities/Credential/model/slices/credentialSlice';
import { getIssuanceTemplate } from '@/entities/IssuanceTemplate/model/services/getIssuanceTemplate';
import { updateIssuanceTemplate } from '@/entities/IssuanceTemplate/model/services/updateIssuanceTemplate';
import { useIssuanceTemplatesActions } from '@/entities/IssuanceTemplate/model/slices/issuanceTemplatesSlice';
import { IssueCredentialSteps } from '@/pages/IssueCredential/IssueCredential.config';
import { Button } from '@/shared/ui/Button';
import { Column, Row } from '@/shared/ui/Grid';
import { LoaderView } from '@/shared/ui/Loader';
import { TextInput } from '@/shared/ui/TextInput';

import * as stpCls from '../../../components/Steps/Steps.module.scss';

import * as cls from './IssueFromTemplate.module.scss';

export const IssueFromTemplate = () => {
  const { t } = useTranslation();
  const dispatch: AppDispatch = useDispatch();
  const navigate = useNavigate();
  const { state } = useLocation();
  const { reset: resetIssuanceTemplates } = useIssuanceTemplatesActions();
  const { reset: resetCredential } = useCredentialActions();
  const { issuanceTemplate } = useSelector(
    (state: RootState) => state.issuanceTemplates,
  );
  const [isTemplateModalOpen, setTemplateModalOpen] = useState(false);

  useEffect(() => {
    resetIssuanceTemplates();
    resetCredential();
  }, [resetIssuanceTemplates, resetCredential]);

  useEffect(() => {
    if (!state?.context?.templateId) return;
    dispatch(
      getIssuanceTemplate({
        id: state?.context.templateId,
      }),
    );
  }, [dispatch, state?.context?.templateId]);

  const defaultFormValues = useMemo(
    () =>
      issuanceTemplate?.fields.reduce(
        (prev, field) => ({
          ...prev,
          [field.schemaFieldName]: field.value,
        }),
        {},
      ),
    [issuanceTemplate?.fields],
  );

  const { handleSubmit, control, getValues } = useForm({
    resolver: joiResolver(
      buildFormData(issuanceTemplate?.schema?.fields ?? []),
    ),
    values: defaultFormValues,
  });

  const onIssueCredential = useCallback(
    (credentialValues: Record<string, string>) => {
      if (!issuanceTemplate) return;

      navigate(ROUTES.CREDENTIAL_OFFER, {
        state: {
          context: {
            templateId: issuanceTemplate.id,
            protocolType: issuanceTemplate.protocol,
            credentialType: issuanceTemplate.credentialFormat,
            network: issuanceTemplate.network,
            did: issuanceTemplate.did,
            schema: issuanceTemplate.schema,
            credentialValues,
          },
        },
      });
    },
    [issuanceTemplate, navigate],
  );

  const onSaveTemplate = useCallback(async () => {
    if (!issuanceTemplate) return;

    await dispatch(
      updateIssuanceTemplate({
        templateId: issuanceTemplate.id,
        params: {
          schema: issuanceTemplate.schema,
          credentialValues: getValues(),
        },
      }),
    );

    toast.success(t('IssueFromTemplate.messages.success'));
  }, [dispatch, getValues, issuanceTemplate, t]);

  const onSaveTemplateAs = useCallback(() => setTemplateModalOpen(true), []);

  if (!issuanceTemplate) {
    return <LoaderView />;
  }

  const panelBackgroundColor =
    issuanceTemplate.schema.bgColor || defaultSchemaBackgroundColor;
  const panelLogo = issuanceTemplate.schema.logo || defaultLogoImagePath;

  return (
    <Row className={cls.IssueFromTemplate}>
      <ColorizedPanel
        title={issuanceTemplate.schema.name}
        backgroundColor={panelBackgroundColor}
        logo={panelLogo}
      />

      <Column
        className={stpCls.stepContent}
        alignItems="center"
      >
        <StepHeader
          title={t('Flow.titles.fillCredential')}
          details={[
            t('IssueFromTemplate.titles.description.templateName', {
              name: issuanceTemplate.name,
            }),
            t('IssueFromTemplate.titles.description.target', {
              ...issuanceTemplate,
            }),
            t('IssueFromTemplate.titles.description.did', {
              ...issuanceTemplate,
            }),
          ]}
        />

        <form
          id={IssueCredentialSteps.IssueNewCredential}
          className={stpCls.stepForm}
          onSubmit={handleSubmit(onIssueCredential)}
        >
          {issuanceTemplate.schema.fields.map((attribute) => (
            <TextInput
              key={attribute.id}
              label={attribute.name}
              // @ts-ignore
              name={attribute.name}
              control={control}
            />
          ))}
        </form>

        <Row
          className={stpCls.stepNavigation}
          alignItems={'flex-end'}
        >
          <Button
            buttonType="outlined"
            onPress={onSaveTemplate}
          >
            {t('Common.buttons.save')}
          </Button>
          <Button
            buttonType="outlined"
            onPress={onSaveTemplateAs}
          >
            {t('Common.buttons.saveAs')}
          </Button>
          <Button
            type="submit"
            form={IssueCredentialSteps.IssueNewCredential}
          >
            {t('Flow.buttons.issue')}
          </Button>
        </Row>
      </Column>
      <SaveIssuanceTemplateModal
        context={{
          protocolType: issuanceTemplate.protocol,
          credentialType: issuanceTemplate.credentialFormat,
          network: issuanceTemplate.network,
          did: issuanceTemplate.did,
          schema: issuanceTemplate.schema,
          credentialValues: getValues(),
        }}
        isOpen={isTemplateModalOpen}
        onOpenChange={setTemplateModalOpen}
      />
    </Row>
  );
};

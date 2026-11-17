import { joiResolver } from '@hookform/resolvers/joi';
import { skipToken } from '@reduxjs/toolkit/query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { AppDispatch } from '@/app/providers/StoreProvider';
import ROUTES from '@/app/routes/RoutePaths';
import { ColorizedPanel } from '@/components/Panel';
import { SaveIssuanceTemplateModal } from '@/components/SaveIssuanceTemplateModal';
import { buildFormData } from '@/components/Steps/FillCredentialData/CredentialData.form';
import { StepHeader } from '@/components/StepTitle';
import { defaultSchemaBackgroundColor } from '@/const/color';
import { defaultLogoImagePath } from '@/const/image';
import { useCredentialActions } from '@/entities/Credential/model/slices/credentialSlice';
import { useGetIssuanceTemplateQuery } from '@/entities/IssuanceTemplate/api/issuanceTemplateApi';
import { updateIssuanceTemplate } from '@/entities/IssuanceTemplate/model/services/updateIssuanceTemplate';
import { IssueCredentialSteps } from '@/pages/IssueCredential/IssueCredential.config';
import { isNotFoundError } from '@/shared/api/rtk/isNotFound';
import { useErrorSinceMount } from '@/shared/api/rtk/useErrorSinceMount';
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
  const { reset: resetCredential } = useCredentialActions();
  const [isTemplateModalOpen, setTemplateModalOpen] = useState(false);

  useEffect(() => {
    resetCredential();
  }, [resetCredential]);

  const templateId: string | undefined = state?.context?.templateId;
  // Cached; "Save template" invalidates it, so it refetches once. A 404 (deleted elsewhere)
  // also invalidates the cached list. The base query has already shown the error.
  const templateQuery = useGetIssuanceTemplateQuery(templateId ?? skipToken);
  const issuanceTemplate = templateQuery.currentData;
  const error = useErrorSinceMount(templateQuery);
  // Back to the list only when there is no template to show or it was deleted. A failed
  // background refetch (after "Save template", on reconnect) keeps the page and the typed values.
  const loadFailed = !!error && (!issuanceTemplate || isNotFoundError(error));

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

    try {
      await dispatch(
        updateIssuanceTemplate({
          templateId: issuanceTemplate.id,
          params: {
            schema: issuanceTemplate.schema,
            credentialValues: getValues(),
          },
        }),
      ).unwrap();
    } catch {
      // The thunk has already shown the error
      return;
    }

    toast.success(t('IssueFromTemplate.messages.success'));
  }, [dispatch, getValues, issuanceTemplate, t]);

  const onSaveTemplateAs = useCallback(() => setTemplateModalOpen(true), []);

  // Opened without a template (new tab, typed URL) or it could not be loaded: back to the list
  if (!templateId || loadFailed) {
    return (
      <Navigate
        to={ROUTES.ISSUE_CREDENTIAL_TEMPLATES}
        replace
      />
    );
  }

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

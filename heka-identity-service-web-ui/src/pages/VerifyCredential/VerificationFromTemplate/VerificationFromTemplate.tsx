import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';

import { AppDispatch } from '@/app/providers/StoreProvider';
import { RootState } from '@/app/providers/StoreProvider/config/store';
import ROUTES from '@/app/routes/RoutePaths';
import { ColorizedPanel } from '@/components/Panel';
import { SaveVerificationTemplateModal } from '@/components/SaveVerificationTemplateModal';
import { StepHeader } from '@/components/StepTitle';
import { defaultSchemaBackgroundColor } from '@/const/color';
import { defaultLogoImagePath } from '@/const/image';
import { usePresentationActions } from '@/entities/Presentation/model/slices/presentationSlice';
import { ProtocolType } from '@/entities/Schema';
import { Openid4CredentialFormat } from '@/entities/Schema/model/types/schema';
import { getVerificationTemplate } from '@/entities/VerificationTemplate/model/services/getVerificationTemplate';
import { updateVerificationTemplate } from '@/entities/VerificationTemplate/model/services/updateVerificationTemplate';
import { useVerificationTemplatesActions } from '@/entities/VerificationTemplate/model/slices/verificationTemplatesSlice';
import { Button } from '@/shared/ui/Button';
import { CheckboxGroup } from '@/shared/ui/CheckboxGroup';
import { Column, Row } from '@/shared/ui/Grid';
import { LoaderView } from '@/shared/ui/Loader';

import * as stpCls from '../../../components/Steps/Steps.module.scss';

import * as cls from './VerificationFromTemplate.module.scss';

export const VerificationFromTemplate = () => {
  const { t } = useTranslation();
  const dispatch: AppDispatch = useDispatch();
  const navigate = useNavigate();
  const { state } = useLocation();
  const { verificationTemplate } = useSelector(
    (state: RootState) => state.verificationTemplates,
  );
  const { reset: resetVerificationTemplates } =
    useVerificationTemplatesActions();
  const { reset: resetPresentation } = usePresentationActions();

  const [isTemplateModalOpen, setTemplateModalOpen] = useState(false);
  const [selectedAttributes, setSelectedAttributes] = useState<Array<string>>(
    [],
  );

  useEffect(() => {
    resetVerificationTemplates();
    resetPresentation();
  }, [resetVerificationTemplates, resetPresentation]);

  useEffect(() => {
    if (!state?.context?.templateId) return;
    dispatch(
      getVerificationTemplate({
        id: state?.context.templateId,
      }),
    );
  }, [dispatch, state?.context?.templateId]);

  const onChangeSelectedAttributes = useCallback(
    (attributes: Array<string>) => {
      setSelectedAttributes(attributes);
    },
    [setSelectedAttributes],
  );

  const initiallySelectedAttributes = useMemo(() => {
    return (
      verificationTemplate?.fields?.map((field) => field.schemaFieldName) ??
      undefined
    );
  }, [verificationTemplate?.fields]);

  useEffect(() => {
    if (initiallySelectedAttributes) {
      setSelectedAttributes(initiallySelectedAttributes);
    }
  }, [initiallySelectedAttributes]);

  const onRequestPresentation = useCallback(() => {
    if (!verificationTemplate) return;

    navigate(ROUTES.VERIFICATION_REQUEST, {
      state: {
        context: {
          templateId: verificationTemplate.id,
          protocolType: verificationTemplate.protocol,
          credentialType: verificationTemplate.credentialFormat,
          network: verificationTemplate.network,
          did: verificationTemplate.did,
          schema: verificationTemplate.schema,
          attributes: selectedAttributes,
        },
      },
    });
  }, [verificationTemplate, navigate, selectedAttributes]);

  const onSaveTemplate = useCallback(async () => {
    if (!verificationTemplate) return;

    await dispatch(
      updateVerificationTemplate({
        templateId: verificationTemplate.id,
        params: {
          schema: verificationTemplate.schema,
          attributes: selectedAttributes,
        },
      }),
    );

    toast.success(t('VerificationFromTemplate.messages.success'));
  }, [verificationTemplate, dispatch, selectedAttributes, t]);

  const options = useMemo(
    () => verificationTemplate?.schema.fields.map((field) => field.name) ?? [],
    [verificationTemplate?.schema.fields],
  );

  const supportSelectiveDisclosure = useMemo(
    () =>
      verificationTemplate?.protocol === ProtocolType.Aries ||
      verificationTemplate?.credentialFormat === Openid4CredentialFormat.SdJwt,
    [verificationTemplate],
  );

  if (!verificationTemplate) {
    return <LoaderView />;
  }

  const panelBackgroundColor =
    verificationTemplate.schema.bgColor || defaultSchemaBackgroundColor;
  const panelLogo = verificationTemplate.schema.logo || defaultLogoImagePath;

  return (
    <Row className={cls.VerificationFromTemplate}>
      <ColorizedPanel
        title={verificationTemplate.schema.name}
        backgroundColor={panelBackgroundColor}
        logo={panelLogo}
      />

      <Column
        className={stpCls.stepContent}
        alignItems="center"
      >
        <StepHeader
          title={t('Flow.titles.requestFieldsVerification')}
          details={[
            t('VerificationFromTemplate.titles.description.templateName', {
              name: verificationTemplate.name,
            }),
            t('VerificationFromTemplate.titles.description.target', {
              ...verificationTemplate,
            }),
          ]}
        />

        <CheckboxGroup
          options={options}
          initial={initiallySelectedAttributes}
          setSelected={onChangeSelectedAttributes}
          disabled={!supportSelectiveDisclosure}
        />

        <Row className={stpCls.stepNavigation}>
          <Button
            buttonType="outlined"
            onPress={onSaveTemplate}
          >
            {t('Common.buttons.save')}
          </Button>
          <Button
            buttonType="outlined"
            onPress={() => setTemplateModalOpen(true)}
          >
            {t('Common.buttons.saveAs')}
          </Button>
          <Button
            onPress={onRequestPresentation}
            isDisabled={selectedAttributes.length === 0}
          >
            {t('Flow.buttons.request')}
          </Button>
        </Row>
      </Column>
      <SaveVerificationTemplateModal
        context={{
          protocolType: verificationTemplate.protocol,
          credentialType: verificationTemplate.credentialFormat,
          network: verificationTemplate.network,
          did: verificationTemplate.did,
          schema: verificationTemplate.schema,
          attributes: selectedAttributes,
        }}
        isOpen={isTemplateModalOpen}
        onOpenChange={setTemplateModalOpen}
      />
    </Row>
  );
};

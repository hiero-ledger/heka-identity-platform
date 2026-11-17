import { skipToken } from '@reduxjs/toolkit/query';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';

import ROUTES from '@/app/routes/RoutePaths';
import { WizardType } from '@/app/types/WizardContext';
import {
  PreparationStepLayout,
  SelectNetwork,
  SelectProtocolType,
  SelectSchema,
} from '@/components/Steps';
import { RequestFieldsVerification } from '@/components/Steps/RequestFieldsVerification/RequestFieldsVerification';
import { ProtocolType, Schema } from '@/entities/Schema';
import { getSchema } from '@/entities/Schema/model/selectors/schemasSelector';
import { AriesCredentialFormat } from '@/entities/Schema/model/types/schema';
import { getUserDid } from '@/entities/User/model/selectors/userSelector';
import { useGetVerificationTemplateQuery } from '@/entities/VerificationTemplate/api/verificationTemplateApi';
import {
  steps,
  totalPreparationSteps,
  VerifyCredentialContext,
  VerifyCredentialSteps,
} from '@/pages/VerifyCredential/VerifyCredential.config';
import { useFlow } from '@/shared/hooks/flow';

export interface AdvancedVerificationProps {
  type?: WizardType;
}

const AdvancedVerification = ({
  type = 'issue',
}: AdvancedVerificationProps) => {
  const navigate = useNavigate();
  const { state } = useLocation();
  const did = useSelector(getUserDid);

  const singleSchema = useSelector(getSchema);

  const {
    flowContext,
    onChangeContextProperty,
    step,
    stepNumber,
    onChangeStep,
    resetFlowState,
  } = useFlow<VerifyCredentialContext>({
    steps,
    initialContext: {
      wizardType: type,
      protocolType: ProtocolType.Aries,
      credentialType: AriesCredentialFormat.AnoncredsIndy,
      did: did || undefined,
    },
  });

  const editedTemplateId: string | undefined = state?.context?.templateId;

  // Reset on mount and whenever the wizard switches between creating and editing a template
  // (the create and edit flows share this route), so nothing from a previous flow leaks in.
  useEffect(() => {
    // Also resets the template slices, so the templates need no reset of their own
    resetFlowState();
  }, [resetFlowState]);

  // Cached: the template being edited, if any
  const { currentData: verificationTemplate } = useGetVerificationTemplateQuery(
    editedTemplateId ?? skipToken,
  );

  const onChangeNetwork = useMemo(
    () => onChangeContextProperty('network'),
    [onChangeContextProperty],
  );

  const onSelectProtocol = useCallback(() => {
    if (flowContext?.protocolType === ProtocolType.Oid4vc) {
      onChangeContextProperty('network')(undefined);
    }
    onChangeContextProperty('did')(undefined);

    const nextStep =
      flowContext?.protocolType === ProtocolType.Oid4vc
        ? VerifyCredentialSteps.SelectSchema
        : VerifyCredentialSteps.SelectNetwork;

    onChangeStep(nextStep);
  }, [flowContext?.protocolType, onChangeStep, onChangeContextProperty]);

  const onRequest = useCallback(
    (attributes: Array<string>) => {
      navigate(ROUTES.VERIFICATION_REQUEST, {
        state: {
          context: {
            ...flowContext,
            attributes,
          },
        },
      });
    },
    [flowContext, navigate],
  );

  useEffect(() => {
    onChangeContextProperty('schema')(singleSchema);
  }, [singleSchema, onChangeContextProperty]);

  // A new template to edit (or none) is seeded again
  const seededTemplateId = useRef<string | undefined>(undefined);
  useEffect(() => {
    seededTemplateId.current = undefined;
  }, [editedTemplateId]);

  // After the effect above: a cached template is there on mount, and the selected schema
  // (none yet) must not overwrite the template's schema
  useEffect(() => {
    // Only the template being edited may seed the context: applying any other would turn a
    // new template into an update of that one.
    if (
      !editedTemplateId ||
      !verificationTemplate ||
      verificationTemplate.id !== editedTemplateId
    )
      return;
    // Once per edited template: a refetch (e.g. a schema registration during the edit
    // invalidates the templates) must not overwrite the choices made in the wizard since
    if (seededTemplateId.current === editedTemplateId) return;
    seededTemplateId.current = editedTemplateId;

    onChangeContextProperty('templateId')(verificationTemplate.id);
    onChangeContextProperty('templateName')(verificationTemplate.name);
    onChangeContextProperty('protocolType')(verificationTemplate.protocol);
    onChangeContextProperty('credentialType')(
      verificationTemplate.credentialFormat,
    );
    onChangeContextProperty('network')(verificationTemplate.network);
    onChangeContextProperty('did')(verificationTemplate.did);
    onChangeContextProperty('schema')(verificationTemplate.schema);
    if (verificationTemplate?.fields) {
      const attributes = verificationTemplate.fields.map(
        (field) => field.schemaFieldName,
      );
      onChangeContextProperty('attributes')(attributes);
    }
  }, [verificationTemplate, onChangeContextProperty, editedTemplateId]);

  return (
    <PreparationStepLayout
      totalPreparationSteps={totalPreparationSteps}
      stepNumber={stepNumber}
      onChangeStep={onChangeStep}
      context={flowContext}
    >
      {step.name === VerifyCredentialSteps.SelectProtocolType && (
        <SelectProtocolType
          title={step.title}
          credentialType={flowContext.credentialType}
          protocolType={flowContext.protocolType}
          onChangeCredentialType={onChangeContextProperty('credentialType')}
          onChangeProtocolType={onChangeContextProperty('protocolType')}
          onNext={onSelectProtocol}
        />
      )}
      {step.name === VerifyCredentialSteps.SelectNetwork && (
        <SelectNetwork
          title={step.title}
          protocolType={flowContext.protocolType}
          did={flowContext.did}
          network={flowContext.network}
          onChangeNetwork={onChangeNetwork}
          onPrev={() => onChangeStep(VerifyCredentialSteps.SelectProtocolType)}
          onNext={() => onChangeStep(VerifyCredentialSteps.SelectSchema)}
          didOptional={flowContext.protocolType === ProtocolType.Aries}
        />
      )}
      {step.name === VerifyCredentialSteps.SelectSchema && (
        <SelectSchema
          useDemo={false}
          useForTemplate={flowContext.wizardType === 'template'}
          useForVerification={true}
          title={step.title}
          protocol={flowContext.protocolType}
          credentialType={flowContext.credentialType}
          network={
            flowContext?.protocolType === ProtocolType.Oid4vc
              ? undefined
              : flowContext?.network
          }
          schema={flowContext.schema}
          hasSchemaCreation={false}
          setSchema={(value: Schema) => {
            onChangeContextProperty('schema')(value);
            onChangeContextProperty('attributes')(undefined);
          }}
          onPrev={() => {
            onChangeStep(
              flowContext?.protocolType === ProtocolType.Oid4vc
                ? VerifyCredentialSteps.SelectProtocolType
                : VerifyCredentialSteps.SelectNetwork,
            );
          }}
          onNext={() => {
            onChangeStep(VerifyCredentialSteps.RequestFieldsVerification);
          }}
        />
      )}
      {step.name === VerifyCredentialSteps.RequestFieldsVerification && (
        <RequestFieldsVerification
          title={step.title}
          context={flowContext}
          onPrev={() => onChangeStep(VerifyCredentialSteps.SelectSchema)}
          onNext={onRequest}
        />
      )}
    </PreparationStepLayout>
  );
};

export default AdvancedVerification;

import { useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';

import { AppDispatch } from '@/app/providers/StoreProvider';
import { RootState } from '@/app/providers/StoreProvider/config/store';
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
import { getVerificationTemplate } from '@/entities/VerificationTemplate/model/services/getVerificationTemplate';
import { useVerificationTemplatesActions } from '@/entities/VerificationTemplate/model/slices/verificationTemplatesSlice';
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
  const dispatch: AppDispatch = useDispatch();
  const navigate = useNavigate();
  const { state } = useLocation();
  const did = useSelector(getUserDid);

  const { verificationTemplate } = useSelector(
    (state: RootState) => state.verificationTemplates,
  );
  const { reset: resetTemplates } = useVerificationTemplatesActions();
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

  useEffect(() => {
    dispatch(resetTemplates());
    resetFlowState();
  }, [dispatch, resetTemplates, resetFlowState]);

  useEffect(() => {
    if (!state?.context?.templateId) return;
    dispatch(
      getVerificationTemplate({
        id: state.context.templateId,
      }),
    );
  }, [dispatch, state?.context?.templateId]);

  useEffect(() => {
    if (!verificationTemplate) return;

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
  }, [verificationTemplate, onChangeContextProperty]);

  const onSelectProtocol = useCallback(() => {
    if (flowContext?.protocolType === ProtocolType.Oid4vc) {
      flowContext.network = undefined;
    }
    flowContext.did = undefined;

    const nextStep =
      flowContext?.protocolType === ProtocolType.Oid4vc
        ? VerifyCredentialSteps.SelectSchema
        : VerifyCredentialSteps.SelectNetwork;

    onChangeStep(nextStep);
  }, [flowContext?.protocolType, onChangeStep]);

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
  }, [singleSchema]);

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
          onChangeNetwork={onChangeContextProperty('network')}
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

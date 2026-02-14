import { useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';

import { AppDispatch } from '@/app/providers/StoreProvider';
import { RootState } from '@/app/providers/StoreProvider/config/store';
import ROUTES from '@/app/routes/RoutePaths';
import { WizardType } from '@/app/types/WizardContext';
import {
  FillCredentialData,
  PreparationStepLayout,
  SelectNetwork,
  SelectProtocolType,
  SelectSchema,
  SchemaRegistration,
} from '@/components/Steps';
import { getIssuanceTemplate } from '@/entities/IssuanceTemplate/model/services/getIssuanceTemplate';
import { useIssuanceTemplatesActions } from '@/entities/IssuanceTemplate/model/slices/issuanceTemplatesSlice';
import { ProtocolType, Schema } from '@/entities/Schema';
import { getSchema } from '@/entities/Schema/model/selectors/schemasSelector';
import {
  AriesCredentialFormat,
  credentialFormatToCredentialRegistrationFormat,
} from '@/entities/Schema/model/types/schema';
import { getRegistration } from '@/entities/Schema/model/utils/schema';
import {
  IssueCredentialContext,
  IssueCredentialSteps,
  steps,
  totalPreparationSteps,
} from '@/pages/IssueCredential/IssueCredential.config';
import { useFlow } from '@/shared/hooks/flow';

export interface AdvancedIssueProps {
  type?: WizardType;
}

export const AdvancedIssue = ({ type = 'issue' }: AdvancedIssueProps) => {
  const dispatch: AppDispatch = useDispatch();
  const navigate = useNavigate();
  const { state } = useLocation();

  const { issuanceTemplate } = useSelector(
    (state: RootState) => state.issuanceTemplates,
  );
  const { reset: resetTemplates } = useIssuanceTemplatesActions();
  const singleSchema = useSelector(getSchema);

  const {
    flowContext,
    step,
    stepNumber,
    onChangeStep,
    onChangeContextProperty,
    resetFlowState,
  } = useFlow<IssueCredentialContext>({
    initialContext: {
      wizardType: type,
      protocolType: ProtocolType.Aries,
      credentialType: AriesCredentialFormat.AnoncredsIndy,
    },
    steps,
  });

  useEffect(() => {
    dispatch(resetTemplates());
    resetFlowState();
  }, [dispatch, resetFlowState, resetTemplates]);

  useEffect(() => {
    if (!state?.context?.templateId) return;
    dispatch(
      getIssuanceTemplate({
        id: state.context.templateId,
      }),
    );
  }, [dispatch, state?.context?.templateId]);

  useEffect(() => {
    if (!issuanceTemplate) return;

    onChangeContextProperty('templateId')(issuanceTemplate.id);
    onChangeContextProperty('templateName')(issuanceTemplate.name);
    onChangeContextProperty('protocolType')(issuanceTemplate.protocol);
    onChangeContextProperty('credentialType')(
      issuanceTemplate.credentialFormat,
    );
    onChangeContextProperty('network')(issuanceTemplate.network);
    onChangeContextProperty('did')(issuanceTemplate.did);
    onChangeContextProperty('schema')(issuanceTemplate.schema);
    if (issuanceTemplate?.fields) {
      const fields: Record<string, string> = issuanceTemplate?.fields.reduce(
        (obj, field) => {
          obj[field.schemaFieldName] = field.value;
          return obj;
        },
        {} as Record<string, string>,
      );
      onChangeContextProperty('credentialValues')(fields);
    }
  }, [issuanceTemplate, onChangeContextProperty]);

  const onSelectSchema = useCallback(() => {
    const nextStep = getRegistration(flowContext.schema!, {
      ...flowContext!,
      credentialFormat: credentialFormatToCredentialRegistrationFormat(
        flowContext!.credentialType!,
      ),
    })
      ? IssueCredentialSteps.IssueNewCredential
      : IssueCredentialSteps.SchemaRegistration;
    onChangeStep(nextStep);
  }, [flowContext, onChangeStep]);

  const onIssue = useCallback(
    (credentialValues: Record<string, unknown>) => {
      navigate(ROUTES.CREDENTIAL_OFFER, {
        state: {
          context: {
            ...flowContext,
            credentialValues,
            templateId: state?.context?.templateId,
          },
        },
      });
    },
    [flowContext, navigate, state?.context?.templateId],
  );

  useEffect(() => {
    onChangeContextProperty('schema')(singleSchema);
  }, [singleSchema]);

  return (
    <PreparationStepLayout
      totalPreparationSteps={totalPreparationSteps}
      context={flowContext}
      stepNumber={stepNumber}
      onChangeStep={onChangeStep}
    >
      {step.name === IssueCredentialSteps.SelectProtocolType && (
        <SelectProtocolType
          title={step.title}
          protocolType={flowContext.protocolType}
          credentialType={flowContext.credentialType}
          onChangeCredentialType={onChangeContextProperty('credentialType')}
          onChangeProtocolType={onChangeContextProperty('protocolType')}
          onNext={() => onChangeStep(IssueCredentialSteps.SelectNetwork)}
        />
      )}
      {step.name === IssueCredentialSteps.SelectNetwork && (
        <SelectNetwork
          title={step.title}
          protocolType={flowContext.protocolType}
          did={flowContext.did}
          network={flowContext.network}
          onChangeDid={onChangeContextProperty('did')}
          onChangeNetwork={onChangeContextProperty('network')}
          onPrev={() => onChangeStep(IssueCredentialSteps.SelectProtocolType)}
          onNext={() => onChangeStep(IssueCredentialSteps.SelectSchema)}
        />
      )}
      {step.name === IssueCredentialSteps.SelectSchema && (
        <SelectSchema
          useDemo={false}
          useForTemplate={flowContext.wizardType === 'template'}
          useForVerification={false}
          title={step.title}
          schema={flowContext.schema}
          hasSchemaCreation
          setSchema={(value: Schema) => {
            onChangeContextProperty('schema')(value);
            onChangeContextProperty('credentialValues')(undefined);
          }}
          onPrev={() => onChangeStep(IssueCredentialSteps.SelectNetwork)}
          onNext={onSelectSchema}
        />
      )}
      {step.name === IssueCredentialSteps.SchemaRegistration && (
        <SchemaRegistration
          title={step.title}
          protocolType={flowContext.protocolType}
          credentialType={flowContext.credentialType}
          network={flowContext.network}
          did={flowContext.did}
          schema={flowContext.schema}
          schemaName={flowContext.schema?.name}
          onPrev={() => onChangeStep(IssueCredentialSteps.SelectSchema)}
          onNext={() => onChangeStep(IssueCredentialSteps.IssueNewCredential)}
        />
      )}
      {step.name === IssueCredentialSteps.IssueNewCredential && (
        <FillCredentialData
          title={step.title}
          context={flowContext}
          onPrev={() => onChangeStep(IssueCredentialSteps.SelectSchema)}
          onNext={onIssue}
        />
      )}
    </PreparationStepLayout>
  );
};

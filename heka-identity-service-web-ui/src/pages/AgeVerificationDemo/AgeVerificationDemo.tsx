import { useEffect } from 'react';
import { useSelector } from 'react-redux';

import { BasicPanel } from '@/components/Panel';
import { FillCredentialData, PreparationStepLayout } from '@/components/Steps';
import { CredentialOffer } from '@/components/Steps/CredentialOffer/CredentialOffer';
import { RequestFieldsVerification } from '@/components/Steps/RequestFieldsVerification/RequestFieldsVerification';
import { VerificationRequest } from '@/components/Steps/VerificationRequest/VerificationRequest';
import { demoUser, mainDidMethod } from '@/const/user';
import { getSchemas } from '@/entities/Schema/model/selectors/schemasSelector';
import { getDemoSchemaList } from '@/entities/Schema/model/services/getDemoSchemaList';
import {
  Openid4CredentialFormat,
  ProtocolType,
} from '@/entities/Schema/model/types/schema';
import { VerifyCredentialContext } from '@/pages/VerifyCredential/VerifyCredential.config';
import {
  DemoContext,
  DemoSteps,
  steps,
  totalPreparationSteps,
} from '@/pages/AgeVerificationDemo/AgeVerificationDemo.config';
import { useFlow } from '@/shared/hooks/flow';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';
import { Row } from '@/shared/ui/Grid';
import { Loader } from '@/shared/ui/Loader/Loader';

import * as cls from './AgeVerificationDemo.module.scss';

const MDL_SCHEMA_NAME = 'mDL';

const AgeVerificationDemo = () => {
  const dispatch = useAppDispatch();
  const schemas = useSelector(getSchemas);

  const initialContext = {
    wizardType: 'demo',
    network: mainDidMethod,
    did: demoUser.did,
    protocolType: ProtocolType.Oid4vc,
    credentialType: Openid4CredentialFormat.MsoMdoc,
  } as DemoContext;

  const {
    flowContext,
    onChangeContextProperty,
    step,
    stepNumber,
    onChangeStep,
    setFlowContext,
    resetFlowState,
  } = useFlow<DemoContext>({ steps, initialContext });

  useEffect(() => {
    resetFlowState();
    dispatch(getDemoSchemaList());
  }, [resetFlowState, dispatch]);

  useEffect(() => {
    if (!schemas) return;
    const mdlSchema = schemas.find((s) => s.name === MDL_SCHEMA_NAME);
    if (mdlSchema) {
      onChangeContextProperty('schema')(mdlSchema);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemas]);

  if (step.name === DemoSteps.CredentialOffer) {
    return (
      <CredentialOffer
        context={{ ...flowContext, useDemo: true }}
        stepDetails={step}
        onChangeStep={onChangeStep}
      />
    );
  }

  if (step.name === DemoSteps.RequestFieldsVerification) {
    return (
      <Row className={cls.AgeDemo}>
        <BasicPanel
          title="Age Verification Demo"
          icon="car"
        />
        <RequestFieldsVerification
          title={step.title}
          context={flowContext as unknown as VerifyCredentialContext}
          onPrev={() => onChangeStep(DemoSteps.CredentialOffer)}
          onNext={(attributes) => {
            onChangeContextProperty('attributes')(attributes);
            onChangeStep(DemoSteps.PresentationRequest);
          }}
        />
      </Row>
    );
  }

  if (step.name === DemoSteps.PresentationRequest) {
    return (
      <VerificationRequest
        context={{ ...flowContext, useDemo: true }}
        stepDetails={step}
        onChangeStep={() => {
          resetFlowState();
          setFlowContext({ ...initialContext, schema: flowContext.schema });
          onChangeStep(DemoSteps.IssueNewCredential);
        }}
      />
    );
  }

  return (
    <Row className={cls.AgeDemo}>
      <BasicPanel
        title="Age Verification Demo"
        icon="car"
      />
      {!flowContext.schema ? (
        <Loader />
      ) : (
        <PreparationStepLayout
          totalPreparationSteps={totalPreparationSteps}
          context={flowContext}
          stepNumber={stepNumber}
          onChangeStep={onChangeStep}
        >
          {step.name === DemoSteps.IssueNewCredential && (
            <FillCredentialData
              title={step.title}
              context={flowContext}
              onPrev={() => {}}
              onNext={(credentialValues) => {
                onChangeContextProperty('credentialValues')(credentialValues);
                onChangeStep(DemoSteps.CredentialOffer);
              }}
            />
          )}
        </PreparationStepLayout>
      )}
    </Row>
  );
};

export default AgeVerificationDemo;

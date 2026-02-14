import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { BasicPanel } from '@/components/Panel';
import {
  FillCredentialData,
  PreparationStepLayout,
  SelectSchema,
} from '@/components/Steps';
import { CredentialOffer } from '@/components/Steps/CredentialOffer/CredentialOffer';
import { VerificationRequest } from '@/components/Steps/VerificationRequest/VerificationRequest';
import { demoUser, mainDidMethod } from '@/const/user';
import {
  Openid4CredentialFormat,
  ProtocolType,
} from '@/entities/Schema/model/types/schema';
import {
  DemoContext,
  DemoSteps,
  steps,
  totalPreparationSteps,
} from '@/pages/Demo/Demo.config';
import { useFlow } from '@/shared/hooks/flow';
import { Row } from '@/shared/ui/Grid';

import * as cls from './Demo.module.scss';

const Demo = () => {
  const { t } = useTranslation();

  const initialContext = {
    wizardType: 'demo',
    network: mainDidMethod,
    did: demoUser.did,
    protocolType: ProtocolType.Oid4vc,
    credentialType: Openid4CredentialFormat.SdJwt,
  } as DemoContext;

  const {
    flowContext,
    onChangeContextProperty,
    step,
    stepNumber,
    onChangeStep,
    setFlowContext,
    resetFlowState,
  } = useFlow<DemoContext>({
    steps,
    initialContext,
  });

  useEffect(() => {
    resetFlowState();
  }, [resetFlowState]);

  if (step.name === DemoSteps.CredentialOffer) {
    return (
      <CredentialOffer
        context={{ ...flowContext, useDemo: true }}
        stepDetails={step}
        onChangeStep={onChangeStep}
      />
    );
  }

  if (step.name === DemoSteps.PresentationRequest) {
    return (
      <VerificationRequest
        context={{ ...flowContext, useDemo: true }}
        stepDetails={step}
        onChangeStep={() => {
          resetFlowState();
          setFlowContext(initialContext);
          onChangeStep(DemoSteps.SelectSchema);
        }}
      />
    );
  }

  return (
    <Row className={cls.DemoWrapper}>
      <BasicPanel
        title={t('Demo.titles.main')}
        icon={'wallet'}
      />
      <PreparationStepLayout
        totalPreparationSteps={totalPreparationSteps}
        context={flowContext}
        stepNumber={stepNumber}
        onChangeStep={onChangeStep}
      >
        {step.name === DemoSteps.SelectSchema && (
          <SelectSchema
            useDemo={true}
            useForTemplate={false}
            useForVerification={false}
            title={step.title}
            schema={flowContext.schema}
            hasSchemaCreation={false}
            setSchema={onChangeContextProperty('schema')}
            onNext={() => onChangeStep(DemoSteps.IssueNewCredential)}
          />
        )}
        {step.name === DemoSteps.IssueNewCredential && (
          <FillCredentialData
            title={step.title}
            context={flowContext}
            onPrev={() => onChangeStep(DemoSteps.SelectSchema)}
            onNext={(credentialValues) => {
              onChangeContextProperty('credentialValues')(credentialValues);
              onChangeStep(DemoSteps.CredentialOffer);
            }}
          />
        )}
      </PreparationStepLayout>
    </Row>
  );
};

export default Demo;

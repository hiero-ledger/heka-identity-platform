import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';

import { BasicPanel } from '@/components/Panel';
import { FillCredentialData, PreparationStepLayout } from '@/components/Steps';
import { CredentialOffer } from '@/components/Steps/CredentialOffer/CredentialOffer';
import { VerificationRequest } from '@/components/Steps/VerificationRequest/VerificationRequest';
import { StepHeader } from '@/components/StepTitle';
import { demoUser, mainDidMethod } from '@/const/user';
import {
  getIsPresentationCompleted,
  getPresentationSharedAttributes,
} from '@/entities/Presentation/model/selectors/presentationSelector';
import { Schema } from '@/entities/Schema';
import { getSchemas } from '@/entities/Schema/model/selectors/schemasSelector';
import { getDemoSchemaList } from '@/entities/Schema/model/services/getDemoSchemaList';
import {
  Openid4CredentialFormat,
  ProtocolType,
} from '@/entities/Schema/model/types/schema';
import {
  DemoContext,
  DemoSteps,
  steps,
  totalPreparationSteps,
} from '@/pages/AgeVerificationDemo/AgeVerificationDemo.config';
import { useFlow } from '@/shared/hooks/flow';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';
import { Button } from '@/shared/ui/Button';
import { CheckboxGroup } from '@/shared/ui/CheckboxGroup/CheckboxGroup';
import { Column, Row } from '@/shared/ui/Grid';
import { Loader } from '@/shared/ui/Loader/Loader';

import * as cls from './AgeVerificationDemo.module.scss';

const MDL_SCHEMA_NAME = 'mDL';
const AGE_FIELD = 'age_over_18';

const MDL_DEFAULT_VALUES: Record<string, string> = {
  given_name: 'John',
  family_name: 'Smith',
  birth_date: '1990-01-15',
  age_over_18: 'true',
  document_number: 'DL-123456789',
  expiry_date: '2030-12-31',
};


interface AgeVerificationFieldsProps {
  schema?: Schema;
  onPrev: () => void;
  onNext: (attributes: Array<string>) => void;
}

const AgeVerificationResultView = () => {
  const { t } = useTranslation();
  const revealedAttributes = useSelector(getPresentationSharedAttributes);

  return (
    <div className={cls.resultView}>
      <h2 className={cls.resultTitle}>{t('Flow.titles.presentationReceived')}</h2>
      <Column className={cls.resultAttributes}>
        {revealedAttributes?.map((attr) => {
          const displayValue = String(attr.value) === 'true' ? 'Yes' : String(attr.value) === 'false' ? 'No' : String(attr.value);
          const isAgeField = attr.name === AGE_FIELD;
          const isVerified = isAgeField && String(attr.value) === 'true';

          return (
            <Row key={attr.name} className={cls.resultRow}>
              <span className={cls.resultLabel}>{attr.name}</span>
              <span className={cls.resultValue}>
                {displayValue}
                {isAgeField && (
                  <span className={isVerified ? cls.ageBadgeSuccess : cls.ageBadgeFail}>
                    {isVerified
                      ? t('AgeVerificationDemo.result.verified')
                      : t('AgeVerificationDemo.result.notVerified')}
                  </span>
                )}
              </span>
            </Row>
          );
        })}
      </Column>
    </div>
  );
};

const AgeVerificationFields = ({
  schema,
  onPrev,
  onNext,
}: AgeVerificationFieldsProps) => {
  const { t } = useTranslation();

  const regularFields = useMemo(
    () =>
      schema?.fields
        ?.filter((f) => f.name !== AGE_FIELD)
        .map((f) => f.name) ?? [],
    [schema?.fields],
  );

  const hasAgeField = useMemo(
    () => schema?.fields?.some((f) => f.name === AGE_FIELD) ?? false,
    [schema?.fields],
  );

  const [selectedFields, setSelectedFields] = useState<Array<string>>([]);
  const [ageCheckEnabled, setAgeCheckEnabled] = useState(true);

  const onRequest = useCallback(() => {
    const attrs = [...selectedFields];
    if (hasAgeField && ageCheckEnabled) {
      attrs.push(AGE_FIELD);
    }
    onNext(attrs);
  }, [selectedFields, hasAgeField, ageCheckEnabled, onNext]);

  return (
    <>
      <StepHeader
        title={t('Flow.titles.requestFieldsVerification')}
        details={[]}
      />
      <CheckboxGroup
        options={regularFields}
        initial={[]}
        setSelected={setSelectedFields}
      />
      {hasAgeField && (
        <Row
          justifyContent="flex-start"
          alignItems="center"
          className={cls.ageCheck}
        >
          <input
            type="checkbox"
            checked={ageCheckEnabled}
            onChange={() => setAgeCheckEnabled((v) => !v)}
          />
          <p className={cls.ageCheckLabel}>
            {t('AgeVerificationDemo.ageCheck.label')}
          </p>
        </Row>
      )}
      <Row className={cls.stepNavigation}>
        <Button
          buttonType="outlined"
          leftIcon="arrow-back"
          onPress={onPrev}
        >
          {t('Common.buttons.back')}
        </Button>
        <Button
          onPress={onRequest}
          isDisabled={selectedFields.length === 0 && !ageCheckEnabled}
        >
          {t('Flow.buttons.request')}
        </Button>
      </Row>
    </>
  );
};

const AgeVerificationDemo = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const schemas = useSelector(getSchemas);
  const isPresentationCompleted = useSelector(getIsPresentationCompleted);

  const initialContext = {
    wizardType: 'demo',
    network: mainDidMethod,
    did: demoUser.did,
    protocolType: ProtocolType.Oid4vc,
    credentialType: Openid4CredentialFormat.MsoMdoc,
    //credentialType: Openid4CredentialFormat.SdJwt,
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
      onChangeContextProperty('credentialValues')(MDL_DEFAULT_VALUES);
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
        <div className={cls.contentPanel}>
          <AgeVerificationFields
            schema={flowContext.schema}
            onPrev={() => onChangeStep(DemoSteps.IssueNewCredential)}
            onNext={(attributes) => {
              onChangeContextProperty('attributes')(attributes);
              onChangeStep(DemoSteps.PresentationRequest);
            }}
          />
        </div>
      </Row>
    );
  }

  if (step.name === DemoSteps.PresentationRequest) {
    const handleStartAgain = () => {
      resetFlowState();
      setFlowContext({ ...initialContext, schema: flowContext.schema });
      onChangeStep(DemoSteps.IssueNewCredential);
    };

    if (isPresentationCompleted) {
      return (
        <Row className={cls.AgeDemo}>
          <BasicPanel title="Age Verification Demo" icon="car" />
          <AgeVerificationResultView />
        </Row>
      );
    }

    return (
      <VerificationRequest
        context={{ ...flowContext, useDemo: true }}
        stepDetails={step}
        onChangeStep={handleStartAgain}
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
            <>
              <FillCredentialData
                title={step.title}
                context={flowContext}
                onSkip={() => onChangeStep(DemoSteps.RequestFieldsVerification)}
                onNext={(credentialValues) => {
                  onChangeContextProperty('credentialValues')(credentialValues);
                  onChangeStep(DemoSteps.CredentialOffer);
                }}
              />
            </>
          )}
        </PreparationStepLayout>
      )}
    </Row>
  );
};

export default AgeVerificationDemo;

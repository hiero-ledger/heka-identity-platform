import React, { useCallback, useEffect, useMemo } from 'react';

import { WizardContext } from '@/app/types/WizardContext';
import { NextStepName, StepDetails } from '@/components/Steps/Step.types';
import { useConnectionActions } from '@/entities/Connection/model/slices/connectionSlice';
import { useCredentialActions } from '@/entities/Credential/model/slices/credentialSlice';
import { useIssuanceTemplatesActions } from '@/entities/IssuanceTemplate/model/slices/issuanceTemplatesSlice';
import { usePresentationActions } from '@/entities/Presentation/model/slices/presentationSlice';
import { Schema } from '@/entities/Schema';
import { useSchemasActions } from '@/entities/Schema/model/slices/schemasSlice';
import { useVerificationTemplatesActions } from '@/entities/VerificationTemplate/model/slices/verificationTemplatesSlice';
import { useLatest } from '@/shared/lib/hooks/useLatest';

export interface FlowConfig<T extends WizardContext> {
  initialContext?: T;
  steps: Array<StepDetails<T>>;
}

export function useFlow<T extends WizardContext>({
  initialContext,
  steps,
}: FlowConfig<T>) {
  const initial = initialContext ?? ({} as T);

  const [step, setStep] = React.useState(steps[0]);

  const [flowContext, setFlowContext] = React.useState<T>(initial);

  const { reset: resetConnectionState } = useConnectionActions();
  const { reset: resetCredentialState } = useCredentialActions();
  const { reset: resetPresentationState } = usePresentationActions();
  const { reset: resetSchemaState } = useSchemasActions();
  const { reset: resetIssuanceTemplateState } = useIssuanceTemplatesActions();
  const { reset: resetVerificationTemplateState } =
    useVerificationTemplatesActions();

  const stepNumber = useMemo(() => {
    return steps.findIndex((s) => step.name === s.name) + 1;
  }, [step.name, steps]);

  const onChangeContextProperty = useCallback(
    (property: string) =>
      (
        value:
          | string
          | Record<string, string>
          | Array<string>
          | Schema
          | undefined,
      ) => {
        setFlowContext((prevState) => ({
          ...prevState,
          [property]: value,
        }));
      },
    [],
  );

  // Callers pass a new `initialContext` (and often `steps`) on every render: read the latest
  // through refs, so `resetFlowState` keeps its identity. It changes only with the wizard type:
  // the same wizard component stays mounted when the route switches it between types, and
  // callers reset when it changes.
  const initialRef = useLatest(initial);
  const stepsRef = useLatest(steps);
  const wizardType = initial.wizardType;

  const resetFlowState = useCallback(() => {
    setFlowContext({ ...initialRef.current, wizardType });
    setStep(stepsRef.current[0]);
    resetConnectionState();
    resetCredentialState();
    resetPresentationState();
    resetSchemaState();
    resetIssuanceTemplateState();
    resetVerificationTemplateState();
  }, [
    initialRef,
    stepsRef,
    wizardType,
    resetConnectionState,
    resetCredentialState,
    resetPresentationState,
    resetSchemaState,
    resetIssuanceTemplateState,
    resetVerificationTemplateState,
  ]);

  const onChangeStep = useCallback(
    (toStep?: NextStepName<T>) => {
      const stepIndex = steps.findIndex((step) => step.name === toStep);
      if (stepIndex === -1) return;
      setStep(steps[stepIndex]);
    },
    [steps, setStep],
  );

  useEffect(() => {
    return () => resetFlowState();
  }, [resetFlowState]);

  return {
    flowContext,
    setFlowContext,
    onChangeContextProperty,
    step,
    onChangeStep,
    stepNumber,
    resetFlowState,
  };
}

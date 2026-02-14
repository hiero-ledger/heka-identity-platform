import { useCallback } from 'react';

import { useConnectionActions } from '@/entities/Connection/model/slices/connectionSlice';
import { useCredentialActions } from '@/entities/Credential/model/slices/credentialSlice';
import { useIssuanceTemplatesActions } from '@/entities/IssuanceTemplate/model/slices/issuanceTemplatesSlice';
import { usePresentationActions } from '@/entities/Presentation/model/slices/presentationSlice';
import { useSchemasActions } from '@/entities/Schema/model/slices/schemasSlice';
import { useVerificationTemplatesActions } from '@/entities/VerificationTemplate/model/slices/verificationTemplatesSlice';

export function useAppState() {
  const { reset: resetConnectionState } = useConnectionActions();
  const { reset: resetCredentialState } = useCredentialActions();
  const { reset: resetPresentationState } = usePresentationActions();
  const { reset: resetSchemaState } = useSchemasActions();
  const { reset: resetIssuanceTemplateState } = useIssuanceTemplatesActions();
  const { reset: resetVerificationTemplateState } =
    useVerificationTemplatesActions();

  const resetApplicationState = useCallback(() => {
    resetConnectionState();
    resetCredentialState();
    resetPresentationState();
    resetSchemaState();
    resetIssuanceTemplateState();
    resetVerificationTemplateState();
  }, [
    resetConnectionState,
    resetCredentialState,
    resetPresentationState,
    resetSchemaState,
    resetIssuanceTemplateState,
    resetVerificationTemplateState,
  ]);
  return {
    resetApplicationState,
  };
}

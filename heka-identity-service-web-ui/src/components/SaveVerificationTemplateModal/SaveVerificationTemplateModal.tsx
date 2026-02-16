import { useCallback } from 'react';
import { useSelector } from 'react-redux';

import { getVerificationTemplatesIsLoading } from '@/entities/VerificationTemplate/model/selectors/verificationTemplatesSelector';
import { createVerificationTemplate } from '@/entities/VerificationTemplate/model/services/createVerificationTemplate';
import { VerifyCredentialContext } from '@/pages/VerifyCredential/VerifyCredential.config';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';

import { SaveTemplateModal } from '../SaveTemplateModal';

interface SaveAsTemplateProps {
  context: VerifyCredentialContext;
  isOpen: boolean;
  onOpenChange: (value: boolean) => void;
}

export const SaveVerificationTemplateModal = ({
  isOpen,
  onOpenChange,
  context,
}: SaveAsTemplateProps) => {
  const dispatch = useAppDispatch();
  const isLoading = useSelector(getVerificationTemplatesIsLoading);

  const saveTemplate = useCallback(
    async (name: string) => {
      await dispatch(
        createVerificationTemplate({
          name,
          protocolType: context.protocolType!,
          credentialType: context.credentialType!,
          network: context.network!,
          did: context.did!,
          attributes: context.attributes!,
          schema: context.schema!,
        }),
      ).unwrap();
    },
    [dispatch, context],
  );

  return (
    <SaveTemplateModal
      isOpen={isOpen}
      isLoading={isLoading}
      onSave={saveTemplate}
      onOpenChange={onOpenChange}
    />
  );
};

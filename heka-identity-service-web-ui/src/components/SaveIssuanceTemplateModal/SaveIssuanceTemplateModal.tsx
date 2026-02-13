import { useCallback } from 'react';
import { useSelector } from 'react-redux';

import { getIssuanceTemplatesIsLoading } from '@/entities/IssuanceTemplate/model/selectors/issuanceTemplatesSelector';
import { createIssuanceTemplate } from '@/entities/IssuanceTemplate/model/services/createIssuanceTemplate';
import { IssueCredentialContext } from '@/pages/IssueCredential/IssueCredential.config';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';

import { SaveTemplateModal } from '../SaveTemplateModal';

interface SaveAsTemplateProps {
  context: IssueCredentialContext;
  isOpen: boolean;
  onOpenChange: (value: boolean) => void;
}

export const SaveIssuanceTemplateModal = ({
  isOpen,
  onOpenChange,
  context,
}: SaveAsTemplateProps) => {
  const dispatch = useAppDispatch();
  const isLoading = useSelector(getIssuanceTemplatesIsLoading);

  const saveTemplate = useCallback(
    async (name: string) => {
      await dispatch(
        createIssuanceTemplate({
          name,
          protocolType: context.protocolType!,
          credentialType: context.credentialType!,
          network: context.network!,
          did: context.did!,
          credentialValues: context.credentialValues!,
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

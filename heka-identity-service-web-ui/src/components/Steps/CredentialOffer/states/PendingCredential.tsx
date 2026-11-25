import { useCallback } from 'react';
import { useSelector } from 'react-redux';

import { ConnectionChoiceOptions } from '@/components/ExistingConnection';
import {
  getCredentialOfferId,
  getIsCredentialSent,
} from '@/entities/Credential/model/selectors/credentialSelector';
import { updateCredentialState } from '@/entities/Credential/model/services/updateCredentialState';
import { ProtocolType } from '@/entities/Schema/model/types/schema';
import { useRecordUpdates } from '@/shared/hooks/recordUpdates';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';

import { CredentialOfferView } from './CredentialOfferView';

interface PendingCredentialParams {
  value?: string;
  protocolType?: ProtocolType;
  useDemo?: boolean;
  // Aries only: name the new connection or send over an existing one
  connection?: ConnectionChoiceOptions;
}

export const PendingCredential = ({
  value,
  protocolType,
  useDemo,
  connection,
}: PendingCredentialParams) => {
  const dispatch = useAppDispatch();

  const credentialOfferId = useSelector(getCredentialOfferId);
  const isCredentialSent = useSelector(getIsCredentialSent);

  const refreshCredentialState = useCallback(() => {
    if (!credentialOfferId || !protocolType) return;
    dispatch(
      updateCredentialState({
        protocolType: protocolType,
        id: credentialOfferId,
        useDemo,
      }),
    );
  }, [credentialOfferId, protocolType, dispatch, useDemo]);

  useRecordUpdates({
    recordId: protocolType ? credentialOfferId : undefined,
    isDone: isCredentialSent,
    refresh: refreshCredentialState,
    useDemo,
  });

  return (
    <CredentialOfferView
      value={value}
      connection={connection}
    />
  );
};

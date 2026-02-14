import { useEffect } from 'react';
import { useSelector } from 'react-redux';

import { pollTimeout } from '@/const/behaviour';
import {
  getConnectionId,
  getConnectionInvitation,
  getConnectionState,
} from '@/entities/Connection/model/selectors/connectionSelector';
import { createConnection } from '@/entities/Connection/model/services/createConnection';
import { updateConnectionState } from '@/entities/Connection/model/services/updateConnectionState';
import { ConnectionState } from '@/entities/Connection/model/types/connection';
import { useAppDispatch } from '@/shared/lib/hooks/useAppDispatch';

export interface UseConnectionParams {
  onComplete: (connectionId?: string) => void;
}

export function useConnection({ onComplete }: UseConnectionParams) {
  const dispatch = useAppDispatch();

  const connectionId = useSelector(getConnectionId);
  const connectionInvitation = useSelector(getConnectionInvitation);
  const connectionState = useSelector(getConnectionState);

  useEffect(() => {
    dispatch(createConnection());
  }, [dispatch]);

  useEffect(() => {
    if (connectionId && connectionState !== ConnectionState.Completed) {
      const polling = setInterval(() => {
        dispatch(
          updateConnectionState({
            id: connectionId,
          }),
        );
      }, pollTimeout);
      return () => clearInterval(polling);
    }
  }, [connectionId, connectionState, dispatch]);

  useEffect(() => {
    if (connectionState === ConnectionState.Completed) {
      onComplete(connectionId);
    }
  }, [connectionState, onComplete, connectionId]);

  return {
    connectionId,
    connectionInvitation,
    connectionState,
  };
}

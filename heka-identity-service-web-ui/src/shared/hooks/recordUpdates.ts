import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useSelector } from 'react-redux';

import { pollTimeout, safetyPollTimeout } from '@/const/behaviour';
import { getUserMessageDeliveryType } from '@/entities/User/model/selectors/userSelector';
import {
  getNotificationRecordId,
  getStatus,
  onStatusChange,
  subscribe,
} from '@/shared/lib/notifications';

// Matches MessageDeliveryType.WebHook in the identity service: pushes go to the webhook instead
const WEBHOOK_DELIVERY = 'WebHook';

export interface UseRecordUpdatesParams {
  recordId?: string;
  isDone: boolean;
  refresh: () => void;
  // Demo pages share one identity, so pushes for it cannot be trusted to reach this tab
  useDemo?: boolean;
}

export const useNotificationStatus = () =>
  useSyncExternalStore(onStatusChange, getStatus);

/**
 * Keeps a pending credential offer or presentation request up to date. A push for the record
 * triggers `refresh`; polling continues as the fallback, fast whenever pushes cannot be relied on.
 */
export function useRecordUpdates({
  recordId,
  isDone,
  refresh,
  useDemo,
}: UseRecordUpdatesParams) {
  const status = useNotificationStatus();
  const deliveryType = useSelector(getUserMessageDeliveryType);
  const isPushAvailable =
    !useDemo && status === 'open' && deliveryType !== WEBHOOK_DELIVERY;
  const isActive = !!recordId && !isDone;

  // Callers rebuild refresh on every render; the effects must not resubscribe for that
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!isActive || !isPushAvailable) return;
    return subscribe((message) => {
      if (getNotificationRecordId(message) === recordId) refreshRef.current();
    });
  }, [isActive, isPushAvailable, recordId]);

  // Events sent before the socket opened (or while it reconnected) are lost, so catch up once
  useEffect(() => {
    if (isActive && isPushAvailable) refreshRef.current();
  }, [isActive, isPushAvailable]);

  useEffect(() => {
    if (!isActive) return;
    const polling = setInterval(
      () => refreshRef.current(),
      isPushAvailable ? safetyPollTimeout : pollTimeout,
    );
    return () => clearInterval(polling);
  }, [isActive, isPushAvailable]);
}

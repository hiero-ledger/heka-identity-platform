import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { Provider } from 'react-redux';

import { pollTimeout, safetyPollTimeout } from '@/const/behaviour';
import {
  NotificationMessage,
  NotificationStatus,
} from '@/shared/lib/notifications';

import { useRecordUpdates, UseRecordUpdatesParams } from './recordUpdates';

// A controllable stand-in for the shared socket client
const mockClient = {
  status: 'closed' as NotificationStatus,
  statusListeners: new Set<(status: NotificationStatus) => void>(),
  messageListeners: new Set<(message: NotificationMessage) => void>(),
  setStatus(status: NotificationStatus) {
    this.status = status;
    this.statusListeners.forEach((listener) => listener(status));
  },
  push(message: NotificationMessage) {
    this.messageListeners.forEach((listener) => listener(message));
  },
};

jest.mock('@/shared/lib/notifications', () => ({
  ...jest.requireActual('@/shared/lib/notifications/types'),
  getStatus: () => mockClient.status,
  onStatusChange: (listener: (status: NotificationStatus) => void) => {
    mockClient.statusListeners.add(listener);
    return () => mockClient.statusListeners.delete(listener);
  },
  subscribe: (listener: (message: NotificationMessage) => void) => {
    mockClient.messageListeners.add(listener);
    return () => mockClient.messageListeners.delete(listener);
  },
}));

const makeStore = (messageDeliveryType?: string) =>
  configureStore({
    reducer: {
      user: () => ({
        isLoading: false,
        isPreparing: false,
        data: { messageDeliveryType },
      }),
    },
  });

const renderUpdates = (
  params: Partial<UseRecordUpdatesParams>,
  messageDeliveryType?: string,
) => {
  const refresh = jest.fn();
  const store = makeStore(messageDeliveryType);
  const view = renderHook(
    (props: Partial<UseRecordUpdatesParams>) =>
      useRecordUpdates({
        recordId: 'rec-1',
        isDone: false,
        refresh,
        ...props,
      }),
    {
      initialProps: params,
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      ),
    },
  );
  return { refresh, ...view };
};

describe('useRecordUpdates', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockClient.status = 'closed';
    mockClient.statusListeners.clear();
    mockClient.messageListeners.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('polls every 2 s while the socket is not open', () => {
    const { refresh } = renderUpdates({});

    act(() => jest.advanceTimersByTime(pollTimeout * 3));

    expect(refresh).toHaveBeenCalledTimes(3);
  });

  test('refreshes on a push for its record only', () => {
    mockClient.status = 'open';
    const { refresh } = renderUpdates({});
    refresh.mockClear(); // the catch-up refresh on open

    act(() =>
      mockClient.push({ type: 'DidCommProofStateChanged', id: 'other' }),
    );
    expect(refresh).not.toHaveBeenCalled();

    act(() =>
      mockClient.push({ type: 'DidCommProofStateChanged', id: 'rec-1' }),
    );
    expect(refresh).toHaveBeenCalledTimes(1);

    act(() =>
      mockClient.push({
        type: 'OpenId4VcVerifier.VerificationSessionStateChanged',
        verificationSession: { id: 'rec-1' },
      }),
    );
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  test('slows polling to the safety interval while pushes flow', () => {
    mockClient.status = 'open';
    const { refresh } = renderUpdates({});
    refresh.mockClear();

    act(() => jest.advanceTimersByTime(safetyPollTimeout - 1));
    expect(refresh).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(1));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test('catches up once when the socket (re)opens', () => {
    const { refresh } = renderUpdates({});

    act(() => mockClient.setStatus('open'));

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test('keeps fast polling on demo pages and for webhook users', () => {
    mockClient.status = 'open';
    const demo = renderUpdates({ useDemo: true });
    act(() => mockClient.push({ type: 'x', id: 'rec-1' }));
    expect(demo.refresh).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(pollTimeout));
    expect(demo.refresh).toHaveBeenCalledTimes(1);
    demo.unmount();

    const webhook = renderUpdates({}, 'WebHook');
    act(() => jest.advanceTimersByTime(pollTimeout));
    expect(webhook.refresh).toHaveBeenCalledTimes(1);
  });

  test('stops everything once the record is done', () => {
    mockClient.status = 'open';
    const { refresh, rerender } = renderUpdates({});
    refresh.mockClear();

    rerender({ isDone: true });
    act(() => mockClient.push({ type: 'x', id: 'rec-1' }));
    act(() => jest.advanceTimersByTime(safetyPollTimeout * 2));

    expect(refresh).not.toHaveBeenCalled();
  });
});

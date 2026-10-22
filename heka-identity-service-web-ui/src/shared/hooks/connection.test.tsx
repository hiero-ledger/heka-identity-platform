import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook, waitFor } from '@testing-library/react';
import { AxiosInstance } from 'axios';
import React from 'react';
import { Provider } from 'react-redux';

import { pollTimeout } from '@/const/behaviour';
import { connectionReducer } from '@/entities/Connection';
import { ConnectionState } from '@/entities/Connection/model/types/connection';

import { useConnection } from './connection';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn() },
}));

const makeStore = (agencyApi: AxiosInstance) =>
  configureStore({
    reducer: { connections: connectionReducer },
    preloadedState: {
      connections: {
        isLoading: false,
        connections: [],
        isConnectionsLoading: false,
        // Left over from the previous flow: its QR was scanned and the connection completed
        connectionSession: {
          oobId: 'oob-old',
          connectionId: 'conn-old',
          invitationUrl: 'https://agent/?oob=old',
          state: ConnectionState.Completed,
        },
      },
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        thunk: { extraArgument: { agencyApi, agencyDemoApi: agencyApi } },
      }),
  });

describe('useConnection', () => {
  test('a new step does not reuse the completed session of the previous flow', async () => {
    const agencyApi = {
      post: jest.fn().mockResolvedValue({
        data: { id: 'oob-new', invitationUrl: 'https://agent/?oob=new' },
      }),
      get: jest.fn().mockResolvedValue({ data: [] }),
    } as unknown as AxiosInstance;
    const store = makeStore(agencyApi);
    const onComplete = jest.fn();

    const { result } = renderHook(() => useConnection({ onComplete }), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      ),
    });

    await waitFor(() =>
      expect(result.current.connectionInvitation).toBe(
        'https://agent/?oob=new',
      ),
    );
    expect(result.current.connectionState).toBe(ConnectionState.Start);
    expect(onComplete).not.toHaveBeenCalled();
  });

  test('choosing an existing connection completes with its id', async () => {
    const agencyApi = {
      post: jest.fn().mockResolvedValue({
        data: { id: 'oob-new', invitationUrl: 'https://agent/?oob=new' },
      }),
      get: jest.fn().mockResolvedValue({ data: [] }),
    } as unknown as AxiosInstance;
    const store = makeStore(agencyApi);
    const onComplete = jest.fn();

    const { result } = renderHook(() => useConnection({ onComplete }), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      ),
    });
    await waitFor(() =>
      expect(result.current.connectionInvitation).toBeTruthy(),
    );

    act(() => result.current.selectConnection('conn-chosen'));

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith('conn-chosen'));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test('a scanned QR completes with the new connection id', async () => {
    jest.useFakeTimers();
    const agencyApi = {
      post: jest.fn().mockResolvedValue({
        data: { id: 'oob-new', invitationUrl: 'https://agent/?oob=new' },
      }),
      get: jest.fn((url: string) =>
        Promise.resolve({
          data:
            url === 'connections'
              ? []
              : { id: 'conn-new', state: ConnectionState.Completed },
        }),
      ),
    } as unknown as AxiosInstance;
    const store = makeStore(agencyApi);
    const onComplete = jest.fn();

    const { result } = renderHook(() => useConnection({ onComplete }), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      ),
    });
    await waitFor(() =>
      expect(result.current.connectionInvitation).toBeTruthy(),
    );

    await act(async () => {
      jest.advanceTimersByTime(pollTimeout);
    });

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith('conn-new'));
    expect(onComplete).not.toHaveBeenCalledWith('conn-old');
    jest.useRealTimers();
  });

  test('a new onComplete identity after completion does not send again', async () => {
    const agencyApi = {
      post: jest.fn().mockResolvedValue({
        data: { id: 'oob-new', invitationUrl: 'https://agent/?oob=new' },
      }),
      get: jest.fn().mockResolvedValue({ data: [] }),
    } as unknown as AxiosInstance;
    const store = makeStore(agencyApi);
    const first = jest.fn();
    const second = jest.fn();

    const { result, rerender } = renderHook(
      ({ onComplete }: { onComplete: (id?: string) => void }) =>
        useConnection({ onComplete }),
      {
        initialProps: { onComplete: first },
        wrapper: ({ children }: { children: React.ReactNode }) => (
          <Provider store={store}>{children}</Provider>
        ),
      },
    );
    await waitFor(() =>
      expect(result.current.connectionInvitation).toBeTruthy(),
    );

    act(() => result.current.selectConnection('conn-chosen'));
    await waitFor(() => expect(first).toHaveBeenCalledWith('conn-chosen'));

    // The flow context changed, so the caller's useCallback returns a new function
    rerender({ onComplete: second });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  test('restarting with a QR and choosing the same connection sends again', async () => {
    const agencyApi = {
      post: jest.fn().mockResolvedValue({
        data: { id: 'oob-new', invitationUrl: 'https://agent/?oob=new' },
      }),
      get: jest.fn().mockResolvedValue({ data: [] }),
    } as unknown as AxiosInstance;
    const store = makeStore(agencyApi);
    const onComplete = jest.fn();

    const { result } = renderHook(() => useConnection({ onComplete }), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      ),
    });
    await waitFor(() =>
      expect(result.current.connectionInvitation).toBeTruthy(),
    );

    act(() => result.current.selectConnection('conn-chosen'));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));

    act(() => result.current.restartWithQr());
    await waitFor(() =>
      expect(result.current.connectionState).toBe(ConnectionState.Start),
    );
    act(() => result.current.selectConnection('conn-chosen'));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(2));
  });
});

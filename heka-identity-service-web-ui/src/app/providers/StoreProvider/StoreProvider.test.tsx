import { createSlice, ReducersMapObject } from '@reduxjs/toolkit';
import { act, render, screen } from '@testing-library/react';
import { useDispatch, useSelector } from 'react-redux';

import { userActions } from '@/entities/User';

import { createReducerManager } from './config/reducerManager';
import { StateSchema, StateSchemaKey } from './config/StateSchema';
import { createReduxStore } from './config/store';

import { StoreProvider } from './index';

const UserName = () => {
  const name = useSelector((state: StateSchema) => state.user.data?.name);
  return <p>{name ?? 'anonymous'}</p>;
};

describe('StoreProvider', () => {
  test('provides a store with the initial state', () => {
    render(
      <StoreProvider
        initialState={{
          user: {
            isLoading: false,
            isPreparing: false,
            data: { name: 'Jane Doe' },
          },
        }}
      >
        <UserName />
      </StoreProvider>,
    );

    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
  });

  test('keeps the same store, and its state, when the provider re-renders', () => {
    let dispatch: ReturnType<typeof useDispatch> | undefined;
    const CaptureDispatch = () => {
      dispatch = useDispatch();
      return null;
    };
    // A fresh element each time, so React really re-renders the provider
    const tree = () => (
      <StoreProvider>
        <CaptureDispatch />
        <UserName />
      </StoreProvider>
    );

    const { rerender } = render(tree());
    act(() => {
      dispatch!(
        userActions.setSession({ accessToken: 'token', name: 'Jane Doe' }),
      );
    });
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();

    rerender(tree());

    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
  });

  test('provides a store with the default state', () => {
    render(
      <StoreProvider>
        <UserName />
      </StoreProvider>,
    );

    expect(screen.getByText('anonymous')).toBeInTheDocument();
  });
});

describe('createReduxStore', () => {
  test('registers the app reducers and a reducer manager', () => {
    const store = createReduxStore();

    expect(Object.keys(store.getState())).toEqual(
      expect.arrayContaining([
        'schemas',
        'credentials',
        'presentations',
        'connections',
        'user',
        'issuanceTemplates',
        'verificationTemplates',
      ]),
    );
    expect(
      (store as unknown as { reducerManager: object }).reducerManager,
    ).toBeDefined();
  });
});

describe('createReducerManager', () => {
  const counter = createSlice({
    name: 'counter',
    initialState: 0,
    reducers: { increment: (state) => state + 1 },
  });
  const extraKey = 'counter' as StateSchemaKey;

  const createManager = () =>
    createReducerManager({
      user: (state = { isLoading: false, isPreparing: false }) => state,
    } as unknown as ReducersMapObject<StateSchema>);

  test('adds and removes reducers at runtime', () => {
    const manager = createManager();

    manager.add(extraKey, counter.reducer);
    expect(manager.getMountedReducers()).toEqual({ counter: true });
    expect(Object.keys(manager.getReducerMap())).toEqual(['user', 'counter']);

    let state = manager.reduce(
      undefined as unknown as StateSchema,
      counter.actions.increment(),
    ) as unknown as Record<string, unknown>;
    expect(state.counter).toBe(1);

    manager.remove(extraKey);
    expect(manager.getMountedReducers()).toEqual({ counter: false });

    state = manager.reduce(
      state as unknown as StateSchema,
      counter.actions.increment(),
    ) as unknown as Record<string, unknown>;
    expect(state).not.toHaveProperty('counter');
    expect(state).toHaveProperty('user');
  });

  test('ignores empty keys, duplicates and unknown reducers', () => {
    const manager = createManager();
    const userReducer = manager.getReducerMap().user;

    manager.add('' as StateSchemaKey, counter.reducer);
    manager.add('user', counter.reducer);
    manager.remove('' as StateSchemaKey);
    manager.remove(extraKey);

    expect(manager.getReducerMap().user).toBe(userReducer);
    expect(manager.getMountedReducers()).toEqual({});
  });
});

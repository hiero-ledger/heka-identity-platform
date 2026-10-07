import { Reducer } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';

import { ReduxStoreWithManager } from '@/app/providers/StoreProvider';
import { createTestStore } from '@/shared/lib/tests/renderWithProviders';

import { DynamicModuleLoader, ReducersList } from './DynamicModuleLoader';

const featureReducer: Reducer<{ ready: boolean }> = (state = { ready: true }) =>
  state;

// A key outside the static StateSchema, as a lazily loaded feature would add
const reducers = { feature: featureReducer } as unknown as ReducersList;

const stateOf = (store: ReturnType<typeof createTestStore>) =>
  store.getState() as unknown as Record<string, unknown>;

describe('DynamicModuleLoader', () => {
  test('mounts the reducers while rendered and removes them on unmount', () => {
    const store = createTestStore();

    const { unmount } = render(
      <Provider store={store}>
        <DynamicModuleLoader reducers={reducers}>
          <span>feature</span>
        </DynamicModuleLoader>
      </Provider>,
    );

    expect(screen.getByText('feature')).toBeInTheDocument();
    expect(stateOf(store).feature).toEqual({ ready: true });

    unmount();
    store.dispatch({ type: 'any' });

    expect(stateOf(store).feature).toBeUndefined();
    expect(
      (
        store as unknown as ReduxStoreWithManager
      ).reducerManager.getMountedReducers(),
    ).toMatchObject({
      feature: false,
    });
  });

  test('keeps the reducers after unmount when asked to', () => {
    const store = createTestStore();

    const { unmount } = render(
      <Provider store={store}>
        <DynamicModuleLoader
          reducers={reducers}
          removeAfterUnmount={false}
        >
          <span>feature</span>
        </DynamicModuleLoader>
      </Provider>,
    );
    unmount();

    expect(stateOf(store).feature).toEqual({ ready: true });
  });

  test('does not mount a reducer twice', () => {
    const store = createTestStore();
    const add = jest.spyOn(
      (store as unknown as ReduxStoreWithManager).reducerManager,
      'add',
    );

    render(
      <Provider store={store}>
        <DynamicModuleLoader reducers={reducers}>
          <DynamicModuleLoader
            reducers={reducers}
            removeAfterUnmount={false}
          >
            <span>nested</span>
          </DynamicModuleLoader>
        </DynamicModuleLoader>
      </Provider>,
    );

    expect(add).toHaveBeenCalledTimes(1);
  });
});

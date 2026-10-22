import { configureStore } from '@reduxjs/toolkit';
import { act, renderHook } from '@testing-library/react';
import { PropsWithChildren } from 'react';
import { Provider } from 'react-redux';

import { StateSchema } from '@/app/providers/StoreProvider';

import { buildSelector, buildSlice } from './index';

const counterSlice = buildSlice({
  name: 'counter',
  initialState: { value: 0 },
  reducers: {
    add: (state, action: { payload: number }) => {
      state.value += action.payload;
    },
  },
});

const makeStore = () =>
  configureStore({ reducer: { counter: counterSlice.reducer } });

const wrapperFor =
  (store: ReturnType<typeof makeStore>) =>
  // eslint-disable-next-line react/display-name
  ({ children }: PropsWithChildren) => (
    <Provider store={store}>{children}</Provider>
  );

type CounterState = StateSchema & { counter: { value: number } };

describe('buildSlice', () => {
  test('useActions dispatches bound action creators', () => {
    const store = makeStore();
    const { result } = renderHook(() => counterSlice.useActions(), {
      wrapper: wrapperFor(store),
    });

    act(() => {
      result.current.add(2);
      result.current.add(3);
    });

    expect(store.getState().counter.value).toBe(5);
  });
});

describe('buildSelector', () => {
  test('returns a hook and the plain selector, both taking extra arguments', () => {
    const [useTimes, selectTimes] = buildSelector(
      (state: StateSchema, factor: number) =>
        (state as CounterState).counter.value * factor,
    );
    const store = makeStore();
    store.dispatch(counterSlice.actions.add(4));

    expect(selectTimes(store.getState() as unknown as StateSchema, 2)).toBe(8);

    const { result } = renderHook(() => useTimes(3), {
      wrapper: wrapperFor(store),
    });
    expect(result.current).toBe(12);

    act(() => {
      store.dispatch(counterSlice.actions.add(1));
    });
    expect(result.current).toBe(15);
  });
});

import { ReducersMapObject } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { ReactNode, useEffect, useState } from 'react';
import { Provider } from 'react-redux';

import { StateSchema } from '../config/StateSchema';
import { createReduxStore } from '../config/store';

interface StoreProviderProps {
  children?: ReactNode;
  initialState?: DeepPartial<StateSchema>;
  asyncReducers?: DeepPartial<ReducersMapObject<StateSchema>>;
}

export const StoreProvider = (props: StoreProviderProps) => {
  const { children, initialState, asyncReducers } = props;

  // Created once per mount: a store built in the render body would be replaced, and all app
  // state wiped, on every re-render of the provider
  const [store] = useState(() =>
    createReduxStore(
      initialState as StateSchema,
      asyncReducers as ReducersMapObject<StateSchema>,
    ),
  );

  // Lets the cached queries refetch when the browser comes back online (`refetchOnReconnect`).
  // Attached here rather than in `createReduxStore`, so test stores add no window listeners.
  useEffect(() => setupListeners(store.dispatch), [store]);

  return <Provider store={store}>{children}</Provider>;
};

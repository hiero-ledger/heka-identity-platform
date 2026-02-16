import { configureStore, ReducersMapObject } from '@reduxjs/toolkit';
import { Reducer } from 'redux';

import { connectionReducer } from '@/entities/Connection';
import { credentialReducer } from '@/entities/Credential';
import { issuanceTemplatesReducer } from '@/entities/IssuanceTemplate';
import { presentationReducer } from '@/entities/Presentation';
import { schemasReducer } from '@/entities/Schema';
import { userReducer } from '@/entities/User';
import { verificationTemplatesReducer } from '@/entities/VerificationTemplate/model/slices/verificationTemplatesSlice';
import { $agencyDemoApi } from '@/shared/api';
import { $agencyApi, $authApi } from '@/shared/api/config/api';

import { createReducerManager } from './reducerManager';
import { StateSchema, ThunkExtraArg } from './StateSchema';

export function createReduxStore(
  initialState?: StateSchema,
  asyncReducers?: ReducersMapObject<StateSchema>,
) {
  const rootReducers: ReducersMapObject<StateSchema> = {
    ...asyncReducers,
    schemas: schemasReducer,
    credentials: credentialReducer,
    presentations: presentationReducer,
    connections: connectionReducer,
    user: userReducer,
    issuanceTemplates: issuanceTemplatesReducer,
    verificationTemplates: verificationTemplatesReducer,
  };

  const reducerManager = createReducerManager(rootReducers);

  const extraArg: ThunkExtraArg = {
    agencyDemoApi: $agencyDemoApi,
    agencyApi: $agencyApi,
    authApi: $authApi,
  };

  const store = configureStore({
    reducer: reducerManager.reduce as Reducer<StateSchema>,
    devTools: __IS_DEV__,
    preloadedState: initialState,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        thunk: {
          extraArgument: extraArg,
        },
      }),
  });

  // @ts-ignore
  store.reducerManager = reducerManager;

  return store;
}

export type RootState = ReturnType<
  ReturnType<typeof createReduxStore>['getState']
>;
export type AppDispatch = ReturnType<typeof createReduxStore>['dispatch'];

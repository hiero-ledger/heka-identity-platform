import {
  EnhancedStore,
  Reducer,
  ReducersMapObject,
  UnknownAction,
} from '@reduxjs/toolkit';
import { AxiosInstance } from 'axios';

import { ConnectionSchema } from '@/entities/Connection';
import { CredentialSchema } from '@/entities/Credential';
import { IssuanceTemplateSchema } from '@/entities/IssuanceTemplate';
import { PresentationSchema } from '@/entities/Presentation/model/types/presentation';
import { SchemasSchema } from '@/entities/Schema';
import { UserSchema } from '@/entities/User';
import { VerificationTemplateSchema } from '@/entities/VerificationTemplate';

export interface StateSchema {
  schemas: SchemasSchema;
  connections: ConnectionSchema;
  credentials: CredentialSchema;
  presentations: PresentationSchema;
  issuanceTemplates: IssuanceTemplateSchema;
  verificationTemplates: VerificationTemplateSchema;
  user: UserSchema;
}

export type StateSchemaKey = keyof StateSchema;
export type MountedReducers = OptionalRecord<StateSchemaKey, boolean>;

export interface ReducerManager {
  getReducerMap: () => ReducersMapObject<StateSchema>;
  reduce: (state: StateSchema, action: UnknownAction) => StateSchema;
  add: (key: StateSchemaKey, reducer: Reducer) => void;
  remove: (key: StateSchemaKey) => void;
  getMountedReducers: () => MountedReducers;
}

export interface ReduxStoreWithManager extends EnhancedStore<StateSchema> {
  reducerManager: ReducerManager;
}

export interface ThunkExtraArg {
  agencyDemoApi: AxiosInstance;
  agencyApi: AxiosInstance;
  authApi: AxiosInstance;
}

export interface ThunkConfig<T> {
  rejectValue: T;
  state: StateSchema;
  extra: ThunkExtraArg;
}

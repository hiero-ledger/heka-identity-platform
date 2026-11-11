import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import {
  AnoncredsCredentialState,
  OpenIdIssuanceState,
} from '@/entities/Credential/model/types/credential';
import { SchemasResponse } from '@/entities/Schema/model/types/schema';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { handleError } from '@/shared/api/utils/error';

import {
  AnoncredsCredentialRecordResponse,
  IssuedCredential,
  OpenIdIssuanceSessionResponse,
} from '../types/issuedCredential';
import {
  mapAnoncredsCredential,
  mapOpenIdIssuanceSession,
  sortByIssuedAt,
} from '../utils/mapIssuedCredential';

/**
 * Finished issuances of both protocols, newest first. Schemas are loaded (hidden ones included)
 * only to show their names.
 */
export const getIssuedCredentials = createAsyncThunk<
  IssuedCredential[],
  void,
  ThunkConfig<string>
>('issuedCredentials/getIssuedCredentials', async (_, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;

  try {
    const [anoncredsResponse, openIdResponse, schemasResponse] =
      await Promise.all([
        extra.agencyApi.get<AnoncredsCredentialRecordResponse[]>(
          agencyEndpoints.getAnoncredsCredentials,
          { params: { role: 'issuer', state: AnoncredsCredentialState.Done } },
        ),
        extra.agencyApi.get<OpenIdIssuanceSessionResponse[]>(
          agencyEndpoints.getOpenIdIssuanceSessions,
          { params: { state: OpenIdIssuanceState.Completed } },
        ),
        extra.agencyApi.get<SchemasResponse>(agencyEndpoints.getSchemaList),
      ]);

    const schemas = schemasResponse.data?.items ?? [];

    return sortByIssuedAt([
      ...(anoncredsResponse.data ?? []).map((record) =>
        mapAnoncredsCredential(record, schemas),
      ),
      ...(openIdResponse.data ?? []).map((session) =>
        mapOpenIdIssuanceSession(session, schemas),
      ),
    ]);
  } catch (error) {
    return handleError(error, rejectWithValue, dispatch);
  }
});

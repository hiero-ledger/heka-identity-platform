import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { ProtocolType } from '@/entities/Schema';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { ApiError, handleError } from '@/shared/api/utils/error';

import { RevokeIssuedCredentialResult } from '../types/issuedCredential';

export interface RevokeIssuedCredentialParams {
  /** DIDComm credential exchange record id or OID4VC issuance session id */
  id: string;
  /** Store key of the item */
  key: string;
  protocol: ProtocolType;
}

/**
 * Revokes an issued credential: an AnonCreds credential issued over DIDComm, or the SD-JWT VCs of
 * an OpenID4VC issuance session (IETF Token Status List). The identity service decides whether the
 * credential is revocable and whether the user may revoke it.
 */
export const revokeIssuedCredential = createAsyncThunk<
  RevokeIssuedCredentialResult,
  RevokeIssuedCredentialParams,
  ThunkConfig<string>
>(
  'issuedCredentials/revokeIssuedCredential',
  async ({ id, key, protocol }, thunkAPI) => {
    const { extra, rejectWithValue, dispatch } = thunkAPI;

    try {
      await extra.agencyApi.post(
        protocol === ProtocolType.Oid4vc
          ? agencyEndpoints.revokeOpenIdIssuanceSession(id)
          : agencyEndpoints.revokeAnoncredsCredential(id),
      );
      return { key, alreadyRevoked: false };
    } catch (error) {
      // Already revoked, e.g. from another tab: the result the user asked for, not an error
      if ((error as Partial<ApiError>)?.response?.status === 409) {
        return { key, alreadyRevoked: true };
      }
      return handleError(error, rejectWithValue, dispatch);
    }
  },
);

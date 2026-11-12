import { createAsyncThunk } from '@reduxjs/toolkit';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { getErrorMessage, handleError } from '@/shared/api/utils/error';
import i18next from '@/translations';

import { DidDocument, DidMethodError, GetDidsResult } from '../types/did';
import { normalizeDidDocument, sortDids } from '../utils/didDocument';

/**
 * Loads the wallet's own DIDs of every configured method: one `GET /dids` per method, never
 * one without `method`, which would also return the pairwise did:peer connection DIDs.
 *
 * A failed method does not fail the list: it is reported in `failedMethods`, without a toast,
 * for the page to show. The thunk is rejected only when the methods cannot be read or every
 * method failed.
 */
export const getDids = createAsyncThunk<
  GetDidsResult,
  void,
  ThunkConfig<string>
>('dids/getDids', async (_, thunkAPI) => {
  const { extra, rejectWithValue, dispatch } = thunkAPI;

  try {
    // Read here rather than through the wizard's `getDidMethods`, which assumes a well-formed body:
    // a malformed answer (no body, no `methods`, wrong types) must not surface as a raw TypeError
    const { data } = await extra.agencyApi.get<{ methods?: unknown } | null>(
      agencyEndpoints.getDidMethods,
    );
    const methods: unknown = data?.methods;
    if (
      !Array.isArray(methods) ||
      !methods.every((method) => typeof method === 'string')
    ) {
      throw new Error(i18next.t('Dids.list.invalidMethods'));
    }

    const results = await Promise.allSettled(
      methods.map((method) =>
        extra.agencyApi.get<DidDocument[]>(agencyEndpoints.getDids, {
          params: { own: true, method },
        }),
      ),
    );

    const failedMethods: DidMethodError[] = [];
    const documents: DidDocument[] = [];
    let firstError: unknown;

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        firstError ??= result.reason;
        failedMethods.push({
          method: methods[index],
          message: getErrorMessage(result.reason),
        });
        return;
      }
      const data = Array.isArray(result.value.data) ? result.value.data : [];
      documents.push(...data);
    });

    if (methods.length > 0 && failedMethods.length === methods.length) {
      return handleError(firstError as Error, rejectWithValue, dispatch);
    }

    const seen = new Set<string>();
    const items = documents
      .filter((doc) => typeof doc?.id === 'string')
      .map(normalizeDidDocument)
      .filter((doc) => {
        if (seen.has(doc.id)) return false;
        seen.add(doc.id);
        return true;
      });

    return { items: sortDids(items, methods), failedMethods };
  } catch (error) {
    return handleError(error as Error, rejectWithValue, dispatch);
  }
});

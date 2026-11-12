import { createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';

import { ThunkConfig } from '@/app/providers/StoreProvider';
import { agencyEndpoints } from '@/shared/api/config/endpoints';
import { getErrorMessage, handleError } from '@/shared/api/utils/error';
import i18next from '@/translations';

import { DidDocument, DidMethodError, GetDidsResult } from '../types/did';
import { normalizeDidDocument, sortDids } from '../utils/didDocument';

/** One stalled method must not keep the whole list loading; the others are shown without it */
export const DID_LIST_REQUEST_TIMEOUT_MS = 30_000;

const isTimeout = (error: unknown) =>
  axios.isAxiosError(error) &&
  (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT');

const describeMethodError = (error: unknown) =>
  isTimeout(error) ? i18next.t('Dids.list.timeout') : getErrorMessage(error);

/**
 * Loads the wallet's own DIDs of every configured method: one `GET /dids` per method, never
 * one without `method`, which would also return the pairwise did:peer connection DIDs.
 *
 * A failed method does not fail the list: it is reported in `failedMethods`, without a toast,
 * for the page to show. That includes a method whose request timed out or whose answer is not a
 * list. The thunk is rejected only when the methods cannot be read or every method failed.
 *
 * A request that a newer one has superseded is rejected without a toast: its result is ignored.
 */
export const getDids = createAsyncThunk<
  GetDidsResult,
  void,
  ThunkConfig<string>
>('dids/getDids', async (_, thunkAPI) => {
  const { extra, rejectWithValue, dispatch, getState, requestId } = thunkAPI;

  // Only the latest request shows its error: the slice ignores the result of an older one
  const reject = (error: unknown) =>
    getState().dids?.listRequestId === requestId
      ? handleError(error as Error, rejectWithValue, dispatch)
      : rejectWithValue(getErrorMessage(error));

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
          timeout: DID_LIST_REQUEST_TIMEOUT_MS,
        }),
      ),
    );

    const failedMethods: DidMethodError[] = [];
    const documents: DidDocument[] = [];
    let firstError: unknown;

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        firstError ??= isTimeout(result.reason)
          ? new Error(i18next.t('Dids.list.timeout'))
          : result.reason;
        failedMethods.push({
          method: methods[index],
          message: describeMethodError(result.reason),
        });
        return;
      }
      // A 200 that is not a list is a failure of that method, not "no DIDs"
      if (!Array.isArray(result.value.data)) {
        const error = new Error(i18next.t('Dids.list.invalidDids'));
        firstError ??= error;
        failedMethods.push({ method: methods[index], message: error.message });
        return;
      }
      documents.push(...result.value.data);
    });

    if (methods.length > 0 && failedMethods.length === methods.length) {
      return reject(firstError);
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
    return reject(error);
  }
});

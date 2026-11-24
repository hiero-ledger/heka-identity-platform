import { userActions, userReducer } from './userSlice';
import { fetchDidDocuments } from '../services/fetchDidDocuments';
import { getAgencyUser } from '../services/getAgencyUser';

const initial = () => userReducer(undefined, { type: '@@INIT' });

const fetched = (method: string, requestId: string) =>
  fetchDidDocuments.fulfilled(
    { didDocuments: [{ id: `did:${method}:1` } as never] },
    requestId,
    { method },
  );

describe('userSlice DID documents', () => {
  test('keeps the DIDs of the latest network when an older answer arrives last', () => {
    // The operator picks indy, then key; the slower indy answer lands last
    let state = userReducer(
      initial(),
      fetchDidDocuments.pending('req-indy', { method: 'indy' }),
    );
    state = userReducer(
      state,
      fetchDidDocuments.pending('req-key', { method: 'key' }),
    );
    state = userReducer(state, fetched('key', 'req-key'));
    state = userReducer(state, fetched('indy', 'req-indy'));

    expect(state.data?.didDocumentsMethod).toBe('key');
    expect(state.data?.didDocuments).toEqual([{ id: 'did:key:1' }]);
  });

  test('ignores a late rejection of an older request', () => {
    let state = userReducer(
      initial(),
      fetchDidDocuments.pending('req-indy', { method: 'indy' }),
    );
    state = userReducer(
      state,
      fetchDidDocuments.pending('req-key', { method: 'key' }),
    );
    state = userReducer(state, fetched('key', 'req-key'));
    state = userReducer(
      state,
      fetchDidDocuments.rejected(new Error('boom'), 'req-indy', {
        method: 'indy',
      }),
    );

    expect(state.error).toBeUndefined();
    expect(state.data?.didDocumentsMethod).toBe('key');
  });
});

describe('userSlice revoke permission', () => {
  test('is unknown again once the session ends', () => {
    let state = userReducer(
      initial(),
      getAgencyUser.fulfilled({ canRevokeCredentials: true }, 'req'),
    );
    expect(state.data?.canRevokeCredentials).toBe(true);

    state = userReducer(state, userActions.clearSession());

    expect(state.data?.canRevokeCredentials).toBeUndefined();
  });
});

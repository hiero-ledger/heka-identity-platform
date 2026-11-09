import { ProtocolType } from '@/entities/Schema';

import { issuedCredentialsReducer } from './issuedCredentialsSlice';
import { getIssuedCredentials } from '../services/getIssuedCredentials';
import { revokeIssuedCredential } from '../services/revokeIssuedCredential';
import {
  IssuedCredential,
  IssuedCredentialsSchema,
} from '../types/issuedCredential';

const credential = (overrides: Partial<IssuedCredential> = {}): IssuedCredential => ({
  key: 'Aries:cred-1',
  id: 'cred-1',
  protocol: ProtocolType.Aries,
  name: 'Passport',
  formats: ['anoncreds'],
  issuedAt: '2026-01-01T00:00:00.000Z',
  revocable: true,
  revoked: false,
  ...overrides,
});

const initial = (): IssuedCredentialsSchema =>
  issuedCredentialsReducer(undefined, { type: 'init' });

describe('issuedCredentialsSlice', () => {
  test('starts empty', () => {
    expect(initial()).toEqual({
      isLoading: false,
      error: undefined,
      items: undefined,
      revokingRequests: {},
      listRequestId: undefined,
    });
  });

  test('stores the list of the latest request and ignores older answers', () => {
    let state = issuedCredentialsReducer(
      initial(),
      getIssuedCredentials.pending('old'),
    );
    state = issuedCredentialsReducer(state, getIssuedCredentials.pending('new'));
    expect(state.isLoading).toBe(true);

    state = issuedCredentialsReducer(
      state,
      getIssuedCredentials.fulfilled([credential({ name: 'Stale' })], 'old'),
    );
    expect(state.items).toBeUndefined();
    expect(state.isLoading).toBe(true);

    state = issuedCredentialsReducer(
      state,
      getIssuedCredentials.fulfilled([credential()], 'new'),
    );
    expect(state.isLoading).toBe(false);
    expect(state.items).toEqual([credential()]);
  });

  test('keeps the error of a failed list request and clears it on retry', () => {
    let state = issuedCredentialsReducer(
      initial(),
      getIssuedCredentials.pending('r1'),
    );
    state = issuedCredentialsReducer(
      state,
      getIssuedCredentials.rejected(null, 'r1', undefined, 'Server down'),
    );
    expect(state).toMatchObject({ isLoading: false, error: 'Server down' });

    state = issuedCredentialsReducer(state, getIssuedCredentials.pending('r2'));
    expect(state).toMatchObject({ isLoading: true, error: undefined });
  });

  test('marks the item revoked optimistically after a successful revoke', () => {
    const args = { id: 'cred-1', key: 'Aries:cred-1' };
    let state: IssuedCredentialsSchema = {
      ...initial(),
      items: [credential(), credential({ key: 'Aries:cred-2', id: 'cred-2' })],
    };

    state = issuedCredentialsReducer(
      state,
      revokeIssuedCredential.pending('r', args),
    );
    expect(state.revokingRequests).toEqual({ r: 'Aries:cred-1' });

    state = issuedCredentialsReducer(
      state,
      revokeIssuedCredential.fulfilled(
        { key: 'Aries:cred-1', alreadyRevoked: false },
        'r',
        args,
      ),
    );
    expect(state.revokingRequests).toEqual({});
    expect(state.items![0].revoked).toBe(true);
    expect(state.items![1].revoked).toBe(false);
  });

  test('leaves the item unchanged when revoking fails', () => {
    const args = { id: 'cred-1', key: 'Aries:cred-1' };
    let state: IssuedCredentialsSchema = { ...initial(), items: [credential()] };

    state = issuedCredentialsReducer(
      state,
      revokeIssuedCredential.pending('r', args),
    );
    state = issuedCredentialsReducer(
      state,
      revokeIssuedCredential.rejected(null, 'r', args, 'Forbidden'),
    );

    expect(state.revokingRequests).toEqual({});
    expect(state.items![0].revoked).toBe(false);
  });

  test('keeps each overlapping revocation in flight until its own request settles', () => {
    const first = { id: 'cred-1', key: 'Aries:cred-1' };
    const second = { id: 'cred-2', key: 'Aries:cred-2' };
    let state: IssuedCredentialsSchema = {
      ...initial(),
      items: [credential(), credential({ key: 'Aries:cred-2', id: 'cred-2' })],
    };

    state = issuedCredentialsReducer(
      state,
      revokeIssuedCredential.pending('r1', first),
    );
    state = issuedCredentialsReducer(
      state,
      revokeIssuedCredential.pending('r2', second),
    );
    expect(state.revokingRequests).toEqual({
      r1: 'Aries:cred-1',
      r2: 'Aries:cred-2',
    });

    // The first revocation finishing must not release the second one
    state = issuedCredentialsReducer(
      state,
      revokeIssuedCredential.fulfilled(
        { key: 'Aries:cred-1', alreadyRevoked: false },
        'r1',
        first,
      ),
    );
    expect(state.revokingRequests).toEqual({ r2: 'Aries:cred-2' });
    expect(state.items![0].revoked).toBe(true);
    expect(state.items![1].revoked).toBe(false);

    state = issuedCredentialsReducer(
      state,
      revokeIssuedCredential.rejected(null, 'r2', second, 'Ledger down'),
    );
    expect(state.revokingRequests).toEqual({});
    expect(state.items![1].revoked).toBe(false);
  });
});

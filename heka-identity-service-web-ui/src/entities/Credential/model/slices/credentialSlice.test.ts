import { ProtocolType } from '@/entities/Schema/model/types/schema';

import { credentialActions, credentialReducer } from './credentialSlice';
import { offerCredential } from '../services/offerCredential';
import { updateCredentialState } from '../services/updateCredentialState';
import { OpenIdIssuanceState } from '../types/credential';

const initial = () => credentialReducer(undefined, { type: '@@INIT' });

const offered = (id: string, requestId: string) =>
  offerCredential.fulfilled(
    { id, state: OpenIdIssuanceState.OfferCreated },
    requestId,
    {} as never,
  );

const withOffer = (id: string) =>
  credentialReducer(
    credentialReducer(initial(), offerCredential.pending('req-1', {} as never)),
    offered(id, 'req-1'),
  );

const polled = (id: string) =>
  updateCredentialState.fulfilled(
    { state: OpenIdIssuanceState.Completed },
    'poll-1',
    { id, protocolType: ProtocolType.Oid4vc },
  );

describe('credentialSlice state updates', () => {
  test('applies a poll answer for the current offer', () => {
    const state = credentialReducer(withOffer('offer-B'), polled('offer-B'));

    expect(state.issuanceSession?.state).toBe(OpenIdIssuanceState.Completed);
  });

  test('ignores a late poll answer for a replaced offer', () => {
    // A poll for offer A resolves after the operator has issued offer B
    const state = credentialReducer(withOffer('offer-B'), polled('offer-A'));

    expect(state.issuanceSession).toEqual({
      id: 'offer-B',
      state: OpenIdIssuanceState.OfferCreated,
    });
  });

  test('ignores a poll answer when no offer is active', () => {
    const state = credentialReducer(initial(), polled('offer-A'));

    expect(state.issuanceSession).toBeUndefined();
  });
});

describe('credentialSlice offer responses', () => {
  test('ignores an offer answer that arrives after the flow was reset', () => {
    // An offer over an existing connection is in flight when the operator switches to the QR code
    let state = credentialReducer(
      initial(),
      offerCredential.pending('req-1', {} as never),
    );
    state = credentialReducer(state, credentialActions.reset());
    state = credentialReducer(state, offered('offer-A', 'req-1'));

    expect(state.issuanceSession).toBeUndefined();
    expect(state.isLoading).toBe(false);
  });

  test('ignores the answer to an older offer once a newer one is sent', () => {
    let state = credentialReducer(
      initial(),
      offerCredential.pending('req-1', {} as never),
    );
    state = credentialReducer(
      state,
      offerCredential.pending('req-2', {} as never),
    );
    state = credentialReducer(state, offered('offer-A', 'req-1'));
    expect(state.issuanceSession).toBeUndefined();
    expect(state.isLoading).toBe(true);

    state = credentialReducer(state, offered('offer-B', 'req-2'));
    expect(state.issuanceSession?.id).toBe('offer-B');
  });

  test('ignores a late rejection of a reset offer', () => {
    let state = credentialReducer(
      initial(),
      offerCredential.pending('req-1', {} as never),
    );
    state = credentialReducer(state, credentialActions.reset());
    state = credentialReducer(
      state,
      offerCredential.rejected(new Error('boom'), 'req-1', {} as never),
    );

    expect(state.error).toBeUndefined();
  });
});

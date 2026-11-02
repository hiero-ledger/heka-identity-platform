import { ProtocolType } from '@/entities/Schema/model/types/schema';

import { presentationActions, presentationReducer } from './presentationSlice';
import { requestPresentation } from '../services/requestPresentation';
import { updatePresentationState } from '../services/updatePresentationState';
import { OpenIdPresentationState } from '../types/presentation';

const initial = () => presentationReducer(undefined, { type: '@@INIT' });

const requested = (id: string, requestId: string) =>
  requestPresentation.fulfilled(
    { id, state: OpenIdPresentationState.RequestCreated },
    requestId,
    {} as never,
  );

const withRequest = (id: string) =>
  presentationReducer(
    presentationReducer(
      initial(),
      requestPresentation.pending('req-1', {} as never),
    ),
    requested(id, 'req-1'),
  );

const polled = (id: string) =>
  updatePresentationState.fulfilled(
    {
      state: OpenIdPresentationState.ResponseVerified,
      sharedAttributes: [{ name: 'age', value: '42' }],
    },
    'poll-1',
    { id, protocolType: ProtocolType.Oid4vc },
  );

describe('presentationSlice state updates', () => {
  test('applies a poll answer for the current request', () => {
    const state = presentationReducer(withRequest('pres-B'), polled('pres-B'));

    expect(state.presentationSession).toMatchObject({
      id: 'pres-B',
      state: OpenIdPresentationState.ResponseVerified,
      sharedAttributes: [{ name: 'age', value: '42' }],
    });
  });

  test('ignores a late poll answer for a replaced request', () => {
    // A poll for request A resolves after the operator has started request B
    const state = presentationReducer(withRequest('pres-B'), polled('pres-A'));

    expect(state.presentationSession).toEqual({
      id: 'pres-B',
      state: OpenIdPresentationState.RequestCreated,
    });
  });

  test('ignores a poll answer when no request is active', () => {
    const state = presentationReducer(initial(), polled('pres-A'));

    expect(state.presentationSession).toBeUndefined();
  });
});

describe('presentationSlice request responses', () => {
  test('ignores a request answer that arrives after the flow was reset', () => {
    let state = presentationReducer(
      initial(),
      requestPresentation.pending('req-1', {} as never),
    );
    state = presentationReducer(state, presentationActions.reset());
    state = presentationReducer(state, requested('pres-A', 'req-1'));

    expect(state.presentationSession).toBeUndefined();
    expect(state.isLoading).toBe(false);
  });

  test('ignores the answer to an older request once a newer one is sent', () => {
    let state = presentationReducer(
      initial(),
      requestPresentation.pending('req-1', {} as never),
    );
    state = presentationReducer(
      state,
      requestPresentation.pending('req-2', {} as never),
    );
    state = presentationReducer(state, requested('pres-A', 'req-1'));
    expect(state.presentationSession).toBeUndefined();

    state = presentationReducer(state, requested('pres-B', 'req-2'));
    expect(state.presentationSession?.id).toBe('pres-B');
  });
});

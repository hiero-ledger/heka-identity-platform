import {
  verificationTemplatesActions,
  verificationTemplatesReducer,
} from './verificationTemplatesSlice';
import { createVerificationTemplate } from '../services/createVerificationTemplate';
import { deleteVerificationTemplate } from '../services/deleteVerificationTemplate';
import { VerificationTemplate } from '../types/verificationTemplate';

const initial = () =>
  verificationTemplatesReducer(undefined, { type: '@@INIT' });

describe('verificationTemplatesSlice', () => {
  test('holds only the mutation state (the templates are cached reads)', () => {
    expect(initial()).toEqual({ isMutating: false, mutationError: undefined });
  });

  test('a delete in flight is tracked as a mutation', () => {
    const state = verificationTemplatesReducer(
      initial(),
      deleteVerificationTemplate.pending('req-1', { templateId: 't1' }),
    );

    expect(state.isMutating).toBe(true);
    expect(state.mutationError).toBeUndefined();
  });

  test('a failed delete stores the server message, not "Rejected"', () => {
    // What `rejectWithValue(message)` dispatches: RTK sets `error.message` to "Rejected"
    const action = deleteVerificationTemplate.rejected(
      null,
      'req-1',
      { templateId: 't1' },
      'Template is in use',
    );
    expect(action.error.message).toBe('Rejected');

    const state = verificationTemplatesReducer(
      verificationTemplatesReducer(
        initial(),
        deleteVerificationTemplate.pending('req-1', { templateId: 't1' }),
      ),
      action,
    );

    expect(state).toEqual({
      isMutating: false,
      mutationError: 'Template is in use',
    });
  });

  test('a thrown error without a reject value falls back to its message', () => {
    const state = verificationTemplatesReducer(
      initial(),
      createVerificationTemplate.rejected(
        new Error('Network down'),
        'req-1',
        {} as Parameters<typeof createVerificationTemplate>[0],
      ),
    );

    expect(state.mutationError).toBe('Network down');
  });

  test('a finished create or delete ends the mutation', () => {
    let state = verificationTemplatesReducer(
      initial(),
      createVerificationTemplate.pending(
        'req-1',
        {} as Parameters<typeof createVerificationTemplate>[0],
      ),
    );
    state = verificationTemplatesReducer(
      state,
      createVerificationTemplate.fulfilled(
        { id: 't1' } as VerificationTemplate,
        'req-1',
        {} as Parameters<typeof createVerificationTemplate>[0],
      ),
    );
    expect(state.isMutating).toBe(false);

    state = verificationTemplatesReducer(
      state,
      deleteVerificationTemplate.fulfilled({ templateId: 't1' }, 'req-2', {
        templateId: 't1',
      }),
    );
    expect(state.isMutating).toBe(false);
  });

  test('reset clears a mutation error', () => {
    const state = verificationTemplatesReducer(
      { isMutating: true, mutationError: 'x' },
      verificationTemplatesActions.reset(),
    );

    expect(state).toEqual({ isMutating: false, mutationError: undefined });
  });
});

import { verificationTemplatesReducer } from './verificationTemplatesSlice';
import { deleteVerificationTemplate } from '../services/deleteVerificationTemplate';
import { getVerificationTemplate } from '../services/getVerificationTemplate';
import { getVerificationTemplateList } from '../services/getVerificationTemplateList';
import { VerificationTemplate } from '../types/verificationTemplate';

const initial = () =>
  verificationTemplatesReducer(undefined, { type: '@@INIT' });

describe('verificationTemplatesSlice', () => {
  test('a rejected request stores the server message, not "Rejected"', () => {
    // What `rejectWithValue(message)` dispatches: RTK sets `error.message` to "Rejected"
    const action = getVerificationTemplateList.rejected(
      null,
      'req-1',
      undefined,
      'Template service is unavailable',
    );
    expect(action.error.message).toBe('Rejected');

    const state = verificationTemplatesReducer(initial(), action);

    expect(state.error).toBe('Template service is unavailable');
    expect(state.isLoading).toBe(false);
  });

  test('a thrown error without a reject value falls back to its message', () => {
    const state = verificationTemplatesReducer(
      initial(),
      getVerificationTemplateList.rejected(
        new Error('Network down'),
        'req-1',
        undefined,
      ),
    );

    expect(state.error).toBe('Network down');
  });
});

describe('verificationTemplatesSlice mutations', () => {
  const template = (id: string) => ({ id, name: id }) as VerificationTemplate;
  const loaded = () =>
    verificationTemplatesReducer(
      initial(),
      getVerificationTemplateList.fulfilled(
        [template('t1'), template('t2')],
        'req-0',
        undefined,
      ),
    );

  test('a delete in flight keeps the list visible', () => {
    const state = verificationTemplatesReducer(
      loaded(),
      deleteVerificationTemplate.pending('req-1', { templateId: 't1' }),
    );

    expect(state.isMutating).toBe(true);
    expect(state.isLoading).toBe(false);
    expect(state.verificationTemplates).toHaveLength(2);
  });

  test('a failed delete leaves the list and its error untouched', () => {
    let state = verificationTemplatesReducer(
      loaded(),
      deleteVerificationTemplate.pending('req-1', { templateId: 't1' }),
    );
    state = verificationTemplatesReducer(
      state,
      deleteVerificationTemplate.rejected(
        null,
        'req-1',
        { templateId: 't1' },
        'Template is in use',
      ),
    );

    expect(state.isMutating).toBe(false);
    expect(state.mutationError).toBe('Template is in use');
    expect(state.error).toBeUndefined();
    expect(state.verificationTemplates).toHaveLength(2);
  });

  test('deleting the open template clears it', () => {
    let state = verificationTemplatesReducer(
      loaded(),
      getVerificationTemplate.fulfilled(template('t1'), 'req-1', { id: 't1' }),
    );
    state = verificationTemplatesReducer(
      state,
      deleteVerificationTemplate.fulfilled({ templateId: 't1' }, 'req-2', {
        templateId: 't1',
      }),
    );

    expect(state.verificationTemplates?.map((t) => t.id)).toEqual(['t2']);
    expect(state.verificationTemplate).toBeUndefined();
  });
});

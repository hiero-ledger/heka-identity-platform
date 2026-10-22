import { schemasReducer } from './schemasSlice';
import { getSchemaList } from '../services/getSchemaList';
import { Schema } from '../types/schema';

const initial = () => schemasReducer(undefined, { type: '@@INIT' });

const schema = (id: string) => ({ id, name: id }) as Schema;

describe('schemasSlice schema list', () => {
  test('keeps the list of the latest filter when an older answer arrives last', () => {
    // Active, then Hidden: the slow Active answer lands after the Hidden one
    let state = schemasReducer(
      initial(),
      getSchemaList.pending('req-active', { isHidden: false }),
    );
    state = schemasReducer(
      state,
      getSchemaList.pending('req-hidden', { isHidden: true }),
    );
    state = schemasReducer(
      state,
      getSchemaList.fulfilled([schema('hidden')], 'req-hidden', {
        isHidden: true,
      }),
    );
    state = schemasReducer(
      state,
      getSchemaList.fulfilled([schema('active')], 'req-active', {
        isHidden: false,
      }),
    );

    expect(state.schemas).toEqual([schema('hidden')]);
    expect(state.isLoading).toBe(false);
  });

  test('stays loading until the latest request answers', () => {
    let state = schemasReducer(
      initial(),
      getSchemaList.pending('req-1', { isHidden: false }),
    );
    state = schemasReducer(
      state,
      getSchemaList.pending('req-2', { isHidden: true }),
    );
    state = schemasReducer(
      state,
      getSchemaList.fulfilled([schema('old')], 'req-1', { isHidden: false }),
    );

    expect(state.schemas).toBeUndefined();
    expect(state.isLoading).toBe(true);
  });
});

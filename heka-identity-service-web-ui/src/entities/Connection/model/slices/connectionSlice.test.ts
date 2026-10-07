import { connectionActions, connectionReducer } from './connectionSlice';
import { createConnection } from '../services/createConnection';
import { fetchConnections } from '../services/fetchConnections';
import { updateConnectionState } from '../services/updateConnectionState';
import { ConnectionSchema, ConnectionState } from '../types/connection';

const initial = (): ConnectionSchema =>
  connectionReducer(undefined, { type: '@@INIT' });

const invitation = {
  oobId: 'oob-1',
  invitationUrl: 'https://agent/?oob=abc',
  state: ConnectionState.Start,
};

describe('connectionSlice', () => {
  test('selectExistingConnection produces a completed session', () => {
    const state = connectionReducer(
      initial(),
      connectionActions.selectExistingConnection('conn-1'),
    );

    expect(state.connectionSession).toEqual({
      oobId: '',
      connectionId: 'conn-1',
      invitationUrl: '',
      state: ConnectionState.Completed,
      isExisting: true,
    });
  });

  test('a late invitation response does not replace a chosen connection', () => {
    let state = connectionReducer(
      initial(),
      createConnection.pending('req-1', {}),
    );
    state = connectionReducer(
      state,
      connectionActions.selectExistingConnection('conn-1'),
    );
    state = connectionReducer(
      state,
      createConnection.fulfilled(invitation, 'req-1', {}),
    );

    expect(state.connectionSession?.connectionId).toBe('conn-1');
    expect(state.connectionSession?.isExisting).toBe(true);
  });

  test('a new invitation replaces a session completed by a QR scan', () => {
    let state = connectionReducer(
      initial(),
      createConnection.fulfilled(
        {
          ...invitation,
          connectionId: 'conn-old',
          state: ConnectionState.Completed,
        },
        'req-1',
        {},
      ),
    );
    state = connectionReducer(state, createConnection.pending('req-2', {}));
    expect(state.connectionSession).toBeUndefined();

    state = connectionReducer(
      state,
      createConnection.fulfilled(
        { ...invitation, oobId: 'oob-2' },
        'req-2',
        {},
      ),
    );
    expect(state.connectionSession?.oobId).toBe('oob-2');
    expect(state.connectionSession?.state).toBe(ConnectionState.Start);
  });

  test('a renamed invitation replaces the previous one', () => {
    let state = connectionReducer(
      initial(),
      createConnection.fulfilled(invitation, 'req-1', {}),
    );
    state = connectionReducer(
      state,
      createConnection.fulfilled({ ...invitation, oobId: 'oob-2' }, 'req-2', {
        alias: 'Alice',
      }),
    );

    expect(state.connectionSession?.oobId).toBe('oob-2');
  });

  test('ignores polling results for a replaced invitation', () => {
    let state = connectionReducer(
      initial(),
      createConnection.fulfilled({ ...invitation, oobId: 'oob-2' }, 'req', {}),
    );
    state = connectionReducer(
      state,
      updateConnectionState.fulfilled(
        { connectionId: 'conn-old', state: ConnectionState.Completed },
        'req',
        { id: 'oob-1' },
      ),
    );

    expect(state.connectionSession?.state).toBe(ConnectionState.Start);
    expect(state.connectionSession?.connectionId).toBeUndefined();
  });

  test('applies polling results for the current invitation', () => {
    let state = connectionReducer(
      initial(),
      createConnection.fulfilled(invitation, 'req', {}),
    );
    state = connectionReducer(
      state,
      updateConnectionState.fulfilled(
        { connectionId: 'conn-1', state: ConnectionState.Completed },
        'req',
        { id: 'oob-1' },
      ),
    );

    expect(state.connectionSession?.connectionId).toBe('conn-1');
    expect(state.connectionSession?.state).toBe(ConnectionState.Completed);
  });

  test('stores the connection list and reset clears it', () => {
    const connections = [
      {
        id: 'conn-1',
        state: ConnectionState.Completed,
        role: 'responder',
        createdAt: '2026-10-02T10:00:00Z',
      },
    ];
    let state = connectionReducer(
      initial(),
      fetchConnections.fulfilled(connections, 'req', {}),
    );
    expect(state.connections).toEqual(connections);

    state = connectionReducer(state, connectionActions.reset());
    expect(state.connections).toEqual([]);
    expect(state.connectionSession).toBeUndefined();
  });
});

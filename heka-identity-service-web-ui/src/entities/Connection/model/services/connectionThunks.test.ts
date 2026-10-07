/* eslint-disable @typescript-eslint/no-explicit-any */
import { AxiosInstance } from 'axios';

import { agencyEndpoints } from '@/shared/api/config/endpoints';

import { createConnection } from './createConnection';
import { fetchConnections } from './fetchConnections';
import { updateConnectionState } from './updateConnectionState';
import { ConnectionState } from '../types/connection';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn() },
}));

const makeApi = (data: unknown): AxiosInstance =>
  ({
    get: jest.fn().mockResolvedValue({ data }),
    post: jest.fn().mockResolvedValue({ data }),
  }) as unknown as AxiosInstance;

const runThunk = async (
  thunk: any,
  agencyApi: AxiosInstance,
  agencyDemoApi: AxiosInstance = makeApi(undefined),
) => {
  const dispatch = jest.fn();
  return thunk(dispatch, () => ({}), { agencyApi, agencyDemoApi });
};

describe('fetchConnections', () => {
  const records = [
    { id: 'old', state: 'completed', createdAt: '2026-09-01T10:00:00Z' },
    {
      id: 'pending',
      state: 'request-received',
      createdAt: '2026-10-01T10:00:00Z',
    },
    { id: 'new', state: 'completed', createdAt: '2026-10-02T10:00:00Z' },
  ];

  test('keeps completed connections only, newest first', async () => {
    const api = makeApi(records);

    const action = await runThunk(fetchConnections({}), api);

    expect(api.get).toHaveBeenCalledWith(agencyEndpoints.getConnections);
    expect(action.payload.map((c: { id: string }) => c.id)).toEqual([
      'new',
      'old',
    ]);
  });

  test('reads from the demo tenant when useDemo is set', async () => {
    const api = makeApi([]);
    const demoApi = makeApi(records);

    const action = await runThunk(
      fetchConnections({ useDemo: true }),
      api,
      demoApi,
    );

    expect(api.get).not.toHaveBeenCalled();
    expect(demoApi.get).toHaveBeenCalled();
    expect(action.payload).toHaveLength(2);
  });

  test('rejects with the server message on failure', async () => {
    const api = {
      get: jest
        .fn()
        .mockRejectedValue({ response: { data: { message: 'boom' } } }),
    } as unknown as AxiosInstance;

    const action = await runThunk(fetchConnections({}), api);

    expect(action.type).toBe('connections/list/rejected');
    expect(action.payload).toBe('boom');
  });
});

describe('createConnection', () => {
  const response = { id: 'oob-1', invitationUrl: 'https://agent/?oob=abc' };

  test('creates a single-use invitation without alias by default', async () => {
    const api = makeApi(response);

    const action = await runThunk(createConnection({}), api);

    expect(api.post).toHaveBeenCalledWith(agencyEndpoints.createConnection, {
      multiUseInvitation: false,
    });
    expect(action.payload).toEqual({
      oobId: 'oob-1',
      invitationUrl: response.invitationUrl,
      state: ConnectionState.Start,
    });
  });

  test('sends a trimmed alias and omits a blank one', async () => {
    const api = makeApi(response);

    await runThunk(createConnection({ alias: '  Alice Smith ' }), api);
    await runThunk(createConnection({ alias: '   ' }), api);

    expect((api.post as jest.Mock).mock.calls[0][1]).toEqual({
      multiUseInvitation: false,
      alias: 'Alice Smith',
    });
    expect((api.post as jest.Mock).mock.calls[1][1]).toEqual({
      multiUseInvitation: false,
    });
  });

  test('uses the demo tenant when useDemo is set', async () => {
    const api = makeApi(response);
    const demoApi = makeApi(response);

    await runThunk(createConnection({ useDemo: true }), api, demoApi);

    expect(api.post).not.toHaveBeenCalled();
    expect(demoApi.post).toHaveBeenCalled();
  });
});

describe('updateConnectionState', () => {
  test('uses the demo tenant when useDemo is set', async () => {
    const api = makeApi(null);
    const demoApi = makeApi({ id: 'conn-1', state: 'completed' });

    const action = await runThunk(
      updateConnectionState({ id: 'oob-1', useDemo: true }),
      api,
      demoApi,
    );

    expect(api.get).not.toHaveBeenCalled();
    expect(demoApi.get).toHaveBeenCalledWith(
      agencyEndpoints.getConnectionState('oob-1'),
    );
    expect(action.payload).toEqual({
      connectionId: 'conn-1',
      state: ConnectionState.Completed,
    });
  });

  test('reports start while no connection exists yet', async () => {
    const action = await runThunk(
      updateConnectionState({ id: 'oob-1' }),
      makeApi(null),
    );

    expect(action.payload).toEqual({
      connectionId: undefined,
      state: ConnectionState.Start,
    });
  });
});

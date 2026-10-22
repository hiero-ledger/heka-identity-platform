import { agencyEndpoints } from '@/shared/api/config/endpoints';
import {
  createMockApi,
  createTestStore,
  MockApi,
} from '@/shared/lib/tests/renderWithProviders';

import { createConnection } from './createConnection';
import { fetchConnections } from './fetchConnections';
import { updateConnectionState } from './updateConnectionState';
import { ConnectionRecord, ConnectionState } from '../types/connection';

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn() },
}));

const makeApi = (data: unknown): MockApi => {
  const api = createMockApi();
  api.get.mockResolvedValue({ data });
  api.post.mockResolvedValue({ data });
  return api;
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

    const action = await createTestStore({}, api).dispatch(
      fetchConnections({}),
    );

    expect(api.get).toHaveBeenCalledWith(agencyEndpoints.getConnections);
    expect((action.payload as ConnectionRecord[]).map((c) => c.id)).toEqual([
      'new',
      'old',
    ]);
  });

  test('reads from the demo tenant when useDemo is set', async () => {
    const api = makeApi([]);
    const demoApi = makeApi(records);

    const action = await createTestStore({}, api, demoApi).dispatch(
      fetchConnections({ useDemo: true }),
    );

    expect(api.get).not.toHaveBeenCalled();
    expect(demoApi.get).toHaveBeenCalled();
    expect(action.payload).toHaveLength(2);
  });

  test('rejects with the server message on failure', async () => {
    const api = createMockApi();
    api.get.mockRejectedValue({ response: { data: { message: 'boom' } } });

    const action = await createTestStore({}, api).dispatch(
      fetchConnections({}),
    );

    expect(action.type).toBe('connections/list/rejected');
    expect(action.payload).toBe('boom');
  });
});

describe('createConnection', () => {
  const response = { id: 'oob-1', invitationUrl: 'https://agent/?oob=abc' };

  test('creates a single-use invitation without alias by default', async () => {
    const api = makeApi(response);

    const action = await createTestStore({}, api).dispatch(
      createConnection({}),
    );

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

    const store = createTestStore({}, api);

    await store.dispatch(createConnection({ alias: '  Alice Smith ' }));
    await store.dispatch(createConnection({ alias: '   ' }));

    expect(api.post.mock.calls[0][1]).toEqual({
      multiUseInvitation: false,
      alias: 'Alice Smith',
    });
    expect(api.post.mock.calls[1][1]).toEqual({
      multiUseInvitation: false,
    });
  });

  test('uses the demo tenant when useDemo is set', async () => {
    const api = makeApi(response);
    const demoApi = makeApi(response);

    await createTestStore({}, api, demoApi).dispatch(
      createConnection({ useDemo: true }),
    );

    expect(api.post).not.toHaveBeenCalled();
    expect(demoApi.post).toHaveBeenCalled();
  });
});

describe('updateConnectionState', () => {
  test('uses the demo tenant when useDemo is set', async () => {
    const api = makeApi(null);
    const demoApi = makeApi({ id: 'conn-1', state: 'completed' });

    const action = await createTestStore({}, api, demoApi).dispatch(
      updateConnectionState({ id: 'oob-1', useDemo: true }),
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
    const action = await createTestStore({}, makeApi(null)).dispatch(
      updateConnectionState({ id: 'oob-1' }),
    );

    expect(action.payload).toEqual({
      connectionId: undefined,
      state: ConnectionState.Start,
    });
  });
});

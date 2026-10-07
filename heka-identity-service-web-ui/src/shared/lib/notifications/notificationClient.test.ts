import * as sessionBridge from '@/shared/auth/sessionBridge';

import {
  BEARER_PROTOCOL,
  connect,
  disconnect,
  getNotificationsUrl,
  getStatus,
  subscribe,
  TOKEN_EXPIRED_CLOSE_CODE,
  UNAUTHORIZED_CLOSE_CODE,
} from './notificationClient';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  close = jest.fn();

  constructor(
    public url: string,
    public protocols: string[],
  ) {
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.onopen?.();
  }

  message(data: unknown) {
    this.onmessage?.({
      data: typeof data === 'string' ? data : JSON.stringify(data),
    });
  }

  serverClose(code: number) {
    this.onclose?.({ code });
  }
}

const latestSocket = () =>
  FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

// Lets the awaited session renewal in the close handler settle
const flushPromises = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

describe('notificationClient', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    FakeWebSocket.instances = [];
    (global as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket;
    jest
      .spyOn(sessionBridge, 'getSessionAccessToken')
      .mockReturnValue('token-1');
    jest
      .spyOn(sessionBridge, 'refreshSessionToken')
      .mockResolvedValue('token-2');
  });

  afterEach(() => {
    disconnect();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('builds the socket URL from the API origin', () => {
    expect(getNotificationsUrl('http://localhost:3000')).toBe(
      'ws://localhost:3000/notifications',
    );
    expect(getNotificationsUrl('https://api.example.com/v1/')).toBe(
      'wss://api.example.com/notifications',
    );
  });

  test('sends the token as the second subprotocol and reports status', () => {
    connect();

    expect(latestSocket().protocols).toEqual([BEARER_PROTOCOL, 'token-1']);
    expect(getStatus()).toBe('connecting');

    latestSocket().open();
    expect(getStatus()).toBe('open');
  });

  test('does not open a socket without a session', () => {
    jest.spyOn(sessionBridge, 'getSessionAccessToken').mockReturnValue(null);

    connect();

    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(getStatus()).toBe('closed');
  });

  test('delivers parsed messages and ignores malformed ones', () => {
    const listener = jest.fn();
    const unsubscribe = subscribe(listener);
    connect();
    latestSocket().open();

    latestSocket().message({ type: 'DidCommProofStateChanged', id: 'p-1' });
    latestSocket().message('not json');
    latestSocket().message({ id: 'missing-type' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      type: 'DidCommProofStateChanged',
      id: 'p-1',
    });
    unsubscribe();
  });

  test('reconnects with growing backoff after a network drop', () => {
    connect();
    latestSocket().open();

    latestSocket().serverClose(1006);
    expect(getStatus()).toBe('closed');
    jest.advanceTimersByTime(999);
    expect(FakeWebSocket.instances).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(2);

    latestSocket().serverClose(1006);
    jest.advanceTimersByTime(1999);
    expect(FakeWebSocket.instances).toHaveLength(2);
    jest.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(3);
  });

  test('renews the session before reconnecting after token expiry', async () => {
    connect();
    latestSocket().open();
    jest
      .spyOn(sessionBridge, 'getSessionAccessToken')
      .mockReturnValue('token-2');

    latestSocket().serverClose(TOKEN_EXPIRED_CLOSE_CODE);
    await flushPromises();
    jest.advanceTimersByTime(0);

    expect(sessionBridge.refreshSessionToken).toHaveBeenCalled();
    expect(latestSocket().protocols).toEqual([BEARER_PROTOCOL, 'token-2']);
  });

  test('stops when the session cannot be renewed', async () => {
    jest.spyOn(sessionBridge, 'refreshSessionToken').mockResolvedValue(null);
    connect();

    latestSocket().serverClose(UNAUTHORIZED_CLOSE_CODE);
    await flushPromises();
    jest.advanceTimersByTime(60_000);

    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  test('disconnect closes the socket and stops reconnecting', () => {
    connect();
    const socket = latestSocket();
    socket.open();

    disconnect();
    socket.serverClose(1000);
    jest.advanceTimersByTime(60_000);

    expect(socket.close).toHaveBeenCalledWith(1000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(getStatus()).toBe('closed');
  });
});

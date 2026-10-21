import {
  getSessionAccessToken,
  renewSessionToken,
} from '@/shared/auth/sessionBridge';

import {
  isNotificationMessage,
  NotificationMessage,
  NotificationStatus,
} from './types';

/** Must match WEBSOCKET_BEARER_PROTOCOL in the identity service. */
export const BEARER_PROTOCOL = 'heka.bearer';
export const UNAUTHORIZED_CLOSE_CODE = 3000;
export const TOKEN_EXPIRED_CLOSE_CODE = 4001;

const INITIAL_RETRY_MS = 1000;
const MAX_RETRY_MS = 30_000;

type MessageListener = (message: NotificationMessage) => void;
type StatusListener = (status: NotificationStatus) => void;

const messageListeners = new Set<MessageListener>();
const statusListeners = new Set<StatusListener>();

let socket: WebSocket | null = null;
let status: NotificationStatus = 'closed';
let shouldConnect = false;
let retryAttempt = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
// Set after a 3000 close; a second 3000 before the socket opens means a renewed token won't help
let unauthorizedRetried = false;

/** The gateway listens on the API server's root, independent of any REST path prefix. */
export const getNotificationsUrl = (
  agencyEndpoint: string = process.env.REACT_APP_AGENCY_ENDPOINT ?? '',
): string => {
  const url = new URL(
    '/notifications',
    agencyEndpoint || window.location.origin,
  );
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
};

const setStatus = (next: NotificationStatus) => {
  if (status === next) return;
  status = next;
  statusListeners.forEach((listener) => listener(next));
};

const nextRetryDelay = () => {
  const delay = Math.min(INITIAL_RETRY_MS * 2 ** retryAttempt, MAX_RETRY_MS);
  retryAttempt += 1;
  return delay;
};

const scheduleReconnect = (delayMs: number) => {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(open, delayMs);
};

const onClose = async (event: CloseEvent, socketToken: string) => {
  socket = null;
  setStatus('closed');
  if (!shouldConnect) return;

  if (event.code === UNAUTHORIZED_CLOSE_CODE) {
    // The server also rejected the renewed token (e.g. no Heka role): stop, retrying won't fix it
    if (unauthorizedRetried) return;
    unauthorizedRetried = true;
  }

  if (
    event.code === TOKEN_EXPIRED_CLOSE_CODE ||
    event.code === UNAUTHORIZED_CLOSE_CODE
  ) {
    // The server rejected or retired our token; only a renewed session can reconnect
    // Shares the renewal with the API layer; a token already renewed in the background is reused
    const token = await renewSessionToken(socketToken).catch(() => null);
    if (!token || !shouldConnect) return;
    scheduleReconnect(
      event.code === TOKEN_EXPIRED_CLOSE_CODE ? 0 : nextRetryDelay(),
    );
    return;
  }

  scheduleReconnect(nextRetryDelay());
};

const onMessage = (event: MessageEvent) => {
  let data: unknown;
  try {
    data = JSON.parse(String(event.data));
  } catch {
    return;
  }
  if (!isNotificationMessage(data)) return;
  messageListeners.forEach((listener) => listener(data));
};

function open() {
  if (!shouldConnect || socket) return;

  const token = getSessionAccessToken();
  if (!token) {
    setStatus('closed');
    return;
  }

  setStatus('connecting');
  const ws = new WebSocket(getNotificationsUrl(), [BEARER_PROTOCOL, token]);
  socket = ws;

  ws.onopen = () => {
    retryAttempt = 0;
    unauthorizedRetried = false;
    setStatus('open');
  };
  ws.onmessage = onMessage;
  ws.onclose = (event) => {
    // A socket replaced by disconnect/connect must not touch the new one
    if (socket === ws) void onClose(event, token);
  };
}

/** Opens the shared socket for the signed-in session; safe to call more than once. */
export const connect = () => {
  shouldConnect = true;
  unauthorizedRetried = false;
  open();
};

export const disconnect = () => {
  shouldConnect = false;
  clearTimeout(retryTimer);
  retryAttempt = 0;
  const ws = socket;
  socket = null;
  ws?.close(1000);
  setStatus('closed');
};

export const subscribe = (listener: MessageListener) => {
  messageListeners.add(listener);
  return () => {
    messageListeners.delete(listener);
  };
};

export const onStatusChange = (listener: StatusListener) => {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
};

export const getStatus = (): NotificationStatus => status;

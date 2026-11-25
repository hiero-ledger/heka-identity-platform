import {
  ExtensionMessage,
  PageMessage,
  pingMessage,
  presentRequestMessage,
  readExtensionMessage,
  receiveOfferMessage,
  WebWalletInfo,
  WebWalletResponse,
  WebWalletStatus,
} from './protocol';

const post = (message: PageMessage) =>
  window.postMessage(message, window.location.origin);

const listen = (handler: (message: ExtensionMessage) => void) => {
  const onMessage = (event: MessageEvent) => {
    const message = readExtensionMessage(event);
    if (message) handler(message);
  };
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
};

/**
 * Resolves with the extension's versions once its content script answers, or with null after
 * `timeoutMs` (or when `signal` aborts). The content script answers a PING, and announces itself
 * with EXTENSION_READY when it loads after the page has already pinged.
 */
export const detectWebWallet = (
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<WebWalletInfo | null> =>
  new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(null);
      return;
    }
    const finish = (info: WebWalletInfo | null) => {
      clearTimeout(timer);
      unlisten();
      signal?.removeEventListener('abort', onAbort);
      resolve(info);
    };
    const onAbort = () => finish(null);
    const timer = setTimeout(onAbort, timeoutMs);
    const unlisten = listen((message) => {
      if (
        message.type === 'EXTENSION_READY' ||
        message.type === 'PING_RESPONSE'
      ) {
        finish(message.info);
      }
    });
    signal?.addEventListener('abort', onAbort);
    post(pingMessage());
  });

/**
 * Calls `callback` whenever the content script announces itself, also after `detectWebWallet` gave
 * up: the wallet injects it into an open tab when the holder connects the site. Returns the
 * unsubscribe function.
 */
export const onExtensionReady = (callback: (info: WebWalletInfo) => void) =>
  listen((message) => {
    if (message.type === 'EXTENSION_READY') callback(message.info);
  });

const RESPONSE_TYPES = {
  RECEIVE_OFFER: 'RECEIVE_OFFER_RESPONSE',
  PRESENT_REQUEST: 'PRESENT_REQUEST_RESPONSE',
} as const;

/**
 * Calls `callback` once, with the extension's next answer to a `requestType` message; returns the
 * cancel function. An answer doesn't name its item, so each caller keeps one send in flight.
 */
export const onNextResponse = (
  requestType: keyof typeof RESPONSE_TYPES,
  callback: (response: WebWalletResponse) => void,
) => {
  const unlisten = listen((message) => {
    if (message.type === RESPONSE_TYPES[requestType]) {
      unlisten();
      callback(message.response);
    }
  });
  return unlisten;
};

/** Hands an `openid-credential-offer:` URI to the wallet, which asks the holder before redeeming it */
export const sendOffer = (offerUri: string, expiresAt?: string) =>
  post(receiveOfferMessage(offerUri, expiresAt));

/** Hands an `openid4vp:` request URI to the wallet, which asks the holder before presenting */
export const sendPresentationRequest = (requestUri: string) =>
  post(presentRequestMessage(requestUri));

/** Calls `callback` with the wallet's statuses of `offerUri`; returns the unsubscribe function */
export const onReceiveStatus = (
  offerUri: string,
  callback: (status: WebWalletStatus) => void,
) =>
  listen((message) => {
    if (message.type === 'RECEIVE_STATUS' && message.offerUri === offerUri) {
      callback(message.status);
    }
  });

/** Calls `callback` with the wallet's statuses of `requestUri`; returns the unsubscribe function */
export const onPresentStatus = (
  requestUri: string,
  callback: (status: WebWalletStatus) => void,
) =>
  listen((message) => {
    if (
      message.type === 'PRESENT_STATUS' &&
      message.requestUri === requestUri
    ) {
      callback(message.status);
    }
  });

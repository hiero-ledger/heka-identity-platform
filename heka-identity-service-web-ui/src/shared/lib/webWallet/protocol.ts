/**
 * Bridge protocol v1 between Heka pages and the Heka Web Wallet's content script, specified in
 * `heka-web-wallet/docs/bridge-protocol.md`. The wallet keeps its own copy of these literals on
 * purpose, and each side's tests check its copy against the examples in that document.
 */

export const BRIDGE_PROTOCOL_VERSION = 1;

/** `source` of the messages a page posts to the extension */
export const PAGE_SOURCE = 'heka-web-wallet-bridge';
/** `source` of the messages the extension's content script posts to the page */
export const EXTENSION_SOURCE = 'heka-extension-bridge';

const MAX_URI_LENGTH = 4096;

export const isCredentialOfferUri = (value: string) =>
  value.startsWith('openid-credential-offer:') &&
  value.length <= MAX_URI_LENGTH;

export const isPresentationRequestUri = (value: string) =>
  value.startsWith('openid4vp:') &&
  value.length <= MAX_URI_LENGTH &&
  !/\s/.test(value);

export type PageMessage =
  | { source: typeof PAGE_SOURCE; type: 'PING' }
  | {
      source: typeof PAGE_SOURCE;
      type: 'RECEIVE_OFFER';
      payload: { offerUri: string; expiresAt?: string };
    }
  | {
      source: typeof PAGE_SOURCE;
      type: 'PRESENT_REQUEST';
      payload: { requestUri: string };
    };

export const pingMessage = (): PageMessage => ({
  source: PAGE_SOURCE,
  type: 'PING',
});

export const receiveOfferMessage = (
  offerUri: string,
  expiresAt?: string,
): PageMessage => {
  if (!isCredentialOfferUri(offerUri)) {
    throw new Error('Not an OpenID4VCI credential offer URI');
  }
  return {
    source: PAGE_SOURCE,
    type: 'RECEIVE_OFFER',
    payload: expiresAt ? { offerUri, expiresAt } : { offerUri },
  };
};

export const presentRequestMessage = (requestUri: string): PageMessage => {
  if (!isPresentationRequestUri(requestUri)) {
    throw new Error('Not an OpenID4VP request URI');
  }
  return {
    source: PAGE_SOURCE,
    type: 'PRESENT_REQUEST',
    payload: { requestUri },
  };
};

export interface WebWalletInfo {
  protocolVersion: number;
  extensionVersion: string;
}

/** The wallet's final status of an offer or a request it received from this tab */
export interface WebWalletStatus {
  state: 'done' | 'error';
  message: string;
}

/** The extension's answer to a RECEIVE_OFFER or PRESENT_REQUEST: the item was stored, or refused */
export type WebWalletResponse =
  | { type: 'OFFER_ACKNOWLEDGED' }
  | { type: 'ERROR'; message: string };

export type ExtensionMessage =
  | { type: 'EXTENSION_READY' | 'PING_RESPONSE'; info: WebWalletInfo }
  | {
      type: 'RECEIVE_OFFER_RESPONSE' | 'PRESENT_REQUEST_RESPONSE';
      response: WebWalletResponse;
    }
  | { type: 'RECEIVE_STATUS'; offerUri: string; status: WebWalletStatus }
  | { type: 'PRESENT_STATUS'; requestUri: string; status: WebWalletStatus };

type Fields = Record<string, unknown>;

const readInfo = (payload: Fields): WebWalletInfo | null =>
  payload.protocolVersion === BRIDGE_PROTOCOL_VERSION &&
  typeof payload.extensionVersion === 'string'
    ? {
        protocolVersion: payload.protocolVersion,
        extensionVersion: payload.extensionVersion,
      }
    : null;

const readResponse = (payload: Fields): WebWalletResponse | null => {
  if (payload.type === 'OFFER_ACKNOWLEDGED') return { type: payload.type };
  return payload.type === 'ERROR' && typeof payload.message === 'string'
    ? { type: payload.type, message: payload.message }
    : null;
};

const readStatus = (payload: Fields): WebWalletStatus | null =>
  (payload.state === 'done' || payload.state === 'error') &&
  typeof payload.message === 'string'
    ? { state: payload.state, message: payload.message }
    : null;

/**
 * The extension's message in `event`, or null for anything else: a message from another window
 * or origin, another sender, or a shape that protocol v1 doesn't define.
 */
export const readExtensionMessage = (
  event: MessageEvent,
): ExtensionMessage | null => {
  if (event.source !== window || event.origin !== window.location.origin) {
    return null;
  }
  const data = event.data as Fields | null;
  if (!data || typeof data !== 'object' || data.source !== EXTENSION_SOURCE) {
    return null;
  }
  const payload = data.payload as Fields | null;
  if (!payload || typeof payload !== 'object') return null;

  switch (data.type) {
    case 'EXTENSION_READY': {
      const info = readInfo(payload);
      return info && { type: data.type, info };
    }
    case 'PING_RESPONSE': {
      const info = payload.type === 'PONG' ? readInfo(payload) : null;
      return info && { type: data.type, info };
    }
    case 'RECEIVE_OFFER_RESPONSE':
    case 'PRESENT_REQUEST_RESPONSE': {
      const response = readResponse(payload);
      return response && { type: data.type, response };
    }
    case 'RECEIVE_STATUS': {
      const status = readStatus(payload);
      return status && typeof payload.offerUri === 'string'
        ? { type: 'RECEIVE_STATUS', offerUri: payload.offerUri, status }
        : null;
    }
    case 'PRESENT_STATUS': {
      const status = readStatus(payload);
      return status && typeof payload.requestUri === 'string'
        ? { type: 'PRESENT_STATUS', requestUri: payload.requestUri, status }
        : null;
    }
    default:
      return null;
  }
};

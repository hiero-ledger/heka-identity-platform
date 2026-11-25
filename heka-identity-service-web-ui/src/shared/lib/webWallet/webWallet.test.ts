import {
  detectWebWallet,
  onExtensionReady,
  onNextResponse,
  onPresentStatus,
  onReceiveStatus,
  sendOffer,
  sendPresentationRequest,
} from './bridge';
import { readExtensionMessage } from './protocol';
import { mockWebWalletExtension, postFromExtension } from './testUtils';

// The examples of heka-web-wallet/docs/bridge-protocol.md (protocol v1), verbatim
const OFFER_URI =
  'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffers%2F42';
const REQUEST_URI =
  'openid4vp://?client_id=decentralized_identifier%3Adid%3Akey%3Az6Mkverifier&request_uri=https%3A%2F%2Fverifier.example%2Frequests%2F7';

const docExamples = {
  ping: { source: 'heka-web-wallet-bridge', type: 'PING' },
  receiveOffer: {
    source: 'heka-web-wallet-bridge',
    type: 'RECEIVE_OFFER',
    payload: { offerUri: OFFER_URI, expiresAt: '2026-11-25T12:10:00.000Z' },
  },
  presentRequest: {
    source: 'heka-web-wallet-bridge',
    type: 'PRESENT_REQUEST',
    payload: { requestUri: REQUEST_URI },
  },
  extensionReady: {
    source: 'heka-extension-bridge',
    type: 'EXTENSION_READY',
    payload: { protocolVersion: 1, extensionVersion: '0.1.0' },
  },
  pingResponse: {
    source: 'heka-extension-bridge',
    type: 'PING_RESPONSE',
    payload: { type: 'PONG', protocolVersion: 1, extensionVersion: '0.1.0' },
  },
  receiveStatus: {
    source: 'heka-extension-bridge',
    type: 'RECEIVE_STATUS',
    payload: {
      offerUri: OFFER_URI,
      state: 'done',
      message: 'Received 1 credential.',
    },
  },
  presentStatus: {
    source: 'heka-extension-bridge',
    type: 'PRESENT_STATUS',
    payload: {
      requestUri: REQUEST_URI,
      state: 'error',
      message: 'Presentation request declined.',
    },
  },
  offerAcknowledged: {
    source: 'heka-extension-bridge',
    type: 'RECEIVE_OFFER_RESPONSE',
    payload: { type: 'OFFER_ACKNOWLEDGED' },
  },
  requestRefused: {
    source: 'heka-extension-bridge',
    type: 'PRESENT_REQUEST_RESPONSE',
    payload: {
      type: 'ERROR',
      message: 'This site is not connected to the wallet.',
    },
  },
  // Dropped by the content script; this side refuses to send them
  droppedOffer: 'https://issuer.example/offers/42',
  droppedRequest: 'https://verifier.example/requests/7',
};

const messageEvent = (data: unknown, init: Partial<MessageEventInit> = {}) =>
  new MessageEvent('message', {
    data,
    origin: window.location.origin,
    source: window,
    ...init,
  });

describe('web wallet bridge protocol', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('page messages', () => {
    test('match the examples', () => {
      const { sent, postMessage } = mockWebWalletExtension();

      sendOffer(OFFER_URI, '2026-11-25T12:10:00.000Z');
      sendPresentationRequest(REQUEST_URI);
      void detectWebWallet(10);

      expect(sent).toEqual([
        docExamples.receiveOffer,
        docExamples.presentRequest,
      ]);
      expect(postMessage).toHaveBeenCalledWith(
        docExamples.ping,
        window.location.origin,
      );
    });

    test('an offer without an expiry has none in its payload', () => {
      const { sent } = mockWebWalletExtension();

      sendOffer(OFFER_URI);

      expect(sent).toEqual([
        { ...docExamples.receiveOffer, payload: { offerUri: OFFER_URI } },
      ]);
    });

    test.each([
      ['with another scheme', docExamples.droppedOffer],
      [
        'longer than 4096 characters',
        `openid-credential-offer://?x=${'a'.repeat(4096)}`,
      ],
    ])('an offer URI %s is not sent', (_, uri) => {
      const { postMessage } = mockWebWalletExtension();

      expect(() => sendOffer(uri)).toThrow(
        'Not an OpenID4VCI credential offer URI',
      );
      expect(postMessage).not.toHaveBeenCalled();
    });

    test.each([
      ['with another scheme', docExamples.droppedRequest],
      ['with whitespace', 'openid4vp://?request_uri=a b'],
      ['longer than 4096 characters', `openid4vp://?x=${'a'.repeat(4096)}`],
    ])('a request URI %s is not sent', (_, uri) => {
      const { postMessage } = mockWebWalletExtension();

      expect(() => sendPresentationRequest(uri)).toThrow(
        'Not an OpenID4VP request URI',
      );
      expect(postMessage).not.toHaveBeenCalled();
    });
  });

  describe('extension messages', () => {
    test('the examples are read', () => {
      const info = { protocolVersion: 1, extensionVersion: '0.1.0' };

      expect(
        readExtensionMessage(messageEvent(docExamples.extensionReady)),
      ).toEqual({ type: 'EXTENSION_READY', info });
      expect(
        readExtensionMessage(messageEvent(docExamples.pingResponse)),
      ).toEqual({ type: 'PING_RESPONSE', info });
      expect(
        readExtensionMessage(messageEvent(docExamples.offerAcknowledged)),
      ).toEqual({
        type: 'RECEIVE_OFFER_RESPONSE',
        response: { type: 'OFFER_ACKNOWLEDGED' },
      });
      expect(
        readExtensionMessage(messageEvent(docExamples.requestRefused)),
      ).toEqual({
        type: 'PRESENT_REQUEST_RESPONSE',
        response: {
          type: 'ERROR',
          message: 'This site is not connected to the wallet.',
        },
      });
      expect(
        readExtensionMessage(messageEvent(docExamples.receiveStatus)),
      ).toEqual({
        type: 'RECEIVE_STATUS',
        offerUri: OFFER_URI,
        status: { state: 'done', message: 'Received 1 credential.' },
      });
      expect(
        readExtensionMessage(messageEvent(docExamples.presentStatus)),
      ).toEqual({
        type: 'PRESENT_STATUS',
        requestUri: REQUEST_URI,
        status: { state: 'error', message: 'Presentation request declined.' },
      });
    });

    test.each<[string, unknown, Partial<MessageEventInit>]>([
      ['from another window', docExamples.receiveStatus, { source: null }],
      [
        'from another origin',
        docExamples.receiveStatus,
        { origin: 'https://evil.example' },
      ],
      [
        'posted by the page itself',
        { ...docExamples.receiveStatus, source: 'heka-web-wallet-bridge' },
        {},
      ],
      [
        'of another script',
        { ...docExamples.receiveStatus, source: 'some-other-script' },
        {},
      ],
      [
        'of another protocol version',
        {
          ...docExamples.extensionReady,
          payload: { protocolVersion: 2, extensionVersion: '0.3.0' },
        },
        {},
      ],
      [
        'of the pre-v1 extension',
        {
          ...docExamples.pingResponse,
          payload: { type: 'PONG', version: '0.1.0' },
        },
        {},
      ],
      [
        'that names no item',
        {
          ...docExamples.receiveStatus,
          payload: { state: 'done', message: 'Stored' },
        },
        {},
      ],
      [
        'with an unknown state',
        {
          ...docExamples.presentStatus,
          payload: { requestUri: REQUEST_URI, state: 'working', message: '' },
        },
        {},
      ],
      [
        'with an unknown answer',
        { ...docExamples.offerAcknowledged, payload: { type: 'MAYBE' } },
        {},
      ],
      [
        'of an unknown type',
        { ...docExamples.pingResponse, type: 'HELLO' },
        {},
      ],
    ])('a message %s is ignored', (_, data, init) => {
      expect(readExtensionMessage(messageEvent(data, init))).toBeNull();
    });
  });

  describe('detectWebWallet', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test("resolves with the extension's versions when it answers the PING", async () => {
      mockWebWalletExtension();

      const detection = detectWebWallet(1500);
      jest.advanceTimersByTime(0);

      await expect(detection).resolves.toEqual({
        protocolVersion: 1,
        extensionVersion: '0.1.0',
      });
    });

    test('resolves when the content script loads after the PING and announces itself', async () => {
      jest.spyOn(window, 'postMessage').mockImplementation(() => {});

      const detection = detectWebWallet(1500);
      jest.advanceTimersByTime(1000);
      postFromExtension('EXTENSION_READY', docExamples.extensionReady.payload);

      await expect(detection).resolves.toEqual({
        protocolVersion: 1,
        extensionVersion: '0.1.0',
      });
    });

    test('resolves with null without an answer, or with one from another origin', async () => {
      jest.spyOn(window, 'postMessage').mockImplementation(() => {});

      const detection = detectWebWallet(1500);
      postFromExtension('EXTENSION_READY', docExamples.extensionReady.payload, {
        origin: 'https://evil.example',
      });
      jest.advanceTimersByTime(1500);

      await expect(detection).resolves.toBeNull();
    });

    test('resolves with null when aborted, and stops listening', async () => {
      jest.spyOn(window, 'postMessage').mockImplementation(() => {});
      const removeListener = jest.spyOn(window, 'removeEventListener');
      const controller = new AbortController();

      const detection = detectWebWallet(1500, controller.signal);
      controller.abort();

      await expect(detection).resolves.toBeNull();
      expect(removeListener).toHaveBeenCalledWith(
        'message',
        expect.any(Function),
      );
      expect(jest.getTimerCount()).toBe(0);
    });
  });

  test('onExtensionReady reports every later announcement, until unsubscribed', () => {
    const callback = jest.fn();
    const unsubscribe = onExtensionReady(callback);

    postFromExtension('PING_RESPONSE', docExamples.pingResponse.payload);
    postFromExtension('EXTENSION_READY', docExamples.extensionReady.payload, {
      origin: 'https://evil.example',
    });
    postFromExtension('EXTENSION_READY', docExamples.extensionReady.payload);
    unsubscribe();
    postFromExtension('EXTENSION_READY', docExamples.extensionReady.payload);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({
      protocolVersion: 1,
      extensionVersion: '0.1.0',
    });
  });

  describe('onNextResponse', () => {
    test('reports the next answer to its kind of message, once', () => {
      const callback = jest.fn();
      onNextResponse('PRESENT_REQUEST', callback);

      postFromExtension(
        'RECEIVE_OFFER_RESPONSE',
        docExamples.offerAcknowledged.payload,
      );
      postFromExtension(
        'PRESENT_REQUEST_RESPONSE',
        docExamples.requestRefused.payload,
      );
      postFromExtension('PRESENT_REQUEST_RESPONSE', {
        type: 'OFFER_ACKNOWLEDGED',
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({
        type: 'ERROR',
        message: 'This site is not connected to the wallet.',
      });
    });

    test('reports nothing once cancelled', () => {
      const callback = jest.fn();
      const cancel = onNextResponse('RECEIVE_OFFER', callback);

      cancel();
      postFromExtension(
        'RECEIVE_OFFER_RESPONSE',
        docExamples.offerAcknowledged.payload,
      );

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('statuses', () => {
    test.each([
      [
        'onReceiveStatus',
        onReceiveStatus,
        OFFER_URI,
        'RECEIVE_STATUS',
        'offerUri',
      ],
      [
        'onPresentStatus',
        onPresentStatus,
        REQUEST_URI,
        'PRESENT_STATUS',
        'requestUri',
      ],
    ] as const)(
      "%s reports only its own item's status, until unsubscribed",
      (_, subscribe, uri, type, field) => {
        const callback = jest.fn();
        const unsubscribe = subscribe(uri, callback);

        postFromExtension(type, {
          [field]: `${uri}-other`,
          state: 'done',
          message: '',
        });
        postFromExtension(
          type,
          { [field]: uri, state: 'error', message: 'Declined' },
          { origin: 'https://evil.example' },
        );
        postFromExtension(type, {
          [field]: uri,
          state: 'error',
          message: 'Declined',
        });
        unsubscribe();
        postFromExtension(type, { [field]: uri, state: 'done', message: '' });

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith({
          state: 'error',
          message: 'Declined',
        });
      },
    );
  });
});

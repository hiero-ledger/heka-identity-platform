import { EXTENSION_SOURCE, PageMessage, WebWalletResponse } from './protocol';

/** Posts a message the way the extension's content script does: from this window and origin */
export const postFromExtension = (
  type: string,
  payload: unknown,
  init: Partial<MessageEventInit> = {},
) =>
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { source: EXTENSION_SOURCE, type, payload },
      origin: window.location.origin,
      source: window,
      ...init,
    }),
  );

const INFO = { protocolVersion: 1, extensionVersion: '0.1.0' };

/** Announces the content script, as when it loads (or is injected) after the page */
export const announceExtension = () =>
  postFromExtension('EXTENSION_READY', INFO);

/**
 * Stands in for the Heka Web Wallet's content script: answers the page's PING unless
 * `answerPing` is false, answers an offer or a request with `response` (acknowledged by default)
 * unless `answerSends` is false, and records every message the page posts except PING. Answers
 * arrive asynchronously, as `postMessage` delivers them. jsdom answers nothing otherwise, as a
 * browser without the extension.
 */
export const mockWebWalletExtension = ({
  answerPing = true,
  answerSends = true,
  response = { type: 'OFFER_ACKNOWLEDGED' },
}: {
  answerPing?: boolean;
  answerSends?: boolean;
  response?: WebWalletResponse;
} = {}) => {
  const sent: PageMessage[] = [];
  const postMessage = jest.spyOn(window, 'postMessage').mockImplementation(((
    message: PageMessage,
    targetOrigin: string,
  ) => {
    if (targetOrigin !== window.location.origin) return;
    if (message.type === 'PING') {
      if (answerPing) {
        setTimeout(() =>
          postFromExtension('PING_RESPONSE', { type: 'PONG', ...INFO }),
        );
      }
      return;
    }
    sent.push(message);
    if (answerSends) {
      setTimeout(() => postFromExtension(`${message.type}_RESPONSE`, response));
    }
  }) as typeof window.postMessage);
  return { sent, postMessage };
};

/**
 * heka-bridge.ts
 *
 * Content script injected into Heka verification pages.
 *
 * Purpose: Acts as a secure bridge between the Heka web page (untrusted)
 * and the extension (trusted). The web page cannot call
 * chrome.runtime.sendMessage directly — only content scripts can.
 *
 * Message flow:
 *   Heka page  --window.postMessage-->  content script  --chrome.runtime.sendMessage-->  SW
 *   SW  --chrome.runtime.sendMessage-->  content script  --window.postMessage-->  Heka page
 *
 * Security: Only messages with the correct `source` tag are forwarded to
 * prevent arbitrary web pages from triggering wallet actions.
 */

import { RECEIVE_STATUS_KEY } from '../wallet/storage-keys'

const HEKA_MESSAGE_SOURCE = 'heka-web-wallet-bridge'
const EXTENSION_MESSAGE_SOURCE = 'heka-extension-bridge'

// ── Page → Extension ──────────────────────────────────────────────────────────

function replyToPage(type: string, payload: unknown): void {
  window.postMessage({ source: EXTENSION_MESSAGE_SOURCE, type, payload }, window.location.origin)
}

window.addEventListener('message', (event: MessageEvent) => {
  // The page and this content script do not share a Window object, so event.source
  // is not this script's window. Accept only this page's own messages.
  if (event.origin !== window.location.origin || event.data?.source !== HEKA_MESSAGE_SOURCE) {
    return
  }

  const { type, payload } = event.data as { type: string; payload: unknown; source: string }

  // Answer the install check here. Waiting for the service worker makes the page
  // time out while that worker is still starting.
  if (type === 'PING') {
    replyToPage('PING_RESPONSE', { type: 'PONG', version: '0.1.0' })
    return
  }

  if (type === 'RECEIVE_OFFER' || type === 'GET_STATUS') {
    chrome.runtime.sendMessage({ type, ...((payload as object | null) ?? {}) }, (response) => {
      replyToPage(`${type}_RESPONSE`, response)
    })
  }
})

// Signal to the Heka page that the extension is installed and ready
window.postMessage(
  { source: EXTENSION_MESSAGE_SOURCE, type: 'EXTENSION_READY', payload: { version: '0.1.0' } },
  '*',
)

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return
  const next = changes[RECEIVE_STATUS_KEY]?.newValue as { state?: string; message?: string } | undefined
  if (!next?.state || next.state === 'working') return
  replyToPage('RECEIVE_STATUS', next)
})

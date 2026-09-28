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

const HEKA_MESSAGE_SOURCE = 'heka-web-wallet-bridge'
const EXTENSION_MESSAGE_SOURCE = 'heka-extension-bridge'

// ── Page → Extension ──────────────────────────────────────────────────────────

window.addEventListener('message', (event: MessageEvent) => {
  // Reject messages from other origins or without the correct source tag
  if (event.source !== window || event.data?.source !== HEKA_MESSAGE_SOURCE) {
    return
  }

  const { type, payload } = event.data as { type: string; payload: unknown; source: string }

  // Forward allowed message types to the service worker
  if (type === 'PING' || type === 'RECEIVE_OFFER' || type === 'GET_STATUS') {
    chrome.runtime.sendMessage({ type, ...((payload as object | null) ?? {}) }, (response) => {
      // Forward the response back to the page
      window.postMessage(
        { source: EXTENSION_MESSAGE_SOURCE, type: `${type}_RESPONSE`, payload: response },
        '*',
      )
    })
  }
})

// Signal to the Heka page that the extension is installed and ready
window.postMessage(
  { source: EXTENSION_MESSAGE_SOURCE, type: 'EXTENSION_READY', payload: { version: '0.1.0' } },
  '*',
)

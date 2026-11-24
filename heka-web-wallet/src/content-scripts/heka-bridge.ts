/**
 * Content script injected into trusted Heka pages only.
 *
 *   Heka page  --window.postMessage-->  content script  --chrome.runtime.sendMessage-->  service worker
 *
 * The page cannot decide that an offer is accepted. This script only forwards a
 * well-shaped message, and the wallet page asks the holder before redeeming it.
 */

import { RECEIVE_STATUS_KEY } from '../wallet/storage-keys'
import { readBridgeMessage } from './bridge-message'
import { isTrustedHekaOrigin } from './trusted-origins'

const EXTENSION_MESSAGE_SOURCE = 'heka-extension-bridge'

function replyToPage(type: string, payload: unknown): void {
  if (!isTrustedHekaOrigin(window.location.origin)) return
  window.postMessage({ source: EXTENSION_MESSAGE_SOURCE, type, payload }, window.location.origin)
}

window.addEventListener('message', (event: MessageEvent) => {
  const command = readBridgeMessage(event.data, event.origin, window.location.origin)
  if (!command) return

  // Answer the install check here. Waiting for the service worker makes the page
  // time out while that worker is still starting.
  if (command.type === 'PING') {
    replyToPage('PING_RESPONSE', { type: 'PONG', version: '0.1.0' })
    return
  }

  chrome.runtime.sendMessage(command, (response) => {
    replyToPage(`${command.type}_RESPONSE`, response)
  })
})

if (isTrustedHekaOrigin(window.location.origin)) {
  window.postMessage(
    { source: EXTENSION_MESSAGE_SOURCE, type: 'EXTENSION_READY', payload: { version: '0.1.0' } },
    window.location.origin,
  )
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return
  const next = changes[RECEIVE_STATUS_KEY]?.newValue as { state?: string; message?: string } | undefined
  if (!next?.state || next.state === 'working') return
  replyToPage('RECEIVE_STATUS', next)
})

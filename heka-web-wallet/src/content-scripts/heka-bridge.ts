/**
 * Runs only on the sites the holder connected (and, in the development build, the web UI's dev
 * server).
 *
 *   page  --window.postMessage-->  content script  --chrome.runtime.sendMessage-->  service worker
 *
 * The page cannot decide that an offer is accepted. This script only forwards a
 * well-shaped message, and the wallet page asks the holder before redeeming it.
 */

import {
  commandResponseMessage,
  extensionReadyMessage,
  pingResponseMessage,
  readBridgeMessage,
  type BridgeResponse,
  type ExtensionToPageMessage,
  type TabStatusMessage,
} from '../bridge/protocol'

// Connecting a site also injects this script into the page already open, which a second connect
// does again. The flag lives in the extension's isolated world, which the page cannot reach.
const bridgeWindow = window as Window & { hekaWebWalletBridge?: true }

if (!bridgeWindow.hekaWebWalletBridge) {
  bridgeWindow.hekaWebWalletBridge = true
  startBridge()
}

function startBridge(): void {
  const extensionVersion = chrome.runtime.getManifest().version

  const postToPage = (message: ExtensionToPageMessage) => window.postMessage(message, window.location.origin)

  window.addEventListener('message', (event: MessageEvent) => {
    const command = readBridgeMessage(event, window)
    if (!command) return

    // Answer the install check here. Waiting for the service worker makes the page
    // time out while that worker is still starting.
    if (command.type === 'PING') {
      postToPage(pingResponseMessage(extensionVersion))
      return
    }

    chrome.runtime.sendMessage(command, (response?: BridgeResponse) => {
      const failure = chrome.runtime.lastError?.message
      postToPage(
        commandResponseMessage(
          command.type,
          response ?? { type: 'ERROR', message: failure ?? 'The wallet did not answer.' },
        ),
      )
    })
  })

  chrome.runtime.onMessage.addListener((message: TabStatusMessage, sender) => {
    if (sender.id !== chrome.runtime.id || message?.type !== 'BRIDGE_STATUS') return
    if (message.origin !== window.location.origin) return
    postToPage(message.message)
  })

  postToPage(extensionReadyMessage(extensionVersion))
}

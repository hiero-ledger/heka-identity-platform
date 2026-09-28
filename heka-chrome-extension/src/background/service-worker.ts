import { getOrCreateKeyPair } from '../wallet/key-store'
import { getCredentialCount } from '../wallet/credential-store'

// ── Types for cross-context messages ─────────────────────────────────────────

export type ExtensionMessage =
  | { type: 'PING' }
  | { type: 'RECEIVE_OFFER'; offerUri: string }
  | { type: 'REFRESH_BADGE' }
  | { type: 'GET_STATUS' }

export type ExtensionResponse =
  | { type: 'PONG'; version: string }
  | { type: 'OFFER_ACKNOWLEDGED' }
  | { type: 'STATUS'; initialized: boolean; credentialCount: number }

// ── Install handler ───────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    // Generate the holder key pair on first install. This is done here
    // (service worker context) so the popup already has a key ready when
    // the user opens it for the first time.
    try {
      await getOrCreateKeyPair()
      console.log('[Heka Wallet] Holder key pair generated on install')
    } catch (err) {
      console.error('[Heka Wallet] Key generation failed on install:', err)
    }
  }

  await updateBadge()
})

// ── Message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: ExtensionResponse) => void,
  ): boolean => {
    // Return true to keep the message channel open for async responses
    void handleMessage(message, sendResponse)
    return true
  },
)

async function handleMessage(
  message: ExtensionMessage,
  sendResponse: (response: ExtensionResponse) => void,
): Promise<void> {
  switch (message.type) {
    case 'PING': {
      sendResponse({ type: 'PONG', version: chrome.runtime.getManifest().version })
      break
    }

    case 'RECEIVE_OFFER': {
      // Store the offer URI in local storage instead of forcibly opening a window.
      // The popup will check storage when the user clicks the extension icon.
      await chrome.storage.local.set({ pendingOfferUri: message.offerUri })
      sendResponse({ type: 'OFFER_ACKNOWLEDGED' })
      break
    }

    case 'REFRESH_BADGE': {
      await updateBadge()
      sendResponse({ type: 'OFFER_ACKNOWLEDGED' })
      break
    }

    case 'GET_STATUS': {
      const credentialCount = await getCredentialCount()
      sendResponse({
        type: 'STATUS',
        initialized: true,
        credentialCount,
      })
      break
    }

    default:
      break
  }
}

// ── Badge management ──────────────────────────────────────────────────────────

/**
 * Updates the extension action badge to show the number of held credentials.
 * A badge count of 0 clears the badge text entirely.
 */
async function updateBadge(): Promise<void> {
  const count = await getCredentialCount()
  if (count === 0) {
    await chrome.action.setBadgeText({ text: '' })
  } else {
    await chrome.action.setBadgeText({ text: String(count) })
    await chrome.action.setBadgeBackgroundColor({ color: '#22c55e' }) // green-500
  }
}

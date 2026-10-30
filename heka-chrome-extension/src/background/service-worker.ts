import { CREDENTIAL_COUNT_KEY, PENDING_OFFER_KEY, RECEIVE_STATUS_KEY } from '../wallet/storage-keys'

// ── Types for cross-context messages ─────────────────────────────────────────

export type ExtensionMessage =
  | { type: 'PING' }
  | { type: 'RECEIVE_OFFER'; offerUri: string }
  | { type: 'WALLET_TASK_DONE' }
  | { type: 'REFRESH_BADGE' }
  | { type: 'GET_STATUS' }

export type ExtensionResponse =
  | { type: 'PONG'; version: string }
  | { type: 'OFFER_ACKNOWLEDGED' }
  | { type: 'STATUS'; initialized: boolean; credentialCount: number }
  | { type: 'ERROR'; message: string }

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    void chrome.storage.local.remove([PENDING_OFFER_KEY, RECEIVE_STATUS_KEY])
  }
  void updateBadge()
})

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: ExtensionResponse) => void,
  ): boolean => {
    void handleMessage(message)
      .then((response) => sendResponse(response))
      .catch((error: unknown) => {
        const text = error instanceof Error ? error.message : 'Wallet request failed'
        sendResponse({ type: 'ERROR', message: text })
      })
    return true
  },
)

async function handleMessage(message: ExtensionMessage): Promise<ExtensionResponse> {
  switch (message.type) {
    case 'PING':
      return { type: 'PONG', version: chrome.runtime.getManifest().version }

    case 'RECEIVE_OFFER': {
      const offerUri = message.offerUri
      if (typeof offerUri === 'string' && offerUri.startsWith('openid-credential-offer:')) {
        await receiveOfferInExtension(offerUri)
      }
      return { type: 'OFFER_ACKNOWLEDGED' }
    }

    case 'WALLET_TASK_DONE': {
      if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument()
      return { type: 'OFFER_ACKNOWLEDGED' }
    }

    case 'REFRESH_BADGE': {
      await updateBadge()
      return { type: 'OFFER_ACKNOWLEDGED' }
    }

    case 'GET_STATUS':
      return {
        type: 'STATUS',
        initialized: true,
        credentialCount: await readCredentialCount(),
      }

    default:
      return { type: 'ERROR', message: 'Unknown wallet request' }
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[CREDENTIAL_COUNT_KEY]) return
  void applyBadge(Number(changes[CREDENTIAL_COUNT_KEY].newValue ?? 0))
})

async function receiveOfferInExtension(offerUri: string): Promise<void> {
  if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument()
  await chrome.storage.local.set({
    [PENDING_OFFER_KEY]: offerUri,
    [RECEIVE_STATUS_KEY]: { state: 'working', message: 'Opening the wallet… Keep this popup open.' },
  })
  try {
    await chrome.action.openPopup()
  } catch {
    // Chrome only allows this from some user gestures. Clicking the toolbar icon opens the same popup.
  }
}

async function updateBadge(): Promise<void> {
  await applyBadge(await readCredentialCount())
}

async function readCredentialCount(): Promise<number> {
  const stored = await chrome.storage.local.get(CREDENTIAL_COUNT_KEY)
  return Number(stored[CREDENTIAL_COUNT_KEY] ?? 0)
}

async function applyBadge(count: number): Promise<void> {
  await chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' })
  if (count > 0) {
    await chrome.action.setBadgeBackgroundColor({ color: '#22c55e' })
  }
}

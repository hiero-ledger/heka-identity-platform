import {
  isCredentialOfferUri,
  isPresentationRequestUri,
  presentStatusMessage,
  receiveStatusMessage,
  type BridgeCommand,
  type BridgeResponse,
  type ExtensionToPageMessage,
  type ItemStatus,
  type TabStatusMessage,
} from '../bridge/protocol'
import { isConnectedOrigin, reconcileConnectedSites } from '../wallet/connected-sites'
import { walletPageUrl } from '../wallet/page-url'
import { loadPendingOffer, loadPendingRequest, type PendingRequest } from '../wallet/pending-items'
import type { ItemSource, PendingOffer } from '../wallet/pending-offer'
import {
  CREDENTIAL_COUNT_KEY,
  PENDING_OFFER_KEY,
  PENDING_REQUEST_KEY,
  RECEIVE_STATUS_KEY,
  WALLET_STATUS_KEY,
  WALLET_WINDOW_KEY,
} from '../wallet/storage-keys'

/** From the bridge, or from the wallet's own pages (the popup and the wallet page). */
export type ExtensionMessage =
  | Exclude<BridgeCommand, { type: 'PING' }>
  | { type: 'OPEN_WALLET' }
  | { type: 'SETTLE_OFFER'; offerUri: string; status: ItemStatus; keep: boolean }
  | { type: 'OFFER_PROGRESS'; offerUri: string; message: string }
  | { type: 'SETTLE_REQUEST'; requestUri: string; status: ItemStatus; keep: boolean }

/** Sent to the open wallet page: a new offer or presentation request is pending in storage. */
export type WalletPageMessage = { type: 'PENDING_UPDATED' }

export type ExtensionResponse = BridgeResponse | { type: 'SETTLED'; settled: boolean }

const BRIDGE_COMMANDS: ReadonlySet<string> = new Set(['GET_STATUS', 'RECEIVE_OFFER', 'PRESENT_REQUEST'])

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    void chrome.storage.local.remove([PENDING_OFFER_KEY, PENDING_REQUEST_KEY, RECEIVE_STATUS_KEY])
  }
  void reconcileConnectedSites()
  void updateBadge()
})

chrome.runtime.onStartup.addListener(() => {
  void reconcileConnectedSites()
})

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: ExtensionResponse) => void,
  ): boolean => {
    if (sender.id !== chrome.runtime.id) {
      sendResponse({ type: 'ERROR', message: 'Rejected a message from outside this extension.' })
      return false
    }
    void routeMessage(message, sender)
      .then((response) => sendResponse(response))
      .catch((error: unknown) => {
        const text = error instanceof Error ? error.message : 'Wallet request failed'
        sendResponse({ type: 'ERROR', message: text })
      })
    return true
  },
)

/**
 * The wallet's own pages, recognised by their extension URL, may send anything. Anything else is
 * the bridge on a web page, which may send only the bridge commands, and only from a connected site.
 */
async function routeMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
): Promise<ExtensionResponse> {
  if (sender.url?.startsWith(chrome.runtime.getURL(''))) return handleMessage(message)
  const origin = sender.origin ?? (sender.url ? new URL(sender.url).origin : undefined)
  if (!BRIDGE_COMMANDS.has(message?.type) || !origin || !(await isConnectedOrigin(origin))) {
    return { type: 'ERROR', message: 'This site is not connected to the wallet.' }
  }
  return handleMessage(message, sender.tab?.id === undefined ? { origin } : { origin, tabId: sender.tab.id })
}

async function handleMessage(message: ExtensionMessage, from?: ItemSource): Promise<ExtensionResponse> {
  switch (message.type) {
    case 'RECEIVE_OFFER': {
      if (isCredentialOfferUri(message.offerUri)) {
        const offer: PendingOffer = { offerUri: message.offerUri }
        if (message.expiresAt) offer.expiresAt = message.expiresAt
        if (from) offer.from = from
        await receiveOfferInExtension(offer)
      }
      return { type: 'OFFER_ACKNOWLEDGED' }
    }

    case 'PRESENT_REQUEST': {
      if (isPresentationRequestUri(message.requestUri)) {
        await presentRequestInExtension(
          from ? { requestUri: message.requestUri, from } : { requestUri: message.requestUri },
        )
      }
      return { type: 'OFFER_ACKNOWLEDGED' }
    }

    case 'OPEN_WALLET':
      await openWalletPage()
      return { type: 'OFFER_ACKNOWLEDGED' }

    case 'GET_STATUS':
      return {
        type: 'STATUS',
        initialized: await readWalletInitialized(),
        credentialCount: await readCredentialCount(),
      }

    case 'SETTLE_OFFER':
      return { type: 'SETTLED', settled: await settleOffer(message.offerUri, message.status, message.keep) }

    case 'OFFER_PROGRESS':
      return { type: 'SETTLED', settled: await reportOfferProgress(message.offerUri, message.message) }

    case 'SETTLE_REQUEST':
      return { type: 'SETTLED', settled: await settleRequest(message.requestUri, message.status, message.keep) }

    default:
      return { type: 'ERROR', message: 'Unknown wallet request' }
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[CREDENTIAL_COUNT_KEY]) return
  void applyBadge(Number(changes[CREDENTIAL_COUNT_KEY].newValue ?? 0))
})

let pendingQueue: Promise<unknown> = Promise.resolve()

/**
 * Every change to the pending items runs here, one after another: a settle compares and removes
 * without a new item landing between its read and its write.
 */
function changePending<T>(change: () => Promise<T>): Promise<T> {
  const changed = pendingQueue.then(change)
  pendingQueue = changed.catch(() => undefined)
  return changed
}

/** The item's final status, to the tab that handed it over. A pasted item has none. */
function sendStatusToTab(from: ItemSource | undefined, message: ExtensionToPageMessage): void {
  if (from?.tabId === undefined) return
  const status: TabStatusMessage = { type: 'BRIDGE_STATUS', origin: from.origin, message }
  // Rejects when the tab is closed or no longer runs the bridge.
  chrome.tabs.sendMessage(from.tabId, status).catch(() => undefined)
}

async function receiveOfferInExtension(offer: PendingOffer): Promise<void> {
  await changePending(() =>
    chrome.storage.local.set({
      [PENDING_OFFER_KEY]: offer,
      [RECEIVE_STATUS_KEY]: { state: 'working', message: 'Opening the wallet so you can review this offer…' },
    }),
  )
  await openWalletPage()
}

async function presentRequestInExtension(request: PendingRequest): Promise<void> {
  await changePending(() => chrome.storage.local.set({ [PENDING_REQUEST_KEY]: request }))
  await openWalletPage()
}

function settleOffer(offerUri: string, status: ItemStatus, keep: boolean): Promise<boolean> {
  return changePending(async () => {
    const pending = await loadPendingOffer()
    if (pending?.offerUri !== offerUri) return false
    if (!keep) await chrome.storage.local.remove(PENDING_OFFER_KEY)
    await chrome.storage.local.set({ [RECEIVE_STATUS_KEY]: status })
    sendStatusToTab(pending.from, receiveStatusMessage(offerUri, status))
    return true
  })
}

function reportOfferProgress(offerUri: string, message: string): Promise<boolean> {
  return changePending(async () => {
    if ((await loadPendingOffer())?.offerUri !== offerUri) return false
    await chrome.storage.local.set({ [RECEIVE_STATUS_KEY]: { state: 'working', message } })
    return true
  })
}

function settleRequest(requestUri: string, status: ItemStatus, keep: boolean): Promise<boolean> {
  return changePending(async () => {
    const pending = await loadPendingRequest()
    if (pending?.requestUri !== requestUri) return false
    if (!keep) await chrome.storage.local.remove(PENDING_REQUEST_KEY)
    sendStatusToTab(pending.from, presentStatusMessage(requestUri, status))
    return true
  })
}

let walletWindowQueue: Promise<void> = Promise.resolve()

/**
 * One wallet window, and so one Credo agent, serves consecutive requests: the window opened last
 * is focused and told to read the pending offer or request again. A new window opens only when
 * that one is gone. (Without the tabs permission, chrome.tabs.query doesn't return the
 * extension's own pages, so the window id is kept in session storage instead.) Calls run one
 * after another, so requests that arrive together cannot each open a window.
 */
function openWalletPage(): Promise<void> {
  const opened = walletWindowQueue.then(focusOrOpenWalletWindow)
  walletWindowQueue = opened.catch(() => undefined)
  return opened
}

async function focusOrOpenWalletWindow(): Promise<void> {
  const stored = await chrome.storage.session.get(WALLET_WINDOW_KEY)
  const windowId = stored[WALLET_WINDOW_KEY]
  if (typeof windowId === 'number') {
    try {
      await chrome.windows.update(windowId, { focused: true })
      const message: WalletPageMessage = { type: 'PENDING_UPDATED' }
      // Rejects while the page has no listener yet; it reads the pending items when it starts.
      await chrome.runtime.sendMessage(message).catch(() => undefined)
      return
    } catch {
      await chrome.storage.session.remove(WALLET_WINDOW_KEY)
    }
  }
  const created = await chrome.windows.create({
    url: walletPageUrl(),
    type: 'popup',
    width: 480,
    height: 720,
    focused: true,
  })
  if (created?.id !== undefined) await chrome.storage.session.set({ [WALLET_WINDOW_KEY]: created.id })
}

chrome.windows.onRemoved.addListener((windowId) => {
  void (async () => {
    const stored = await chrome.storage.session.get(WALLET_WINDOW_KEY)
    if (stored[WALLET_WINDOW_KEY] === windowId) await chrome.storage.session.remove(WALLET_WINDOW_KEY)
  })()
})

/** The wallet page records whether its agent started; until it has, the wallet isn't initialized. */
async function readWalletInitialized(): Promise<boolean> {
  const stored = await chrome.storage.local.get(WALLET_STATUS_KEY)
  return (stored[WALLET_STATUS_KEY] as { state?: unknown } | undefined)?.state === 'ready'
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

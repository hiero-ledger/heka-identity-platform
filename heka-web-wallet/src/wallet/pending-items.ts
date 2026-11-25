import type { ExtensionMessage, ExtensionResponse } from '../background/service-worker'
import type { ItemStatus } from '../bridge/protocol'
import { readItemSource, readPendingOffer, type ItemSource, type PendingOffer } from './pending-offer'
import { PENDING_OFFER_KEY, PENDING_REQUEST_KEY } from './storage-keys'

export interface PendingRequest {
  requestUri: string
  from?: ItemSource
}

export async function loadPendingOffer(): Promise<PendingOffer | null> {
  const stored = await chrome.storage.local.get(PENDING_OFFER_KEY)
  return readPendingOffer(stored[PENDING_OFFER_KEY])
}

export async function loadPendingRequest(): Promise<PendingRequest | null> {
  const stored = await chrome.storage.local.get(PENDING_REQUEST_KEY)
  const pending = stored[PENDING_REQUEST_KEY]
  if (typeof pending === 'string' && pending.length > 0) return { requestUri: pending }
  if (!pending || typeof pending !== 'object') return null
  const requestUri = (pending as { requestUri?: unknown }).requestUri
  if (typeof requestUri !== 'string' || requestUri.length === 0) return null
  const from = readItemSource((pending as { from?: unknown }).from)
  return from ? { requestUri, from } : { requestUri }
}

// The service worker stores new items and settles handled ones in one queue, so the wallet page
// settles through it: an item stored after the handled one was read is never removed.

async function sendToServiceWorker(message: ExtensionMessage): Promise<boolean> {
  const response = (await chrome.runtime.sendMessage(message).catch(() => undefined)) as ExtensionResponse | undefined
  return response?.type === 'SETTLED' && response.settled
}

/**
 * Reports `status` to the site that sent the offer and removes the offer, or keeps it for a retry,
 * if it is still the pending one.
 */
export function settlePendingOffer(offerUri: string, status: ItemStatus, keep = false): Promise<boolean> {
  return sendToServiceWorker({ type: 'SETTLE_OFFER', offerUri, status, keep })
}

/** Shows `message` as the receive progress in the popup, if `offerUri` is still the pending offer. */
export async function reportOfferProgress(offerUri: string, message: string): Promise<void> {
  await sendToServiceWorker({ type: 'OFFER_PROGRESS', offerUri, message })
}

/** As settlePendingOffer, for the pending presentation request. */
export function settlePendingRequest(requestUri: string, status: ItemStatus, keep = false): Promise<boolean> {
  return sendToServiceWorker({ type: 'SETTLE_REQUEST', requestUri, status, keep })
}

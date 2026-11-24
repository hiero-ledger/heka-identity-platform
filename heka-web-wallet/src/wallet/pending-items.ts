import { readPendingOffer, type PendingOffer } from './pending-offer'
import { PENDING_OFFER_KEY, PENDING_REQUEST_KEY, RECEIVE_STATUS_KEY } from './storage-keys'

/** A final receive result; the bridge passes it to the Heka page that sent the pending offer. */
export interface ReceiveStatus {
  state: 'done' | 'error'
  message: string
}

// The service worker keeps one pending offer and one pending request, and replaces either when a
// newer one arrives, possibly while the wallet page is still handling the older one. So the page
// removes a pending item, or reports its result, only while that item is still the pending one.
// chrome.storage has no compare-and-set: a replacement that lands between the read and the write
// below is not detected.

export async function loadPendingOffer(): Promise<PendingOffer | null> {
  const stored = await chrome.storage.local.get(PENDING_OFFER_KEY)
  return readPendingOffer(stored[PENDING_OFFER_KEY])
}

export async function loadPendingRequest(): Promise<string | null> {
  const stored = await chrome.storage.local.get(PENDING_REQUEST_KEY)
  const pending = stored[PENDING_REQUEST_KEY]
  return typeof pending === 'string' && pending.length > 0 ? pending : null
}

/** Removes the pending offer and reports `status`, if the pending offer is still `offerUri`. */
export async function settlePendingOffer(offerUri: string, status: ReceiveStatus): Promise<boolean> {
  if ((await loadPendingOffer())?.offerUri !== offerUri) return false
  await chrome.storage.local.remove(PENDING_OFFER_KEY)
  await chrome.storage.local.set({ [RECEIVE_STATUS_KEY]: status })
  return true
}

/** Reports `status` and keeps the offer for a retry, if the pending offer is still `offerUri`. */
export async function reportPendingOffer(offerUri: string, status: ReceiveStatus): Promise<boolean> {
  if ((await loadPendingOffer())?.offerUri !== offerUri) return false
  await chrome.storage.local.set({ [RECEIVE_STATUS_KEY]: status })
  return true
}

/** Removes the pending presentation request, if it is still `requestUri`. */
export async function settlePendingRequest(requestUri: string): Promise<boolean> {
  if ((await loadPendingRequest()) !== requestUri) return false
  await chrome.storage.local.remove(PENDING_REQUEST_KEY)
  return true
}

/** The connected site that handed an item over. An item pasted into the popup has none. */
export interface ItemSource {
  origin: string
  /** The tab that gets the item's final status. */
  tabId?: number
}

export interface PendingOffer {
  offerUri: string
  expiresAt?: string
  from?: ItemSource
}

export function readItemSource(value: unknown): ItemSource | undefined {
  if (!value || typeof value !== 'object') return undefined
  const { origin, tabId } = value as { origin?: unknown; tabId?: unknown }
  if (typeof origin !== 'string' || origin.length === 0) return undefined
  return typeof tabId === 'number' ? { origin, tabId } : { origin }
}

export function readPendingOffer(value: unknown): PendingOffer | null {
  if (typeof value === 'string' && value.length > 0) return { offerUri: value }
  if (!value || typeof value !== 'object') return null
  const offerUri = (value as { offerUri?: unknown }).offerUri
  if (typeof offerUri !== 'string' || offerUri.length === 0) return null
  const offer: PendingOffer = { offerUri }
  const expiresAt = (value as { expiresAt?: unknown }).expiresAt
  if (typeof expiresAt === 'string' && expiresAt.length > 0) offer.expiresAt = expiresAt
  const from = readItemSource((value as { from?: unknown }).from)
  if (from) offer.from = from
  return offer
}

export function pendingOfferExpired(offer: PendingOffer, now = Date.now()): boolean {
  if (!offer.expiresAt) return false
  const expires = Date.parse(offer.expiresAt)
  return Number.isFinite(expires) && expires <= now
}

export function formatOfferExpiry(expiresAt: string): string {
  const parsed = Date.parse(expiresAt)
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : expiresAt
}

export function issuerRejectedExpiredOffer(message: string): boolean {
  return /expir/i.test(message)
}

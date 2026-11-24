export interface PendingOffer {
  offerUri: string
  expiresAt?: string
}

export function readPendingOffer(value: unknown): PendingOffer | null {
  if (typeof value === 'string' && value.length > 0) return { offerUri: value }
  if (!value || typeof value !== 'object') return null
  const offerUri = (value as { offerUri?: unknown }).offerUri
  if (typeof offerUri !== 'string' || offerUri.length === 0) return null
  const expiresAt = (value as { expiresAt?: unknown }).expiresAt
  return typeof expiresAt === 'string' && expiresAt.length > 0 ? { offerUri, expiresAt } : { offerUri }
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

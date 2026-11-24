import { isTrustedHekaOrigin } from './trusted-origins'

const PAGE_SOURCE = 'heka-web-wallet-bridge'
const MAX_URI_LENGTH = 4096

export type BridgeCommand =
  | { type: 'PING' }
  | { type: 'GET_STATUS' }
  | { type: 'RECEIVE_OFFER'; offerUri: string; expiresAt?: string }
  | { type: 'PRESENT_REQUEST'; requestUri: string }

export function isCredentialOfferUri(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('openid-credential-offer:') && value.length <= MAX_URI_LENGTH
}

function readExpiresAt(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined
}

export function isPresentationRequestUri(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_URI_LENGTH && !/\s/.test(value)
}

/**
 * Accepts a page message only from a trusted Heka origin, and only when the
 * payload has the shape the service worker expects. Extra fields are dropped.
 */
export function readBridgeMessage(data: unknown, origin: string, pageOrigin: string): BridgeCommand | null {
  if (origin !== pageOrigin || !isTrustedHekaOrigin(origin)) return null
  if (!data || typeof data !== 'object') return null

  const message = data as { source?: unknown; type?: unknown; payload?: unknown }
  if (message.source !== PAGE_SOURCE || typeof message.type !== 'string') return null

  if (message.type === 'PING') return { type: 'PING' }
  if (message.type === 'GET_STATUS') return { type: 'GET_STATUS' }

  const payload = message.payload
  if (!payload || typeof payload !== 'object') return null

  if (message.type === 'RECEIVE_OFFER') {
    const offerUri = (payload as { offerUri?: unknown }).offerUri
    if (!isCredentialOfferUri(offerUri)) return null
    const expiresAt = readExpiresAt((payload as { expiresAt?: unknown }).expiresAt)
    return expiresAt ? { type: 'RECEIVE_OFFER', offerUri, expiresAt } : { type: 'RECEIVE_OFFER', offerUri }
  }

  if (message.type === 'PRESENT_REQUEST') {
    const requestUri = (payload as { requestUri?: unknown }).requestUri
    return isPresentationRequestUri(requestUri) ? { type: 'PRESENT_REQUEST', requestUri } : null
  }

  return null
}

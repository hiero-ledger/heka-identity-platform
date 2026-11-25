/**
 * Bridge protocol v1 between a connected web page and the content script (docs/bridge-protocol.md).
 * The web UI keeps its own copy of these literals; both sides test against the doc's examples.
 */

export const PAGE_SOURCE = 'heka-web-wallet-bridge'
export const EXTENSION_SOURCE = 'heka-extension-bridge'
export const PROTOCOL_VERSION = 1

const MAX_URI_LENGTH = 4096

export type BridgeCommand =
  | { type: 'PING' }
  | { type: 'GET_STATUS' }
  | { type: 'RECEIVE_OFFER'; offerUri: string; expiresAt?: string }
  | { type: 'PRESENT_REQUEST'; requestUri: string }

/** The service worker's answer to a forwarded command, posted back as `<TYPE>_RESPONSE`. */
export type BridgeResponse =
  | { type: 'OFFER_ACKNOWLEDGED' }
  | { type: 'STATUS'; initialized: boolean; credentialCount: number }
  | { type: 'ERROR'; message: string }

/** The final result of a handed-over offer or request. */
export interface ItemStatus {
  state: 'done' | 'error'
  message: string
}

export interface ExtensionToPageMessage {
  source: typeof EXTENSION_SOURCE
  type: string
  payload: unknown
}

/** Service worker → the content script of the tab that handed over an item. */
export interface TabStatusMessage {
  type: 'BRIDGE_STATUS'
  /** The origin that handed over the item; the content script drops the status anywhere else. */
  origin: string
  message: ExtensionToPageMessage
}

export function isCredentialOfferUri(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('openid-credential-offer:') && value.length <= MAX_URI_LENGTH
}

export function isPresentationRequestUri(value: unknown): value is string {
  return (
    typeof value === 'string' && value.startsWith('openid4vp:') && value.length <= MAX_URI_LENGTH && !/\s/.test(value)
  )
}

function readExpiresAt(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined
}

/**
 * Accepts a message only when the page itself posted it on its own origin with the bridge's
 * source, and only in a shape the service worker expects. Extra fields are dropped.
 */
export function readBridgeMessage(
  event: Pick<MessageEvent, 'data' | 'origin' | 'source'>,
  page: Window,
): BridgeCommand | null {
  if (event.source !== page || event.origin !== page.location.origin) return null
  const data = event.data as { source?: unknown; type?: unknown; payload?: unknown } | null
  if (!data || typeof data !== 'object' || data.source !== PAGE_SOURCE) return null

  if (data.type === 'PING') return { type: 'PING' }
  if (data.type === 'GET_STATUS') return { type: 'GET_STATUS' }

  const payload = data.payload
  if (!payload || typeof payload !== 'object') return null

  if (data.type === 'RECEIVE_OFFER') {
    const offerUri = (payload as { offerUri?: unknown }).offerUri
    if (!isCredentialOfferUri(offerUri)) return null
    const expiresAt = readExpiresAt((payload as { expiresAt?: unknown }).expiresAt)
    return expiresAt ? { type: 'RECEIVE_OFFER', offerUri, expiresAt } : { type: 'RECEIVE_OFFER', offerUri }
  }

  if (data.type === 'PRESENT_REQUEST') {
    const requestUri = (payload as { requestUri?: unknown }).requestUri
    return isPresentationRequestUri(requestUri) ? { type: 'PRESENT_REQUEST', requestUri } : null
  }

  return null
}

function toPage(type: string, payload: unknown): ExtensionToPageMessage {
  return { source: EXTENSION_SOURCE, type, payload }
}

export function extensionReadyMessage(extensionVersion: string): ExtensionToPageMessage {
  return toPage('EXTENSION_READY', { protocolVersion: PROTOCOL_VERSION, extensionVersion })
}

export function pingResponseMessage(extensionVersion: string): ExtensionToPageMessage {
  return toPage('PING_RESPONSE', { type: 'PONG', protocolVersion: PROTOCOL_VERSION, extensionVersion })
}

export function commandResponseMessage(
  command: Exclude<BridgeCommand['type'], 'PING'>,
  response: BridgeResponse,
): ExtensionToPageMessage {
  return toPage(`${command}_RESPONSE`, response)
}

export function receiveStatusMessage(offerUri: string, status: ItemStatus): ExtensionToPageMessage {
  return toPage('RECEIVE_STATUS', { offerUri, state: status.state, message: status.message })
}

export function presentStatusMessage(requestUri: string, status: ItemStatus): ExtensionToPageMessage {
  return toPage('PRESENT_STATUS', { requestUri, state: status.state, message: status.message })
}

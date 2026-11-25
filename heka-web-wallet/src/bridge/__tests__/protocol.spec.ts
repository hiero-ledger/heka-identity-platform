import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  commandResponseMessage,
  extensionReadyMessage,
  isCredentialOfferUri,
  isPresentationRequestUri,
  pingResponseMessage,
  presentStatusMessage,
  readBridgeMessage,
  receiveStatusMessage,
  type BridgeCommand,
  type BridgeResponse,
  type ExtensionToPageMessage,
  type ItemStatus,
} from '../protocol'

/** The JSON examples of docs/bridge-protocol.md, by their `###` section. */
function docExamples(): Record<string, Array<Record<string, unknown>>> {
  const doc = readFileSync(new URL('../../../docs/bridge-protocol.md', import.meta.url), 'utf8')
  const examples: Record<string, Array<Record<string, unknown>>> = {}
  for (const block of doc.split(/^### /m).slice(1)) {
    examples[block.slice(0, block.indexOf('\n')).trim()] = [...block.matchAll(/```json\n([\s\S]*?)```/g)].map((match) =>
      JSON.parse(match[1]),
    )
  }
  return examples
}

const origin = 'http://localhost:8000'
const page = { location: { origin } } as unknown as Window
const fromPage = (data: unknown) => ({ data, origin, source: page })

const offer = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer'
const request = 'openid4vp://?client_id=verifier&request_uri=https%3A%2F%2Fverifier.example%2Fr'

describe('bridge protocol: the examples in docs/bridge-protocol.md', () => {
  const examples = docExamples()

  it('has examples for each direction', () => {
    expect(examples['Page → extension']).toHaveLength(4)
    expect(examples['Extension → page']).toHaveLength(7)
    expect(examples['Dropped by the content script']).toHaveLength(3)
  })

  it('accepts every page message as documented', () => {
    for (const example of examples['Page → extension']) {
      const { type, payload } = example as { type: BridgeCommand['type']; payload?: object }
      expect(readBridgeMessage(fromPage(example), page)).toEqual({ type, ...payload })
    }
  })

  it('drops the documented invalid messages', () => {
    for (const example of examples['Dropped by the content script']) {
      expect(readBridgeMessage(fromPage(example), page)).toBeNull()
    }
  })

  it('builds every extension message exactly as documented', () => {
    for (const example of examples['Extension → page']) {
      const { type, payload } = example as { type: string; payload: Record<string, unknown> }
      let built: ExtensionToPageMessage
      if (type === 'EXTENSION_READY') built = extensionReadyMessage(payload.extensionVersion as string)
      else if (type === 'PING_RESPONSE') built = pingResponseMessage(payload.extensionVersion as string)
      else if (type === 'RECEIVE_STATUS') {
        built = receiveStatusMessage(payload.offerUri as string, payload as unknown as ItemStatus)
      } else if (type === 'PRESENT_STATUS') {
        built = presentStatusMessage(payload.requestUri as string, payload as unknown as ItemStatus)
      } else {
        const command = type.replace(/_RESPONSE$/, '') as Exclude<BridgeCommand['type'], 'PING'>
        built = commandResponseMessage(command, payload as BridgeResponse)
      }
      expect(built).toEqual(example)
    }
  })
})

describe('readBridgeMessage', () => {
  it('drops extra fields and an unparsable expiry, and normalizes a valid one', () => {
    expect(
      readBridgeMessage(
        fromPage({ source: 'heka-web-wallet-bridge', type: 'RECEIVE_OFFER', payload: { offerUri: offer, extra: 1 } }),
        page,
      ),
    ).toEqual({ type: 'RECEIVE_OFFER', offerUri: offer })
    expect(
      readBridgeMessage(
        fromPage({
          source: 'heka-web-wallet-bridge',
          type: 'RECEIVE_OFFER',
          payload: { offerUri: offer, expiresAt: 'soon' },
        }),
        page,
      ),
    ).toEqual({ type: 'RECEIVE_OFFER', offerUri: offer })
    expect(
      readBridgeMessage(
        fromPage({
          source: 'heka-web-wallet-bridge',
          type: 'RECEIVE_OFFER',
          payload: { offerUri: offer, expiresAt: 'Wed, 25 Nov 2026 12:10:00 GMT' },
        }),
        page,
      ),
    ).toEqual({ type: 'RECEIVE_OFFER', offerUri: offer, expiresAt: '2026-11-25T12:10:00.000Z' })
  })

  it('ignores a message from another window or another origin', () => {
    const ping = { source: 'heka-web-wallet-bridge', type: 'PING' }
    const frame = {} as Window
    expect(readBridgeMessage({ data: ping, origin, source: frame }, page)).toBeNull()
    expect(readBridgeMessage({ data: ping, origin: 'https://evil.example', source: page }, page)).toBeNull()
    expect(readBridgeMessage(fromPage(ping), page)).toEqual({ type: 'PING' })
  })

  it('accepts only openid4vp: presentation requests without whitespace', () => {
    expect(isPresentationRequestUri(request)).toBe(true)
    expect(isPresentationRequestUri('openid4vp://?request_uri=a b')).toBe(false)
    expect(isPresentationRequestUri('haip://?request_uri=https%3A%2F%2Fverifier.example')).toBe(false)
    expect(isPresentationRequestUri(`openid4vp://?${'a'.repeat(4096)}`)).toBe(false)
  })

  it('accepts only openid-credential-offer: offers', () => {
    expect(isCredentialOfferUri(offer)).toBe(true)
    expect(isCredentialOfferUri('https://issuer.example/offer')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'

import { isCredentialOfferUri, readBridgeMessage } from '../bridge-message'

const origin = 'http://localhost:8000'
const offer = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer'

describe('readBridgeMessage', () => {
  it('forwards a credential offer from a trusted Heka origin', () => {
    expect(
      readBridgeMessage(
        { source: 'heka-web-wallet-bridge', type: 'RECEIVE_OFFER', payload: { offerUri: offer, extra: true } },
        origin,
        origin,
      ),
    ).toEqual({ type: 'RECEIVE_OFFER', offerUri: offer })
  })

  it('keeps a valid offer expiry and drops an invalid one', () => {
    expect(
      readBridgeMessage(
        {
          source: 'heka-web-wallet-bridge',
          type: 'RECEIVE_OFFER',
          payload: { offerUri: offer, expiresAt: '2026-10-30T12:10:00.000Z', extra: true },
        },
        origin,
        origin,
      ),
    ).toEqual({ type: 'RECEIVE_OFFER', offerUri: offer, expiresAt: '2026-10-30T12:10:00.000Z' })
    expect(
      readBridgeMessage(
        { source: 'heka-web-wallet-bridge', type: 'RECEIVE_OFFER', payload: { offerUri: offer, expiresAt: 'soon' } },
        origin,
        origin,
      ),
    ).toEqual({ type: 'RECEIVE_OFFER', offerUri: offer })
  })

  it('drops offers from an untrusted origin and malformed payloads', () => {
    expect(
      readBridgeMessage(
        { source: 'heka-web-wallet-bridge', type: 'RECEIVE_OFFER', payload: { offerUri: offer } },
        'https://evil.hiero.org',
        'https://evil.hiero.org',
      ),
    ).toBeNull()
    expect(
      readBridgeMessage(
        { source: 'heka-web-wallet-bridge', type: 'RECEIVE_OFFER', payload: { offerUri: 'https://example' } },
        origin,
        origin,
      ),
    ).toBeNull()
    expect(readBridgeMessage({ source: 'other', type: 'PING' }, origin, origin)).toBeNull()
  })

  it('rejects an offer URI that is not an OID4VCI offer', () => {
    expect(isCredentialOfferUri('openid-credential-offer://ok')).toBe(true)
    expect(isCredentialOfferUri('https://issuer.example/offer')).toBe(false)
  })
})

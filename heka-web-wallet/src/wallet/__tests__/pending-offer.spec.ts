import { describe, expect, it } from 'vitest'

import { pendingOfferExpired, readPendingOffer } from '../pending-offer'

describe('pending offers', () => {
  it('reads a stored offer object and a legacy URI string', () => {
    expect(
      readPendingOffer({ offerUri: 'openid-credential-offer://one', expiresAt: '2026-10-30T12:10:00.000Z' }),
    ).toEqual({
      offerUri: 'openid-credential-offer://one',
      expiresAt: '2026-10-30T12:10:00.000Z',
    })
    expect(readPendingOffer('openid-credential-offer://legacy')).toEqual({
      offerUri: 'openid-credential-offer://legacy',
    })
    expect(readPendingOffer({})).toBeNull()
  })

  it('treats a past expiresAt as expired and ignores a missing one', () => {
    const offer = { offerUri: 'openid-credential-offer://one', expiresAt: '2026-10-30T12:10:00.000Z' }
    expect(pendingOfferExpired(offer, Date.parse('2026-10-30T12:10:00.000Z'))).toBe(true)
    expect(pendingOfferExpired(offer, Date.parse('2026-10-30T12:09:00.000Z'))).toBe(false)
    expect(pendingOfferExpired({ offerUri: 'openid-credential-offer://one' })).toBe(false)
  })
})

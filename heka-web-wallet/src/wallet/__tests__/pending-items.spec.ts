import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  loadPendingOffer,
  loadPendingRequest,
  reportPendingOffer,
  settlePendingOffer,
  settlePendingRequest,
} from '../pending-items'
import { PENDING_OFFER_KEY, PENDING_REQUEST_KEY, RECEIVE_STATUS_KEY } from '../storage-keys'

const offerA = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer%2Fa'
const offerB = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer%2Fb'
const requestA = 'openid4vp://?client_id=verifier&request_uri=https%3A%2F%2Fverifier.example%2Fa'
const requestB = 'openid4vp://?client_id=verifier&request_uri=https%3A%2F%2Fverifier.example%2Fb'
const declined = { state: 'error', message: 'Credential offer declined.' } as const

function fakeStorage() {
  const values = new Map<string, unknown>()
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (key: string) => (values.has(key) ? { [key]: values.get(key) } : {}),
        set: async (items: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(items)) values.set(key, value)
        },
        remove: async (key: string) => {
          values.delete(key)
        },
      },
    },
  })
  return values
}

describe('pending items', () => {
  let values: Map<string, unknown>

  beforeEach(() => {
    vi.unstubAllGlobals()
    values = fakeStorage()
  })

  it('reads the stored offer and request, including a legacy offer string', async () => {
    values.set(PENDING_OFFER_KEY, offerA)
    values.set(PENDING_REQUEST_KEY, requestA)
    expect(await loadPendingOffer()).toEqual({ offerUri: offerA })
    expect(await loadPendingRequest()).toBe(requestA)

    values.set(PENDING_REQUEST_KEY, { requestUri: requestA })
    expect(await loadPendingRequest()).toBeNull()
  })

  it('removes the handled offer and reports its result', async () => {
    values.set(PENDING_OFFER_KEY, { offerUri: offerA, expiresAt: '2026-11-24T12:00:00.000Z' })

    expect(await settlePendingOffer(offerA, { state: 'done', message: 'Received 1 credential.' })).toBe(true)

    expect(values.has(PENDING_OFFER_KEY)).toBe(false)
    expect(values.get(RECEIVE_STATUS_KEY)).toEqual({ state: 'done', message: 'Received 1 credential.' })
  })

  it('leaves a newer offer in place and reports nothing for the older one', async () => {
    values.set(PENDING_OFFER_KEY, { offerUri: offerB })
    values.set(RECEIVE_STATUS_KEY, { state: 'working', message: 'Opening the wallet so you can review this offer…' })

    expect(await settlePendingOffer(offerA, { state: 'done', message: 'Received 1 credential.' })).toBe(false)
    expect(await settlePendingOffer(offerA, declined)).toBe(false)

    expect(values.get(PENDING_OFFER_KEY)).toEqual({ offerUri: offerB })
    expect(values.get(RECEIVE_STATUS_KEY)).toMatchObject({ state: 'working' })
  })

  it('keeps the offer for a retry, and does not write an older offer back over a newer one', async () => {
    values.set(PENDING_OFFER_KEY, { offerUri: offerA })
    const failed = { state: 'error', message: 'Issuer unreachable. The offer is still saved.' } as const

    expect(await reportPendingOffer(offerA, failed)).toBe(true)
    expect(values.get(PENDING_OFFER_KEY)).toEqual({ offerUri: offerA })
    expect(values.get(RECEIVE_STATUS_KEY)).toEqual(failed)

    values.set(PENDING_OFFER_KEY, { offerUri: offerB })
    values.delete(RECEIVE_STATUS_KEY)
    expect(await reportPendingOffer(offerA, failed)).toBe(false)
    expect(values.get(PENDING_OFFER_KEY)).toEqual({ offerUri: offerB })
    expect(values.has(RECEIVE_STATUS_KEY)).toBe(false)
  })

  it('reports nothing when no offer is pending', async () => {
    expect(await settlePendingOffer(offerA, declined)).toBe(false)
    expect(values.has(RECEIVE_STATUS_KEY)).toBe(false)
  })

  it('removes a presentation request only while it is still the pending one', async () => {
    values.set(PENDING_REQUEST_KEY, requestB)
    expect(await settlePendingRequest(requestA)).toBe(false)
    expect(values.get(PENDING_REQUEST_KEY)).toBe(requestB)

    expect(await settlePendingRequest(requestB)).toBe(true)
    expect(values.has(PENDING_REQUEST_KEY)).toBe(false)
  })
})

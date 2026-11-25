import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  loadPendingOffer,
  loadPendingRequest,
  reportOfferProgress,
  settlePendingOffer,
  settlePendingRequest,
} from '../pending-items'
import { PENDING_OFFER_KEY, PENDING_REQUEST_KEY } from '../storage-keys'

const offerA = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer%2Fa'
const requestA = 'openid4vp://?client_id=verifier&request_uri=https%3A%2F%2Fverifier.example%2Fa'
const declined = { state: 'error', message: 'Credential offer declined.' } as const
const from = { origin: 'https://heka.example', tabId: 7 }

describe('pending items', () => {
  const values = new Map<string, unknown>()
  const sendMessage = vi.fn()

  beforeEach(() => {
    values.clear()
    sendMessage.mockReset()
    vi.stubGlobal('chrome', {
      runtime: { sendMessage },
      storage: {
        local: { get: async (key: string) => (values.has(key) ? { [key]: values.get(key) } : {}) },
      },
    })
  })

  it('reads the stored offer and request with the site that sent them, and legacy strings', async () => {
    values.set(PENDING_OFFER_KEY, { offerUri: offerA, expiresAt: '2026-11-24T12:00:00.000Z', from })
    values.set(PENDING_REQUEST_KEY, { requestUri: requestA, from })
    expect(await loadPendingOffer()).toEqual({ offerUri: offerA, expiresAt: '2026-11-24T12:00:00.000Z', from })
    expect(await loadPendingRequest()).toEqual({ requestUri: requestA, from })

    values.set(PENDING_OFFER_KEY, offerA)
    values.set(PENDING_REQUEST_KEY, requestA)
    expect(await loadPendingOffer()).toEqual({ offerUri: offerA })
    expect(await loadPendingRequest()).toEqual({ requestUri: requestA })

    values.set(PENDING_REQUEST_KEY, { requestUri: '' })
    expect(await loadPendingRequest()).toBeNull()
  })

  it('settles through the service worker and reports whether it settled the pending item', async () => {
    sendMessage.mockResolvedValueOnce({ type: 'SETTLED', settled: true })
    expect(await settlePendingOffer(offerA, declined)).toBe(true)
    expect(sendMessage).toHaveBeenLastCalledWith({
      type: 'SETTLE_OFFER',
      offerUri: offerA,
      status: declined,
      keep: false,
    })

    sendMessage.mockResolvedValueOnce({ type: 'SETTLED', settled: false })
    expect(await settlePendingRequest(requestA, declined, true)).toBe(false)
    expect(sendMessage).toHaveBeenLastCalledWith({
      type: 'SETTLE_REQUEST',
      requestUri: requestA,
      status: declined,
      keep: true,
    })
  })

  it('treats an unreachable service worker as nothing settled', async () => {
    sendMessage.mockRejectedValue(new Error('Could not establish connection.'))
    expect(await settlePendingOffer(offerA, declined)).toBe(false)
    await expect(reportOfferProgress(offerA, 'Saving the credential…')).resolves.toBeUndefined()
  })
})

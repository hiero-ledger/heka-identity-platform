import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveOpenId4VpAuthorizationRequest = vi.fn()
const selectCredentialsForDcqlRequest = vi.fn()
const acceptOpenId4VpAuthorizationRequest = vi.fn()

vi.mock('../../credo/lazy-agent', () => ({
  getOrCreateAgent: async () => ({
    openid4vc: {
      holder: {
        resolveOpenId4VpAuthorizationRequest,
        selectCredentialsForDcqlRequest,
        acceptOpenId4VpAuthorizationRequest,
      },
    },
  }),
}))

import { handlePresentationRequest, submitPresentation } from '../present'

describe('DCQL presentation', () => {
  beforeEach(() => {
    resolveOpenId4VpAuthorizationRequest.mockReset()
    selectCredentialsForDcqlRequest.mockReset()
    acceptOpenId4VpAuthorizationRequest.mockReset()
  })

  it('rejects a presentation request that does not use DCQL', async () => {
    resolveOpenId4VpAuthorizationRequest.mockResolvedValue({ presentationExchange: { definition: {} } })
    await expect(handlePresentationRequest('openid4vp://request')).rejects.toThrow(/DCQL/)
    expect(selectCredentialsForDcqlRequest).not.toHaveBeenCalled()
  })

  it('selects credentials from the DCQL query result and submits that selection', async () => {
    const queryResult = { credentials: [] }
    const selectedCredentials = { github: [] }
    const resolved = {
      dcql: { queryResult },
      authorizationRequestPayload: { client_id: 'verifier' },
      origin: 'https://verifier.example',
    }
    resolveOpenId4VpAuthorizationRequest.mockResolvedValue(resolved)
    selectCredentialsForDcqlRequest.mockReturnValue(selectedCredentials)
    acceptOpenId4VpAuthorizationRequest.mockResolvedValue({ ok: true })

    await expect(handlePresentationRequest('openid4vp://request')).resolves.toEqual({
      resolved,
      selectedCredentials,
    })
    expect(selectCredentialsForDcqlRequest).toHaveBeenCalledWith(queryResult)

    await submitPresentation(
      resolved as unknown as Parameters<typeof submitPresentation>[0],
      selectedCredentials as unknown as Parameters<typeof submitPresentation>[1],
    )
    expect(acceptOpenId4VpAuthorizationRequest).toHaveBeenCalledWith({
      authorizationRequestPayload: resolved.authorizationRequestPayload,
      dcql: { credentials: selectedCredentials },
      origin: resolved.origin,
    })
  })

  it('submits the same selection on a later presentation', async () => {
    const selectedCredentials = { github: [] }
    const resolved = {
      authorizationRequestPayload: { client_id: 'verifier' },
      origin: 'https://verifier.example',
    }
    acceptOpenId4VpAuthorizationRequest.mockResolvedValue({ ok: true })

    await submitPresentation(
      resolved as unknown as Parameters<typeof submitPresentation>[0],
      selectedCredentials as unknown as Parameters<typeof submitPresentation>[1],
    )
    await submitPresentation(
      resolved as unknown as Parameters<typeof submitPresentation>[0],
      selectedCredentials as unknown as Parameters<typeof submitPresentation>[1],
    )

    expect(acceptOpenId4VpAuthorizationRequest).toHaveBeenCalledTimes(2)
  })
})

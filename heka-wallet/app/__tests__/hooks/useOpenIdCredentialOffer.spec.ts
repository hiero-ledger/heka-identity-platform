import { act, renderHook, waitFor } from '@testing-library/react-native'
import { DeviceEventEmitter } from 'react-native'

import { useOpenIdCredentialOffer } from '../../src/hooks/useOpenIdCredentialOffer'

type Offer = Parameters<typeof useOpenIdCredentialOffer>[0]

const mockAgent = {}
const mockResolveOpenId4VciOffer = jest.fn()
const mockAcquireAccessToken = jest.fn()
const mockReceiveCredential = jest.fn()
// Replaced per render to simulate a language change; react-i18next gives a new t then.
let mockT = (key: string) => key

jest.mock('@bifold/core', () => ({
  BifoldError: class extends Error {},
  EventTypes: { ERROR_ADDED: 'ERROR_ADDED' },
}))

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockT }) }))

jest.mock('../../src/credentials', () => {
  const handlers = {
    resolveOpenId4VciOffer: (...args: unknown[]) => mockResolveOpenId4VciOffer(...args),
    acquireAccessToken: (...args: unknown[]) => mockAcquireAccessToken(...args),
    receiveCredentialFromOpenId4VciOffer: (...args: unknown[]) => mockReceiveCredential(...args),
  }
  const recordHelpers = { storeCredentialRecord: jest.fn() }
  return {
    PRE_AUTH_GRANT_LITERAL: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
    mapCredentialRecord: async (record: unknown) => ({ record }),
    useOpenIdHandlers: () => handlers,
    useCredentialRecordHelpers: () => recordHelpers,
  }
})

jest.mock('../../src/utils/agent', () => ({ useHekaAgent: () => ({ agent: mockAgent }) }))

// An offer without a transaction code, so the credential is requested right after it resolves.
const resolution = (id: string) => ({ resolvedCredentialOffer: { id, credentialOfferPayload: { grants: {} } } })

// A resolution the test finishes by hand, to control which run ends first.
const deferResolution = () => {
  const deferred = { resolve: (_value: unknown) => undefined as void, reject: (_error: Error) => undefined as void }
  mockResolveOpenId4VciOffer.mockReturnValueOnce(
    new Promise((resolve, reject) => Object.assign(deferred, { resolve, reject }))
  )
  return deferred
}

const firstOffer = { uri: 'openid-credential-offer://first' } as Offer
const secondOffer = { uri: 'openid-credential-offer://second' } as Offer

const renderOffer = (onFailed = jest.fn()) =>
  renderHook(({ offer }: { offer: Offer }) => useOpenIdCredentialOffer(offer, { onFailed }), {
    initialProps: { offer: firstOffer },
  })

describe('useOpenIdCredentialOffer', () => {
  let emit: jest.SpyInstance

  beforeEach(() => {
    mockT = (key: string) => key
    mockAcquireAccessToken.mockResolvedValue('access-token')
    mockReceiveCredential.mockResolvedValue({ id: 'credential-record' })
    emit = jest.spyOn(DeviceEventEmitter, 'emit')
  })

  afterEach(() => {
    emit.mockRestore()
  })

  it('does not resolve the offer or request the credential again after a language change', async () => {
    mockResolveOpenId4VciOffer.mockResolvedValue(resolution('first'))
    const { result, rerender } = renderOffer()
    await waitFor(() => expect(result.current.credential).toBeDefined())

    mockT = (key: string) => `fr:${key}`
    rerender({ offer: firstOffer })
    await act(async () => undefined)

    expect(mockResolveOpenId4VciOffer).toBeCalledTimes(1)
    expect(mockAcquireAccessToken).toBeCalledTimes(1)
    expect(emit).not.toBeCalled()
  })

  it('requests the credential only for the newer offer when an older resolution finishes last', async () => {
    const first = deferResolution()
    const second = deferResolution()
    const { result, rerender } = renderOffer()
    rerender({ offer: secondOffer })

    await act(async () => second.resolve(resolution('second')))
    await waitFor(() => expect(result.current.credential).toBeDefined())
    await act(async () => first.resolve(resolution('first')))

    expect(mockAcquireAccessToken).toBeCalledTimes(1)
    expect(mockAcquireAccessToken).toBeCalledWith({
      resolvedCredentialOffer: resolution('second').resolvedCredentialOffer,
      userPin: undefined,
    })
  })

  it('does not report a failure of an older resolution', async () => {
    const first = deferResolution()
    const second = deferResolution()
    const onFailed = jest.fn()
    const { result, rerender } = renderOffer(onFailed)
    rerender({ offer: secondOffer })

    await act(async () => second.resolve(resolution('second')))
    await waitFor(() => expect(result.current.credential).toBeDefined())
    await act(async () => first.reject(new Error('Issuer unavailable')))

    expect(onFailed).not.toBeCalled()
    expect(emit).not.toBeCalled()
  })

  it('reports a failed resolution with the current translation and calls onFailed', async () => {
    const first = deferResolution()
    const onFailed = jest.fn()
    const { rerender } = renderOffer(onFailed)
    mockT = (key: string) => `fr:${key}`
    rerender({ offer: firstOffer })

    await act(async () => first.reject(new Error('Issuer unavailable')))

    expect(onFailed).toBeCalledTimes(1)
    expect(emit).toBeCalledTimes(1)
    expect(emit).toBeCalledWith('ERROR_ADDED', expect.objectContaining({ message: 'fr:Error.Title1035' }))
  })
})

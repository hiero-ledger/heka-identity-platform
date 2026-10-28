import { DidCommCredentialExchangeRecord } from '@credo-ts/didcomm'

import { resolveOverlay } from '../../../src/credentials/mappers/credential-display'

const mockCheckForUpdates = jest.fn()
const mockResolveAllBundles = jest.fn()

jest.mock('@bifold/oca/build/legacy', () => ({
  BrandingOverlayType: { Branding10: 'aries/overlays/branding/1.0' },
  RemoteOCABundleResolver: jest.fn().mockImplementation(() => ({
    checkForUpdates: mockCheckForUpdates,
    resolveAllBundles: mockResolveAllBundles,
  })),
}))

jest.mock('@bifold/core', () => ({
  getCredentialIdentifiers: jest.fn(() => ({})),
}))

jest.mock('@credo-ts/anoncreds', () => ({}))

jest.mock('@heka-wallet/shared', () => ({}))

jest.mock('../../../src/config', () => ({
  agencyProviderURL: 'https://oca.example.com',
  fallbackDisplay: {},
}))

jest.mock('../../../src/credentials/mappers/utils', () => ({}))

jest.mock('../../../src/utils/agent', () => ({}))

const credentialRecord = { connectionId: 'connection-id' } as DidCommCredentialExchangeRecord
const overlay = { brandingOverlay: undefined }

describe('resolveOverlay', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mockResolveAllBundles.mockResolvedValue(overlay)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  test('does not wait for an unresponsive OCA host and checks for updates only once', async () => {
    // Simulates an OCA host that never responds
    mockCheckForUpdates.mockReturnValue(new Promise(() => {}))

    const firstResult = resolveOverlay(credentialRecord)
    await jest.advanceTimersByTimeAsync(3000)
    await expect(firstResult).resolves.toBe(overlay)

    const secondResult = resolveOverlay(credentialRecord)
    await jest.advanceTimersByTimeAsync(3000)
    await expect(secondResult).resolves.toBe(overlay)

    expect(mockCheckForUpdates).toHaveBeenCalledTimes(1)
    expect(mockResolveAllBundles).toHaveBeenCalledTimes(2)
  })
})

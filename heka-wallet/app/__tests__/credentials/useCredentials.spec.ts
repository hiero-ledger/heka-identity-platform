import { renderHook, waitFor } from '@testing-library/react-native'

import { mockFunction } from '../../../jest-helpers/helpers'
import { mapCredentialRecord } from '../../src/credentials/mappers'
import { useCredentials } from '../../src/credentials/useCredentials'

const mockAgent = { isInitialized: true, config: { logger: { error: jest.fn() } } }

jest.mock('@bifold/core', () => {
  const store = [{ preferences: { developerModeEnabled: false } }]
  const services = [{ credentialHideList: [] }]
  return {
    TOKENS: { CONFIG: 'config' },
    useStore: () => store,
    useServices: () => services,
  }
})

jest.mock('@bifold/react-hooks', () => {
  const records: unknown[] = []
  return { useCredentialByState: () => records }
})

jest.mock('@credo-ts/anoncreds', () => ({ AnonCredsCredentialMetadataKey: 'anonCredsCredentialMetadata' }))

jest.mock('@credo-ts/didcomm', () => ({
  DidCommCredentialState: { CredentialReceived: 'credential-received', Done: 'done' },
}))

jest.mock('@heka-wallet/shared', () => ({ usePrevious: () => undefined }))

// Replaced, not mutated, per test so the hook sees stable records between renders.
let mockMdocState: { mdocCredentialRecords: unknown[]; isLoading: boolean; error?: unknown } = {
  mdocCredentialRecords: [],
  isLoading: false,
}

jest.mock('../../src/contexts', () => {
  const w3c = { w3cCredentialRecords: [], isLoading: false }
  const sdJwt = { sdJwtVcRecords: [{ id: 'sd-jwt-record-id', createdAt: new Date() }], isLoading: false }
  return {
    useW3cCredentialRecords: () => w3c,
    useSdJwtVcRecords: () => sdJwt,
    useMdocRecords: () => mockMdocState,
  }
})

jest.mock('../../src/utils/agent', () => ({ useHekaAgent: () => ({ agent: mockAgent }) }))

jest.mock('../../src/credentials/mappers', () => ({ mapCredentialRecord: jest.fn() }))

describe('useCredentials', () => {
  afterEach(() => {
    mockMdocState = { mdocCredentialRecords: [], isLoading: false }
  })

  it('reports a load failure as an error, not as an empty wallet', async () => {
    const error = new Error('Mapping failed')
    mockFunction(mapCredentialRecord).mockRejectedValue(error)

    const { result } = renderHook(() => useCredentials())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe(error)
    expect(result.current.credentials).toEqual([])
    expect(mockAgent.config.logger.error).toBeCalledWith('Failed to load credentials', { error: error.stack })
  })

  it('reports a provider load failure with the credentials that did load', async () => {
    const error = new Error('Storage unavailable')
    mockMdocState = { mdocCredentialRecords: [], isLoading: false, error }
    const credential = { id: 'sd-jwt-record-id' }
    mockFunction(mapCredentialRecord).mockResolvedValue(credential as never)

    const { result } = renderHook(() => useCredentials())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe(error)
    expect(result.current.credentials).toEqual([credential])
  })
})

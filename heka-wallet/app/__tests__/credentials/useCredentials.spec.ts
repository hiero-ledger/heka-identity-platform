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

jest.mock('../../src/contexts', () => {
  const w3c = { w3cCredentialRecords: [], isLoading: false }
  const sdJwt = { sdJwtVcRecords: [{ id: 'sd-jwt-record-id', createdAt: new Date() }], isLoading: false }
  const mdoc = { mdocCredentialRecords: [], isLoading: false }
  return {
    useW3cCredentialRecords: () => w3c,
    useSdJwtVcRecords: () => sdJwt,
    useMdocRecords: () => mdoc,
  }
})

jest.mock('../../src/utils/agent', () => ({ useHekaAgent: () => ({ agent: mockAgent }) }))

jest.mock('../../src/credentials/mappers', () => ({ mapCredentialRecord: jest.fn() }))

describe('useCredentials', () => {
  it('reports a load failure as an error, not as an empty wallet', async () => {
    const error = new Error('Mapping failed')
    mockFunction(mapCredentialRecord).mockRejectedValue(error)

    const { result } = renderHook(() => useCredentials())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe(error)
    expect(result.current.credentials).toEqual([])
    expect(mockAgent.config.logger.error).toBeCalledWith('Failed to load credentials', { error: error.stack })
  })
})

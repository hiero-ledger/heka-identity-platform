import { DidCommProofExchangeRecord } from '@credo-ts/didcomm'
import { renderHook, waitFor } from '@testing-library/react-native'

import { mockFunction } from '../../../jest-helpers/helpers'
import { preparePresentationData, useCredentials } from '../../src/credentials'
import { usePresentationData } from '../../src/hooks/usePresentationData'
import { useHekaAgent } from '../../src/utils/agent'

const mockAgent = { config: { logger: { error: jest.fn() } } }

jest.mock('../../src/credentials', () => ({ preparePresentationData: jest.fn(), useCredentials: jest.fn() }))
jest.mock('../../src/utils/agent', () => ({ useHekaAgent: jest.fn() }))

const record = { id: 'proof-id' } as DidCommProofExchangeRecord
const noCredentials: never[] = []

describe('usePresentationData', () => {
  beforeEach(() => {
    mockFunction(useHekaAgent).mockReturnValue({ agent: mockAgent } as unknown as ReturnType<typeof useHekaAgent>)
    mockFunction(useCredentials).mockReturnValue({ credentials: noCredentials, isLoading: false, isPartial: false })
  })

  it('stops loading when the wallet holds no credentials', async () => {
    const data = [{ shared: [] }]
    mockFunction(preparePresentationData).mockResolvedValue(data)

    const { result } = renderHook(() => usePresentationData(record))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.presentationData).toBe(data)
    expect(preparePresentationData).toBeCalledWith(record, mockAgent, noCredentials)
  })

  it('waits while the credentials are loading', () => {
    mockFunction(useCredentials).mockReturnValue({ credentials: noCredentials, isLoading: true, isPartial: false })

    const { result } = renderHook(() => usePresentationData(record))

    expect(result.current.isLoading).toBe(true)
    expect(preparePresentationData).not.toBeCalled()
  })

  it('returns an error instead of throwing when there is no agent', () => {
    mockFunction(useHekaAgent).mockReturnValue({ agent: undefined } as unknown as ReturnType<typeof useHekaAgent>)

    const { result } = renderHook(() => usePresentationData(record))

    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeInstanceOf(Error)
    expect(preparePresentationData).not.toBeCalled()
  })

  it('returns a credentials load failure without preparing the data', () => {
    const error = new Error('Storage unavailable')
    mockFunction(useCredentials).mockReturnValue({
      credentials: noCredentials,
      isLoading: false,
      error,
      isPartial: false,
    })

    const { result } = renderHook(() => usePresentationData(record))

    expect(result.current).toEqual({ isLoading: false, error, credentialsError: error })
    expect(preparePresentationData).not.toBeCalled()
  })

  it('prepares the data from the credentials that loaded when only a provider failed', async () => {
    const data = [{ shared: [] }]
    mockFunction(preparePresentationData).mockResolvedValue(data)
    const error = new Error('mdoc storage unavailable')
    mockFunction(useCredentials).mockReturnValue({
      credentials: noCredentials,
      isLoading: false,
      error,
      isPartial: true,
    })

    const { result } = renderHook(() => usePresentationData(record))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.presentationData).toBe(data)
    expect(result.current.error).toBeUndefined()
    expect(result.current.credentialsError).toBe(error)
    expect(preparePresentationData).toBeCalledWith(record, mockAgent, noCredentials)
  })

  it('returns and logs a failure to prepare the data', async () => {
    const error = new Error('Unsupported format')
    mockFunction(preparePresentationData).mockRejectedValue(error)

    const { result } = renderHook(() => usePresentationData(record))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe(error)
    expect(mockAgent.config.logger.error).toBeCalledWith('Failed to prepare shared proof data', {
      proofExchangeRecordId: record.id,
      error: error.stack,
    })
  })
})

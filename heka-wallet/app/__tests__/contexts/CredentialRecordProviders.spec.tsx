import { renderHook, waitFor } from '@testing-library/react-native'
import React, { PropsWithChildren } from 'react'

import { MdocRecordProvider, useMdocRecords } from '../../src/contexts/MdocCredentials'
import { SdJwtVcRecordProvider, useSdJwtVcRecords } from '../../src/contexts/SdJwtCredentials'
import { useW3cCredentialRecords, W3cCredentialRecordProvider } from '../../src/contexts/W3cCredentials'

const mockAgent = {
  mdoc: { getAll: jest.fn() },
  sdJwtVc: { getAll: jest.fn() },
  w3cCredentials: { getAll: jest.fn() },
  config: { logger: { error: jest.fn() } },
}

// Replaced to simulate a new agent, e.g. after a lockout; the providers reload on an agent change.
let mockCurrentAgent: object = mockAgent

jest.mock('../../src/utils/agent', () => ({ useHekaAgent: () => ({ agent: mockCurrentAgent }) }))

jest.mock('@bifold/react-hooks/build/recordUtils', () => {
  const subscription = { subscribe: () => ({ unsubscribe: jest.fn() }) }
  return {
    recordsAddedByType: () => subscription,
    recordsUpdatedByType: () => subscription,
    recordsRemovedByType: () => subscription,
  }
})

const cases = [
  {
    name: 'MdocRecordProvider',
    getAll: mockAgent.mdoc.getAll,
    Provider: MdocRecordProvider,
    useRecords: useMdocRecords,
    message: 'Failed to load mdoc records',
  },
  {
    name: 'SdJwtVcRecordProvider',
    getAll: mockAgent.sdJwtVc.getAll,
    Provider: SdJwtVcRecordProvider,
    useRecords: useSdJwtVcRecords,
    message: 'Failed to load SD-JWT VC records',
  },
  {
    name: 'W3cCredentialRecordProvider',
    getAll: mockAgent.w3cCredentials.getAll,
    Provider: W3cCredentialRecordProvider,
    useRecords: useW3cCredentialRecords,
    message: 'Failed to load W3C credential records',
  },
]

describe.each(cases)('$name', ({ getAll, Provider, useRecords, message }) => {
  afterEach(() => {
    mockCurrentAgent = mockAgent
  })

  it('drops the records of the previous agent when a reload fails', async () => {
    getAll.mockResolvedValueOnce([{ id: 'record-id' }])
    const wrapper = ({ children }: PropsWithChildren) => <Provider>{children}</Provider>
    const { result, rerender } = renderHook(() => useRecords(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(Object.values(result.current).find(Array.isArray)).toHaveLength(1)

    const error = new Error('Storage unavailable')
    getAll.mockRejectedValueOnce(error)
    mockCurrentAgent = { ...mockAgent }
    rerender({})

    await waitFor(() => expect(result.current.error).toBe(error))
    expect(Object.values(result.current).find(Array.isArray)).toEqual([])
  })

  it('stops loading, logs and exposes the error when the records cannot be loaded', async () => {
    const error = new Error('Storage unavailable')
    getAll.mockRejectedValue(error)
    const wrapper = ({ children }: PropsWithChildren) => <Provider>{children}</Provider>

    const { result } = renderHook(() => useRecords(), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe(error)
    expect(mockAgent.config.logger.error).toBeCalledWith(message, { error: error.stack })
  })
})

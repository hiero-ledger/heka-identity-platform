import { act, renderHook, waitFor } from '@testing-library/react-native'
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
let mockCurrentAgent: object | undefined = mockAgent

const deferred = <T,>() => {
  let resolve: (value: T) => void = () => undefined
  let reject: (reason: unknown) => void = () => undefined
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

type Records = Array<{ id: string }>

const recordsOf = (state: object) => Object.values(state).find(Array.isArray)

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

  it('ignores a load of the previous agent that resolves after the agent changed', async () => {
    const previousLoad = deferred<Records>()
    getAll.mockReturnValueOnce(previousLoad.promise).mockResolvedValueOnce([{ id: 'current' }])
    const wrapper = ({ children }: PropsWithChildren) => <Provider>{children}</Provider>
    const { result, rerender } = renderHook(() => useRecords(), { wrapper })

    mockCurrentAgent = { ...mockAgent }
    rerender({})
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () => previousLoad.resolve([{ id: 'previous' }]))

    expect(recordsOf(result.current)).toEqual([{ id: 'current' }])
  })

  it('ignores a load of the previous agent that fails after the agent changed', async () => {
    const previousLoad = deferred<Records>()
    getAll.mockReturnValueOnce(previousLoad.promise).mockResolvedValueOnce([{ id: 'current' }])
    const wrapper = ({ children }: PropsWithChildren) => <Provider>{children}</Provider>
    const { result, rerender } = renderHook(() => useRecords(), { wrapper })

    mockCurrentAgent = { ...mockAgent }
    rerender({})
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () => previousLoad.reject(new Error('Storage unavailable')))

    expect(result.current.error).toBeUndefined()
    expect(recordsOf(result.current)).toEqual([{ id: 'current' }])
  })

  it('drops the records and reloads when the agent changes', async () => {
    const currentLoad = deferred<Records>()
    getAll.mockResolvedValueOnce([{ id: 'previous' }]).mockReturnValueOnce(currentLoad.promise)
    const wrapper = ({ children }: PropsWithChildren) => <Provider>{children}</Provider>
    const { result, rerender } = renderHook(() => useRecords(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    mockCurrentAgent = { ...mockAgent }
    rerender({})

    expect(result.current.isLoading).toBe(true)
    expect(recordsOf(result.current)).toEqual([])
    await act(async () => currentLoad.resolve([{ id: 'current' }]))
    expect(recordsOf(result.current)).toEqual([{ id: 'current' }])
  })

  it('drops the records when the agent is removed', async () => {
    getAll.mockResolvedValueOnce([{ id: 'previous' }])
    const wrapper = ({ children }: PropsWithChildren) => <Provider>{children}</Provider>
    const { result, rerender } = renderHook(() => useRecords(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    mockCurrentAgent = undefined
    rerender({})

    expect(recordsOf(result.current)).toEqual([])
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

import { markProofAsViewed } from '@bifold/verifier'
import { DidCommProofExchangeRecord } from '@credo-ts/didcomm'
import { act, renderHook } from '@testing-library/react-native'

import { mockFunction } from '../../../jest-helpers/helpers'
import { useProofDetailsLifecycle } from '../../src/hooks/useProofDetailsLifecycle'

const mockAgent = {
  config: { logger: { error: jest.fn() } },
  didcomm: {
    proofs: { deleteById: jest.fn() },
    connections: { deleteById: jest.fn() },
  },
}
let mockUseDataRetention = false

jest.mock('@bifold/core', () => ({
  useStore: () => [{ preferences: { useDataRetention: mockUseDataRetention } }],
}))

jest.mock('@bifold/react-hooks', () => ({ useOptionalAgent: () => ({ agent: mockAgent }) }))

jest.mock('@bifold/verifier', () => ({
  ProofMetadata: { customMetadata: 'customMetadata' },
  markProofAsViewed: jest.fn(),
}))

const createProof = (customMetadata?: object) => {
  const data: Record<string, unknown> = customMetadata ? { customMetadata } : {}
  return {
    id: 'proof-id',
    connectionId: 'connection-id',
    metadata: { data, get: (key: string) => data[key] },
  } as unknown as DidCommProofExchangeRecord
}

const renderLifecycle = (proof: DidCommProofExchangeRecord | undefined) =>
  renderHook(
    ({ proofRecord }: { proofRecord: DidCommProofExchangeRecord | undefined }) =>
      useProofDetailsLifecycle('proof-id', proofRecord),
    { initialProps: { proofRecord: proof } }
  )

describe('useProofDetailsLifecycle', () => {
  beforeEach(() => {
    mockUseDataRetention = false
    mockAgent.didcomm.proofs.deleteById.mockResolvedValue(undefined)
    mockAgent.didcomm.connections.deleteById.mockResolvedValue(undefined)
    mockFunction(markProofAsViewed).mockResolvedValue(undefined as never)
  })

  it('keeps the record while the screen is open and the proof is marked as viewed', async () => {
    const { rerender } = renderLifecycle(createProof({ delete_conn_after_seen: true }))
    await act(async () => undefined)
    expect(markProofAsViewed).toBeCalledTimes(1)

    // The viewed mark gives the record new metadata
    rerender({ proofRecord: createProof({ delete_conn_after_seen: true, details_seen: true }) })

    expect(mockAgent.didcomm.proofs.deleteById).not.toBeCalled()
    expect(mockAgent.didcomm.connections.deleteById).not.toBeCalled()
  })

  it('deletes the proof and its connection on unmount when data retention is off', () => {
    const { rerender, unmount } = renderLifecycle(undefined)
    rerender({ proofRecord: createProof({ delete_conn_after_seen: true }) })

    unmount()

    expect(mockAgent.didcomm.proofs.deleteById).toBeCalledTimes(1)
    expect(mockAgent.didcomm.proofs.deleteById).toBeCalledWith('proof-id')
    expect(mockAgent.didcomm.connections.deleteById).toBeCalledTimes(1)
    expect(mockAgent.didcomm.connections.deleteById).toBeCalledWith('connection-id')
  })

  it('keeps the proof and its connection on unmount when retention is on and no deletion is asked', () => {
    mockUseDataRetention = true
    const { unmount } = renderLifecycle(createProof({}))

    unmount()

    expect(mockAgent.didcomm.proofs.deleteById).not.toBeCalled()
    expect(mockAgent.didcomm.connections.deleteById).not.toBeCalled()
  })

  it('does not throw or delete a connection on unmount when the proof has no custom metadata', () => {
    const { unmount } = renderLifecycle(createProof())

    expect(() => unmount()).not.toThrow()
    expect(mockAgent.didcomm.connections.deleteById).not.toBeCalled()
  })

  it('does not throw on unmount before the proof has loaded', () => {
    const { unmount } = renderLifecycle(undefined)

    expect(() => unmount()).not.toThrow()
    expect(mockAgent.didcomm.proofs.deleteById).toBeCalledWith('proof-id')
    expect(mockAgent.didcomm.connections.deleteById).not.toBeCalled()
  })

  it('does not delete a connection when the proof has none', () => {
    const proof = Object.assign(createProof({ delete_conn_after_seen: true }), { connectionId: undefined })
    const { unmount } = renderLifecycle(proof)

    unmount()

    expect(mockAgent.didcomm.connections.deleteById).not.toBeCalled()
  })
})

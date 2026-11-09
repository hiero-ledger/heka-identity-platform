import { useStore } from '@bifold/core'
import { useOptionalAgent } from '@bifold/react-hooks'
import { ProofCustomMetadata, ProofMetadata, markProofAsViewed } from '@bifold/verifier'
import { DidCommProofExchangeRecord } from '@credo-ts/didcomm'
import { useEffect, useRef } from 'react'

import { formatError } from '../utils/error'

/**
 * Marks the proof as viewed once it is shown. On cleanup deletes the proof record when data
 * retention is off, and its connection when the proof asks for it.
 */
export function useProofDetailsLifecycle(recordId: string, proofRecord: DidCommProofExchangeRecord | undefined): void {
  const [store] = useStore()
  const { agent } = useOptionalAgent()

  // The cleanup below runs only on unmount and reads the values of the last render from here.
  // Marking the proof as viewed updates its metadata; with that as a dependency, the cleanup ran
  // while the screen was open and deleted the record it shows.
  const latest = useRef({ store, agent, proofRecord, recordId })
  useEffect(() => {
    latest.current = { store, agent, proofRecord, recordId }
  })

  useEffect(() => {
    return () => {
      const { store, agent, proofRecord, recordId } = latest.current
      if (!store.preferences.useDataRetention) {
        agent?.didcomm.proofs
          .deleteById(recordId)
          .catch((error: unknown) =>
            agent.config.logger.error('Failed to delete the proof record', { recordId, error: formatError(error) })
          )
      }
      const metadata = proofRecord?.metadata.get(ProofMetadata.customMetadata) as ProofCustomMetadata | undefined
      if (proofRecord?.connectionId && metadata?.delete_conn_after_seen) {
        const connectionId = proofRecord.connectionId
        agent?.didcomm.connections.deleteById(connectionId).catch((error: unknown) =>
          agent.config.logger.error('Failed to delete the connection after the proof was seen', {
            connectionId,
            error: formatError(error),
          })
        )
      }
    }
  }, [])

  useEffect(() => {
    if (agent && proofRecord && !proofRecord.metadata?.data?.customMetadata?.details_seen) {
      markProofAsViewed(agent, proofRecord).catch((error: unknown) =>
        agent.config.logger.error('Failed to mark the proof as viewed', {
          recordId: proofRecord.id,
          error: formatError(error),
        })
      )
    }
  }, [agent, proofRecord])
}

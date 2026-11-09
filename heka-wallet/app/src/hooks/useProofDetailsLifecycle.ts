import { useStore } from '@bifold/core'
import { useOptionalAgent } from '@bifold/react-hooks'
import { ProofCustomMetadata, ProofMetadata, markProofAsViewed } from '@bifold/verifier'
import { DidCommProofExchangeRecord } from '@credo-ts/didcomm'
import { useEffect } from 'react'

import { formatError } from '../utils/error'

/**
 * Marks the proof as viewed once it is shown. On cleanup deletes the proof record when data
 * retention is off, and its connection when the proof asks for it.
 */
export function useProofDetailsLifecycle(recordId: string, proofRecord: DidCommProofExchangeRecord | undefined): void {
  const [store] = useStore()
  const { agent } = useOptionalAgent()

  // Known issue: the cleanup also runs on every dependency change, not only on unmount.
  useEffect(() => {
    return () => {
      if (!store.preferences.useDataRetention) {
        agent?.didcomm.proofs
          .deleteById(recordId)
          .catch((error: unknown) =>
            agent.config.logger.error('Failed to delete the proof record', { recordId, error: formatError(error) })
          )
      }
      if ((proofRecord?.metadata.get(ProofMetadata.customMetadata) as ProofCustomMetadata).delete_conn_after_seen) {
        const connectionId = proofRecord?.connectionId ?? ''
        agent?.didcomm.connections.deleteById(connectionId).catch((error: unknown) =>
          agent.config.logger.error('Failed to delete the connection after the proof was seen', {
            connectionId,
            error: formatError(error),
          })
        )
      }
    }
  }, [
    agent?.config.logger,
    agent?.didcomm.connections,
    agent?.didcomm.proofs,
    proofRecord?.connectionId,
    proofRecord?.metadata,
    recordId,
    store.preferences.useDataRetention,
  ])

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

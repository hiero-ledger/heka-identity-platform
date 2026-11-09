import { DidCommProofExchangeRecord } from '@credo-ts/didcomm'
import { useEffect, useState } from 'react'

import { preparePresentationData, PresentationDetails, useCredentials } from '../credentials'
import { useHekaAgent } from '../utils/agent'
import { formatError } from '../utils/error'

interface PresentationDataState {
  presentationData?: PresentationDetails[]
  isLoading: boolean
  error?: unknown
  // Set when the wallet's credentials did not all load; `error` holds it too unless the load was partial
  credentialsError?: unknown
}

const agentUnavailableError = new Error('Unable to fetch agent from Credo')

/**
 * Loads what the wallet shared in a DIDComm proof exchange, matched against the wallet's
 * credentials. Waits until the credentials are loaded; a shared credential the wallet no longer
 * holds is still shown, without its card.
 */
export function usePresentationData(record: DidCommProofExchangeRecord): PresentationDataState {
  const { agent } = useHekaAgent()
  const { credentials, isLoading: isCredentialsLoading, error: credentialsError, isPartial } = useCredentials()
  // A partial load is usable: the credentials of the providers that loaded are still matched
  const fatalCredentialsError = isPartial ? undefined : credentialsError

  const [state, setState] = useState<PresentationDataState>({ isLoading: true })

  useEffect(() => {
    if (!agent || isCredentialsLoading || fatalCredentialsError) return

    preparePresentationData(record, agent, credentials)
      .then((presentationData) => setState({ presentationData, isLoading: false }))
      .catch((error: unknown) => {
        agent.config.logger.error('Failed to prepare shared proof data', {
          proofExchangeRecordId: record.id,
          error: formatError(error),
        })
        setState({ isLoading: false, error })
      })
  }, [record, credentials, isCredentialsLoading, fatalCredentialsError, agent])

  if (!agent) return { isLoading: false, error: agentUnavailableError }
  if (fatalCredentialsError) return { isLoading: false, error: fatalCredentialsError, credentialsError }
  return credentialsError ? { ...state, credentialsError } : state
}

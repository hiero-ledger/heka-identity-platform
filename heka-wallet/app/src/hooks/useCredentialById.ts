import { BifoldError, EventTypes } from '@bifold/core'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DeviceEventEmitter } from 'react-native'

import { mapCredentialRecord, Credential } from '../credentials'
import { useHekaAgent } from '../utils/agent'
import { formatError } from '../utils/error'

interface CredentialByIdState {
  credential: Credential | undefined
  isLoading: boolean
}

/**
 * Returns the credential passed in the route, or loads and maps the DIDComm credential record
 * when the route carries only its id. A failure is logged and shown as error 1033.
 */
export function useCredentialById(routeCredential: string | Credential): CredentialByIdState {
  const { t } = useTranslation()
  const { agent } = useHekaAgent()

  const routeWithCredentialId = typeof routeCredential === 'string'

  const [isLoading, setIsLoading] = useState(false)
  const [credential, setCredential] = useState<Credential | undefined>(
    !routeWithCredentialId ? routeCredential : undefined
  )

  useEffect(() => {
    if (credential || !routeWithCredentialId || !agent) return

    setIsLoading(true)

    // TODO: Refactor to avoid chained promise calls
    agent.didcomm.credentials
      .getById(routeCredential)
      .then((record) => mapCredentialRecord(record, agent))
      .then((credential) => setCredential(credential))
      .catch((err: unknown) => {
        agent.config.logger.error('Failed to load the credential', {
          credentialId: routeCredential,
          error: formatError(err),
        })
        DeviceEventEmitter.emit(
          EventTypes.ERROR_ADDED,
          new BifoldError(t('Error.Title1033'), t('Error.Message1033'), (err as Error)?.message ?? err, 1033)
        )
      })
      .finally(() => setIsLoading(false))
  }, [agent, routeCredential, credential, routeWithCredentialId, t])

  useEffect(() => {
    if (!agent) {
      DeviceEventEmitter.emit(
        EventTypes.ERROR_ADDED,
        new BifoldError(t('Error.Title1033'), t('Error.Message1033'), t('CredentialDetails.CredentialNotFound'), 1033)
      )
    }
  }, [t, agent])

  useEffect(() => {
    if (!routeCredential) {
      DeviceEventEmitter.emit(
        EventTypes.ERROR_ADDED,
        new BifoldError(t('Error.Title1033'), t('Error.Message1033'), t('CredentialDetails.CredentialNotFound'), 1033)
      )
    }
  }, [t, routeCredential])

  return { credential, isLoading }
}

import { BifoldError, EventTypes, useNetwork } from '@bifold/core'
import { useCredentialById } from '@bifold/react-hooks'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DeviceEventEmitter } from 'react-native'

import { Credential, mapCredentialRecord } from '../credentials'
import { useHekaAgent } from '../utils/agent'
import { formatError } from '../utils/error'

// DIDComm credential offer: maps the exchange record, accepts or declines the offer.
export const useAriesCredentialOffer = (credentialId: string, { onDeclined }: { onDeclined: () => void }) => {
  const { t } = useTranslation()
  const credentialExchangeRecord = useCredentialById(credentialId)
  const { agent } = useHekaAgent()
  const { assertNetworkConnected } = useNetwork()

  const [isCredentialLoading, setIsCredentialLoading] = useState(false)
  const [credential, setCredential] = useState<Credential | undefined>()

  const [isAccepted, setIsAccepted] = useState(false)
  const [isDeclining, setIsDeclining] = useState(false)

  useEffect(() => {
    if (credential || !credentialExchangeRecord || !agent) return

    setIsCredentialLoading(true)
    mapCredentialRecord(credentialExchangeRecord, agent)
      .then((credential) => setCredential(credential))
      .catch((err: unknown) => {
        agent.config.logger.error('Failed to map the credential offer', {
          credentialExchangeRecordId: credentialExchangeRecord.id,
          error: formatError(err),
        })
        DeviceEventEmitter.emit(
          EventTypes.ERROR_ADDED,
          new BifoldError(t('Error.Title1033'), t('Error.Message1033'), (err as Error)?.message ?? err, 1033)
        )
      })
      .finally(() => setIsCredentialLoading(false))
  }, [agent, credentialExchangeRecord, credential, t])

  useEffect(() => {
    if (!agent) {
      DeviceEventEmitter.emit(
        EventTypes.ERROR_ADDED,
        new BifoldError(t('Error.Title1025'), t('Error.Message1025'), t('CredentialOffer.CredentialNotFound'), 1025)
      )
    }
  }, [t, agent])

  useEffect(() => {
    if (!credentialExchangeRecord) {
      DeviceEventEmitter.emit(
        EventTypes.ERROR_ADDED,
        new BifoldError(t('Error.Title1025'), t('Error.Message1025'), t('CredentialOffer.CredentialNotFound'), 1025)
      )
    }
  }, [t, credentialExchangeRecord])

  const accept = useCallback(async () => {
    if (!agent || !credential || !assertNetworkConnected()) return

    try {
      setIsAccepted(true)
      await agent.didcomm.credentials.acceptOffer({ credentialExchangeRecordId: credential.id })
    } catch (err: unknown) {
      setIsAccepted(false)
      const error = new BifoldError(t('Error.Title1024'), t('Error.Message1024'), (err as Error)?.message ?? err, 1024)
      DeviceEventEmitter.emit(EventTypes.ERROR_ADDED, error)
    }
  }, [agent, credential, assertNetworkConnected, t])

  const decline = useCallback(async () => {
    if (!agent || !credential) return

    try {
      setIsDeclining(true)
      await agent.didcomm.credentials.declineOffer({
        credentialExchangeRecordId: credential.id,
        sendProblemReport: true,
      })
    } catch (err: unknown) {
      await agent.didcomm.credentials.deleteById(credential.id)
    } finally {
      setIsDeclining(false)
      onDeclined()
    }
  }, [agent, credential, onDeclined])

  return {
    credential,
    isLoading: isCredentialLoading,
    isAccepted,
    isDeclining,
    accept,
    decline,
  }
}

import { BifoldError, EventTypes } from '@bifold/core'
import { useCredentialByState } from '@bifold/react-hooks'
import { DidCommConnectionRecord, DidCommCredentialState } from '@credo-ts/didcomm'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DeviceEventEmitter } from 'react-native'

import { useHekaAgent } from '../utils/agent'

interface ConnectionRemoval {
  hasCredentials: boolean
  isRemoving: boolean
  removeConnection: () => Promise<void>
}

/**
 * Deletes a DIDComm connection. `onRemoved` runs after a successful delete; a failure is reported
 * through the Bifold error event (1037).
 */
export function useConnectionRemoval(connection: DidCommConnectionRecord, onRemoved: () => void): ConnectionRemoval {
  const { agent } = useHekaAgent()
  const { t } = useTranslation()

  const [isRemoving, setIsRemoving] = useState(false)

  const receivedCredentials = useCredentialByState(DidCommCredentialState.CredentialReceived)
  const doneCredentials = useCredentialByState(DidCommCredentialState.Done)
  const hasCredentials = [...receivedCredentials, ...doneCredentials].some(
    (credential) => credential.connectionId === connection?.id
  )

  const removeConnection = useCallback(async () => {
    if (!(agent && connection)) {
      return
    }

    try {
      setIsRemoving(true)

      await agent.didcomm.connections.deleteById(connection.id)

      onRemoved()
    } catch (err: unknown) {
      const error = new BifoldError(t('Error.Title1037'), t('Error.Message1037'), (err as Error)?.message ?? err, 1037)
      DeviceEventEmitter.emit(EventTypes.ERROR_ADDED, error)
    } finally {
      setIsRemoving(false)
    }
  }, [agent, connection, onRemoved, t])

  return { hasCredentials, isRemoving, removeConnection }
}

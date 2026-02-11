import { AnonCredsCredentialMetadataKey } from '@credo-ts/anoncreds'
import { CredentialExchangeRecord, CredentialState } from '@credo-ts/core'
import { useAgent, useCredentialByState } from '@credo-ts/react-hooks'
import { usePrevious } from '@heka-wallet/shared'
import { TOKENS, useServices, useStore } from '@hyperledger/aries-bifold-core'
import { isEqual } from 'lodash'
import { useCallback, useEffect, useState } from 'react'

import { useSdJwtVcRecords, useW3cCredentialRecords } from '../contexts'

import { mapCredentialRecord } from './mappers'
import { Credential, CredentialRecord } from './types'

function compareCredentialRecordsByMostRecent(first: CredentialRecord, second: CredentialRecord): number {
  if (!first.createdAt && !second.createdAt) return 0
  else if (!first.createdAt) return -1
  else if (!second.createdAt) return 1

  return new Date(second.createdAt).valueOf() - new Date(first.createdAt).valueOf()
}

interface CredentialsState {
  credentials: Credential[]
  isLoading: boolean
}

export const useCredentials = (maxCount?: number): CredentialsState => {
  const { agent } = useAgent()

  const [store] = useStore()

  const [{ credentialHideList }] = useServices([TOKENS.CONFIG])

  const { w3cCredentialRecords, isLoading: isW3cCredentialsLoading } = useW3cCredentialRecords()
  const { sdJwtVcRecords, isLoading: isSdJwtCredentialsLoading } = useSdJwtVcRecords()

  const credentialExchangeRecords = useCredentialByState([CredentialState.CredentialReceived, CredentialState.Done])
  const previousCredentialExchangeRecords = usePrevious(credentialExchangeRecords)

  const [anoncredsCredentials, setAnoncredsCredentials] = useState(credentialExchangeRecords)

  // Workaround to avoid re-rendering on every update to CredentialExchange records (which cause array reference to change)
  // Example - new credential offers
  useEffect(() => {
    if (previousCredentialExchangeRecords && isEqual(credentialExchangeRecords, previousCredentialExchangeRecords)) {
      return
    }

    setAnoncredsCredentials(credentialExchangeRecords)
  }, [credentialExchangeRecords, previousCredentialExchangeRecords])

  const [credentials, setCredentials] = useState<Credential[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadCredentials = useCallback(async () => {
    if (!agent?.wallet.isInitialized || isW3cCredentialsLoading || isSdJwtCredentialsLoading) return

    setIsLoading(true)
    try {
      let anoncredsCredentialsToShow: CredentialExchangeRecord[] = anoncredsCredentials

      // Filter out hidden credentials when not in dev mode
      if (!store.preferences.developerModeEnabled) {
        anoncredsCredentialsToShow = anoncredsCredentials.filter((credential) => {
          const credDefId = credential.metadata?.get(AnonCredsCredentialMetadataKey)?.credentialDefinitionId
          return !credentialHideList?.includes(credDefId)
        })
      }

      // Extract W3C ids for Anoncreds credentials
      const w3cAnoncredsRecordIds = anoncredsCredentialsToShow.flatMap((record) =>
        record.credentials
          .filter((binding) => binding.credentialRecordType === 'w3c')
          .map((binding) => binding.credentialRecordId)
      )

      let credentialRecords: CredentialRecord[] = [
        ...anoncredsCredentialsToShow,
        // Filter W3C records that already presented by Anocreds (Credential exchange) records
        ...w3cCredentialRecords.filter((record) => !w3cAnoncredsRecordIds.includes(record.id)),
        ...sdJwtVcRecords,
      ]

      credentialRecords.sort(compareCredentialRecordsByMostRecent)

      if (maxCount) {
        credentialRecords = credentialRecords.slice(0, maxCount)
      }

      const credentialsData = await Promise.all(credentialRecords.map((record) => mapCredentialRecord(record, agent)))
      setCredentials(credentialsData)
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }, [
    agent,
    isSdJwtCredentialsLoading,
    isW3cCredentialsLoading,
    anoncredsCredentials,
    w3cCredentialRecords,
    sdJwtVcRecords,
    store.preferences.developerModeEnabled,
    credentialHideList,
    maxCount,
  ])

  useEffect(() => {
    loadCredentials()
  }, [loadCredentials])

  return { credentials, isLoading }
}

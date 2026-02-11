import {
  CredentialRepository,
  MdocRecord,
  MdocRepository,
  SdJwtVcRecord,
  SdJwtVcRepository,
  W3cCredentialRecord,
  W3cCredentialRepository,
} from '@credo-ts/core'
import { useAgent } from '@credo-ts/react-hooks'
import { useCallback } from 'react'

import { CredentialRecord } from './types'

export const useCredentialRecordHelpers = () => {
  const { agent } = useAgent()

  const storeCredentialRecord = useCallback(
    async (record: CredentialRecord) => {
      if (!agent) {
        throw new Error('Credo agent is not initialized')
      }

      if (record instanceof W3cCredentialRecord) {
        await agent.dependencyManager.resolve(W3cCredentialRepository).save(agent.context, record)
      } else if (record instanceof SdJwtVcRecord) {
        await agent.dependencyManager.resolve(SdJwtVcRepository).save(agent.context, record)
      } else if (record instanceof MdocRecord) {
        await agent.dependencyManager.resolve(MdocRepository).save(agent.context, record)
      } else {
        await agent.dependencyManager.resolve(CredentialRepository).save(agent.context, record)
      }
    },
    [agent]
  )

  const removeCredentialRecord = useCallback(
    async (record: CredentialRecord) => {
      if (!agent) {
        throw new Error('Credo agent is not initialized')
      }

      if (record instanceof W3cCredentialRecord) {
        await agent.w3cCredentials.removeCredentialRecord(record.id)
      } else if (record instanceof SdJwtVcRecord) {
        await agent.sdJwtVc.deleteById(record.id)
      } else if (record instanceof MdocRecord) {
        await agent.mdoc.deleteById(record.id)
      } else {
        await agent.credentials.deleteById(record.id)
      }
    },
    [agent]
  )

  return { storeCredentialRecord, removeCredentialRecord }
}

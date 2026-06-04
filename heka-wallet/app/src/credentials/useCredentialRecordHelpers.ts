import {
  MdocRecord,
  MdocRepository,
  SdJwtVcRecord,
  SdJwtVcRepository,
  W3cCredentialRecord,
  W3cCredentialRepository,
  W3cV2CredentialRecord,
  W3cV2CredentialRepository,
} from '@credo-ts/core'
import { DidCommCredentialExchangeRepository } from '@credo-ts/didcomm'
import { useCallback } from 'react'

import { useHekaAgent } from '../utils/agent'

import { CredentialRecord } from './types'

export const useCredentialRecordHelpers = () => {
  const { agent } = useHekaAgent()

  const storeCredentialRecord = useCallback(
    async (record: CredentialRecord) => {
      if (!agent) {
        throw new Error('Credo agent is not initialized')
      }

      if (record instanceof W3cCredentialRecord) {
        await agent.dependencyManager.resolve(W3cCredentialRepository).save(agent.context, record)
      } else if (record instanceof W3cV2CredentialRecord) {
        await agent.dependencyManager.resolve(W3cV2CredentialRepository).save(agent.context, record)
      } else if (record instanceof SdJwtVcRecord) {
        await agent.dependencyManager.resolve(SdJwtVcRepository).save(agent.context, record)
      } else if (record instanceof MdocRecord) {
        await agent.dependencyManager.resolve(MdocRepository).save(agent.context, record)
      } else {
        await agent.dependencyManager.resolve(DidCommCredentialExchangeRepository).save(agent.context, record)
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
        await agent.w3cCredentials.deleteById(record.id)
      } else if (record instanceof SdJwtVcRecord) {
        await agent.sdJwtVc.deleteById(record.id)
      } else if (record instanceof MdocRecord) {
        await agent.mdoc.deleteById(record.id)
      } else {
        await agent.didcomm.credentials.deleteById(record.id)
      }
    },
    [agent]
  )

  return { storeCredentialRecord, removeCredentialRecord }
}

import { CredentialMetadata, credentialCustomMetadata } from '@bifold/core'
import { DidCommCredentialExchangeRecord } from '@credo-ts/didcomm'
import { useCallback, useEffect, useState } from 'react'

import { Credential } from '../credentials'
import { useHekaAgent } from '../utils/agent'
import { formatError } from '../utils/error'

type RevocationNotification = NonNullable<DidCommCredentialExchangeRecord['revocationNotification']>

interface CredentialRevocationState {
  revocationNotification?: RevocationNotification
  isDetailDismissed: boolean
  dismissDetail: () => void
}

const getCustomMetadata = (record?: DidCommCredentialExchangeRecord): credentialCustomMetadata | undefined =>
  record?.metadata.get(CredentialMetadata.customMetadata) as credentialCustomMetadata | undefined

// Revocation notifications (DIDComm revocation notification v1/v2) are stored on the credential exchange record.
// Follows Bifold's CredentialDetails: opening the details marks the revocation as seen ('revoked_seen'), which removes
// the 'Credential revoked' notification, and the revocation message can be dismissed ('revoked_detail_dismissed').
export const useCredentialRevocation = (credential?: Credential): CredentialRevocationState => {
  const { agent } = useHekaAgent()

  const record = credential?.record instanceof DidCommCredentialExchangeRecord ? credential.record : undefined
  const revocationNotification = record?.revocationNotification

  const [isDetailDismissed, setIsDetailDismissed] = useState(!!getCustomMetadata(record)?.revoked_detail_dismissed)

  useEffect(() => {
    setIsDetailDismissed(!!getCustomMetadata(record)?.revoked_detail_dismissed)
  }, [record])

  const updateCustomMetadata = useCallback(
    async (patch: Partial<credentialCustomMetadata>) => {
      if (!record || !agent) return

      record.metadata.set(CredentialMetadata.customMetadata, { ...getCustomMetadata(record), ...patch })
      try {
        await agent.didcomm.credentials.update(record)
      } catch (err: unknown) {
        agent.config.logger.error('Failed to update the credential revocation metadata', {
          credentialId: record.id,
          error: formatError(err),
        })
      }
    },
    [agent, record]
  )

  useEffect(() => {
    if (!revocationNotification || getCustomMetadata(record)?.revoked_seen) return

    updateCustomMetadata({ revoked_seen: true })
  }, [record, revocationNotification, updateCustomMetadata])

  const dismissDetail = useCallback(() => {
    setIsDetailDismissed(true)
    updateCustomMetadata({ revoked_detail_dismissed: true })
  }, [updateCustomMetadata])

  return { revocationNotification, isDetailDismissed, dismissDetail }
}

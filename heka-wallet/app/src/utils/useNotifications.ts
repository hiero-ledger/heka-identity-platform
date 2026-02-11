import {
  CredentialExchangeRecord,
  CredentialExchangeRecord as CredentialRecord,
  CredentialState,
  ProofExchangeRecord,
  ProofState,
} from '@credo-ts/core'
import { useCredentialByState, useProofByState } from '@credo-ts/react-hooks'
import { credentialCustomMetadata, CredentialMetadata } from '@hyperledger/aries-bifold-core/App/types/metadata'
import { ProofCustomMetadata, ProofMetadata } from '@hyperledger/aries-bifold-verifier'
import { useEffect, useState } from 'react'

export type NotificationRecord = CredentialExchangeRecord | ProofExchangeRecord

// Based on Bifold hook: https://github.com/openwallet-foundation/bifold-wallet/blob/main/packages/legacy/core/App/hooks/notifications.ts
// The difference is removal of basic message records - we have chat section on home screen, so separate notifications on messages are redundant
export const useNotifications = (): NotificationRecord[] => {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([])

  const credsReceived = useCredentialByState(CredentialState.CredentialReceived)
  const credsDone = useCredentialByState(CredentialState.Done)
  const proofsDone = useProofByState([ProofState.Done, ProofState.PresentationReceived])
  const offers = useCredentialByState(CredentialState.OfferReceived)
  const proofsRequested = useProofByState(ProofState.RequestReceived)

  useEffect(() => {
    const validProofsDone = proofsDone.filter((proof: ProofExchangeRecord) => {
      if (proof.isVerified === undefined) return false
      const metadata = proof.metadata.get(ProofMetadata.customMetadata) as ProofCustomMetadata
      return !metadata?.details_seen
    })
    const revoked = credsDone.filter((cred: CredentialRecord) => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const metadata = cred!.metadata.get(CredentialMetadata.customMetadata) as credentialCustomMetadata
      if (cred?.revocationNotification && metadata?.revoked_seen == undefined) {
        return cred
      }
    })

    const notif = [...offers, ...proofsRequested, ...validProofsDone, ...revoked].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    setNotifications(notif)
  }, [credsReceived, proofsDone, proofsRequested, offers, credsDone])

  return notifications
}

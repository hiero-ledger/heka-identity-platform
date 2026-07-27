import { credentialCustomMetadata, CredentialMetadata } from '@bifold/core'
import { useCredentialByState, useProofByState } from '@bifold/react-hooks'
import { ProofCustomMetadata, ProofMetadata } from '@bifold/verifier'
import {
  DidCommCredentialExchangeRecord,
  DidCommCredentialExchangeRecord as CredentialRecord,
  DidCommCredentialState,
  DidCommProofExchangeRecord,
  DidCommProofState,
} from '@credo-ts/didcomm'
import { useMemo } from 'react'

export type NotificationRecord = DidCommCredentialExchangeRecord | DidCommProofExchangeRecord

// Based on Bifold hook: https://github.com/openwallet-foundation/bifold-wallet/blob/main/packages/legacy/core/App/hooks/notifications.ts
// The difference is removal of basic message records - we have chat section on home screen, so separate notifications on messages are redundant
export const useNotifications = (): NotificationRecord[] => {
  const credsDone = useCredentialByState(DidCommCredentialState.Done)
  const proofsDone = useProofByState([DidCommProofState.Done, DidCommProofState.PresentationReceived])
  const offers = useCredentialByState(DidCommCredentialState.OfferReceived)
  const proofsRequested = useProofByState(DidCommProofState.RequestReceived)

  return useMemo(() => {
    const validProofsDone = proofsDone.filter((proof: DidCommProofExchangeRecord) => {
      if (proof.isVerified === undefined) return false
      const metadata = proof.metadata.get(ProofMetadata.customMetadata) as ProofCustomMetadata
      return !metadata?.details_seen
    })
    const revoked = credsDone.filter((cred: CredentialRecord) => {
      const metadata = cred!.metadata.get(CredentialMetadata.customMetadata) as credentialCustomMetadata
      if (cred?.revocationNotification && metadata?.revoked_seen == undefined) {
        return cred
      }
    })

    return [...offers, ...proofsRequested, ...validProofsDone, ...revoked].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }, [proofsDone, proofsRequested, offers, credsDone])
}

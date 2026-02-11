import { AnonCredsRequestedAttributeMatch, AnonCredsRequestedPredicateMatch } from '@credo-ts/anoncreds'
import {
  DifPexInputDescriptorToCredentials,
  ProofFormatPayload,
  SdJwtVcRecord,
  W3cCredentialRecord,
} from '@credo-ts/core'
import { useAgent, useProofById } from '@credo-ts/react-hooks'
import { BifoldError, EventTypes } from '@hyperledger/aries-bifold-core'
import { useNetwork } from '@hyperledger/aries-bifold-core/App/contexts/network'
import {
  NotificationStackParams,
  Screens as BifoldScreens,
  TabStacks,
} from '@hyperledger/aries-bifold-core/App/types/navigators'
import { useNavigation } from '@react-navigation/native'
import { StackNavigationProp, StackScreenProps } from '@react-navigation/stack'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DeviceEventEmitter } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { PresentationRequestView } from '../components/views'
import LoadingView from '../components/views/LoadingView'
import {
  AnoncredsPresentationSubmission,
  mapAnoncredsProofExchangeRecord,
  PresentationSubmissionEntry,
  ProofExchangeFormatKeys,
} from '../credentials'

type Props = StackScreenProps<NotificationStackParams, BifoldScreens.ProofRequest>

export const AriesPresentationRequest: React.FC<Props> = ({ route }) => {
  if (!route?.params) {
    throw new Error('AriesPresentationRequest route prams were not set properly')
  }

  const { t } = useTranslation()

  const { proofId } = route.params
  const proofRequestRecord = useProofById(proofId)

  const { agent } = useAgent()

  const navigation = useNavigation<StackNavigationProp<NotificationStackParams>>()
  const { assertConnectedNetwork } = useNetwork()

  const [isPresentationSubmissionLoading, setIsPresentationSubmissionLoading] = useState(false)
  const [isShared, setIsShared] = useState(false)
  const [isDeclining, setIsDeclining] = useState(false)
  const [presentationSubmission, setPresentationSubmission] = useState<AnoncredsPresentationSubmission | undefined>()

  useEffect(() => {
    if (presentationSubmission || !agent) return

    setIsPresentationSubmissionLoading(true)
    mapAnoncredsProofExchangeRecord(proofRequestRecord!, agent)
      .then((presentationSubmission) => setPresentationSubmission(presentationSubmission))
      .finally(() => setIsPresentationSubmissionLoading(false))
  }, [agent, proofRequestRecord, presentationSubmission])

  useEffect(() => {
    if (!agent) {
      DeviceEventEmitter.emit(
        EventTypes.ERROR_ADDED,
        new BifoldError(t('Error.Title1027'), t('Error.Message1027'), t('ProofRequest.ProofRequestNotFound'), 1027)
      )
    }
  }, [t, agent])

  useEffect(() => {
    if (!proofRequestRecord) {
      DeviceEventEmitter.emit(
        EventTypes.ERROR_ADDED,
        new BifoldError(t('Error.Title1027'), t('Error.Message1027'), t('ProofRequest.ProofRequestNotFound'), 1027)
      )
    }
  }, [t, proofRequestRecord])

  const removeOneTimeConnectionIfNeeded = async () => {
    if (!agent || !presentationSubmission) return

    const { connectionId } = presentationSubmission.proofExchangeRecord

    if (connectionId && presentationSubmission.outOfBandGoalCode?.endsWith('verify.once')) {
      await agent.connections.deleteById(connectionId)
    }
  }

  const onAccept = async () => {
    if (!agent || !presentationSubmission || !assertConnectedNetwork()) {
      return
    }

    try {
      setIsShared(true)

      let formatInput: ProofFormatPayload<[], 'acceptRequest'>

      if (presentationSubmission.formatKey === ProofExchangeFormatKeys.PresentationExchange) {
        const selectedCredentials = presentationSubmission.entries.reduce<DifPexInputDescriptorToCredentials>(
          (result, entry) => {
            result[entry.inputDescriptorId] = [
              entry.selectedOption!.credential.record as W3cCredentialRecord | SdJwtVcRecord,
            ]
            return result
          },
          {}
        )

        formatInput = {
          [presentationSubmission.formatKey]: {
            credentials: selectedCredentials,
          },
        }
      } else {
        const selectedCredentials = presentationSubmission.entries.reduce<Record<string, string>>((result, entry) => {
          result[entry.inputDescriptorId] = entry.selectedOption!.credential.id
          return result
        }, {})

        const selectedAttributes: Record<string, AnonCredsRequestedAttributeMatch> = {}
        const selectedPredicates: Record<string, AnonCredsRequestedPredicateMatch> = {}

        for (const [inputDescriptorId, entry] of Array.from(
          presentationSubmission.entriesWithAnoncredsMatches.entries()
        )) {
          const credentialId = selectedCredentials[inputDescriptorId]
          const match = entry.matches.find((match) => match.credentialId === credentialId) ?? entry.matches[0]

          for (const groupName of entry.groupNames.attributes) {
            selectedAttributes[groupName] = {
              ...match,
              revealed: true,
            }
          }

          for (const groupName of entry.groupNames.predicates) {
            selectedPredicates[groupName] = match
          }
        }

        formatInput = {
          [presentationSubmission.formatKey]: {
            attributes: selectedAttributes,
            predicates: selectedPredicates,
            selfAttestedAttributes: {},
          },
        }
      }

      await agent.proofs.acceptRequest({
        proofRecordId: presentationSubmission.proofExchangeRecord.id,
        proofFormats: formatInput,
      })

      removeOneTimeConnectionIfNeeded()
    } catch (err: unknown) {
      setIsShared(false)
      const error = new BifoldError(t('Error.Title1024'), t('Error.Message1024'), (err as Error)?.message ?? err, 1024)
      DeviceEventEmitter.emit(EventTypes.ERROR_ADDED, error)
    }
  }

  const onDecline = async () => {
    if (!agent || !proofRequestRecord) return

    try {
      setIsDeclining(true)
      await agent.proofs.declineRequest({ proofRecordId: proofRequestRecord.id, sendProblemReport: true })

      removeOneTimeConnectionIfNeeded()

      navigation.getParent()?.navigate(TabStacks.HomeStack, { screen: BifoldScreens.Home })
    } catch (err: unknown) {
      await agent.proofs.deleteById(proofRequestRecord.id)
    } finally {
      setIsDeclining(false)
    }
  }

  const setSubmissionEntries = useCallback((entries: PresentationSubmissionEntry[]) => {
    setPresentationSubmission((submission) => ({ ...submission!, entries }))
  }, [])

  if (isPresentationSubmissionLoading || !presentationSubmission || isDeclining) {
    return <LoadingView />
  }

  return (
    <SafeAreaView style={{ flexGrow: 1 }} edges={['bottom', 'left', 'right']}>
      <PresentationRequestView
        presentationSubmission={presentationSubmission}
        onAccept={onAccept}
        onDecline={onDecline}
        setSubmissionEntries={setSubmissionEntries}
        isShared={isShared}
      />
    </SafeAreaView>
  )
}

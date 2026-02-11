import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import { Button, ButtonType } from '@hyperledger/aries-bifold-core'
import { NotificationStackParams as BifoldNotificationStackParams } from '@hyperledger/aries-bifold-core/App/types/navigators'
import { Attribute } from '@hyperledger/aries-oca/build/legacy'
import { useNavigation } from '@react-navigation/native'
import { StackNavigationProp } from '@react-navigation/stack'
import React, { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, ScrollView, StyleSheet, View } from 'react-native'

import {
  AnoncredsPresentationSubmission,
  OpenIdPresentationSubmission,
  PresentationSubmissionEntry,
  PresentationSubmissionType,
} from '../../credentials'
import { OpenIdStackParams, Screens, Stacks } from '../../navigators/types'
import { CredentialCard, SectionCard } from '../cards'
import { Record } from '../misc'
import { ExternalPartyDisplay } from '../misc/ExternalPartyDisplay'
import { ProofRequestAcceptModal } from '../modals'
import ActionWarningModal, { ModalUsage } from '../modals/ActionWarningModal'

const useStyles = ({ Spacing }: HekaTheme) =>
  StyleSheet.create({
    container: {
      gap: Spacing.xs,
    },
    buttonsContainer: {
      marginTop: 'auto',
      padding: Spacing.xl,
      gap: Spacing.sm,
    },
    credentialsContainer: {
      gap: Spacing.md,
    },
  })

interface Props {
  presentationSubmission: OpenIdPresentationSubmission | AnoncredsPresentationSubmission
  setSubmissionEntries: (entries: PresentationSubmissionEntry[]) => void
  onAccept: () => Promise<void>
  onDecline: () => void
  isShared?: boolean
}

export const PresentationRequestView: React.FC<Props> = ({
  presentationSubmission,
  setSubmissionEntries,
  onAccept,
  onDecline,
  isShared,
}) => {
  const { t } = useTranslation()

  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const navigation = useNavigation<StackNavigationProp<OpenIdStackParams | BifoldNotificationStackParams>>()

  const [isDeclineModalVisible, setIsDeclineModalVisible] = useState(false)

  const changeSelectedCredential = useCallback(
    (inputDescriptorId: string, credentialId: string) => {
      const updatedEntries = presentationSubmission?.entries.length ? [...presentationSubmission.entries] : []

      const entryToUpdate = updatedEntries.find((entry) => entry.inputDescriptorId === inputDescriptorId)
      if (!entryToUpdate) {
        throw new Error('Presentation submission entry is not found')
      }

      const selectedOption = entryToUpdate.submissionOptions.find((option) => option.credential.id === credentialId)
      if (!selectedOption) {
        throw new Error('Selected credential option is not found')
      }

      entryToUpdate.selectedOption = selectedOption

      setSubmissionEntries(updatedEntries)
    },
    [presentationSubmission.entries, setSubmissionEntries]
  )

  const onCredentialChangePress = useCallback(
    (entry: PresentationSubmissionEntry) => {
      navigation.getParent()?.navigate(Stacks.OpenIdStack, {
        screen: Screens.PresentationCredentialChange,
        params: {
          inputDescriptorId: entry.inputDescriptorId,
          selectedCredentialId: entry.selectedOption!.credential.id,
          submissionOptions: entry.submissionOptions,
          onCredentialChange: changeSelectedCredential,
        },
      })
    },
    [navigation, changeSelectedCredential]
  )

  const submissionEntriesToDisplay = useMemo(
    () =>
      presentationSubmission?.areAllSatisfied
        ? presentationSubmission.entries.filter((it) => !!it.selectedOption)
        : presentationSubmission.entries.filter((it) => !it.selectedOption),
    [presentationSubmission]
  )

  const isProofExchange = presentationSubmission.type === PresentationSubmissionType.ProofExchange
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <SectionCard title={t('Global.Verifier')}>
        <ExternalPartyDisplay
          label={presentationSubmission.verifierName ?? t('Credentials.UnknownVerifier')}
          logoUrl={presentationSubmission.verifierLogoUrl}
          interactionDate={new Date()}
        />
      </SectionCard>
      <SectionCard title={t('ProofRequest.RequestedInformation')}>
        <FlatList
          data={submissionEntriesToDisplay}
          contentContainerStyle={styles.credentialsContainer}
          scrollEnabled={false}
          renderItem={({ item: entry }) => {
            const hasAltCredentials = entry.submissionOptions.length > 1

            let attributesToDisplay = entry.selectedOption?.requestedAttributes

            if (!attributesToDisplay && isProofExchange) {
              const requestedAttributesNames = presentationSubmission.entriesWithAnoncredsMatches.get(
                entry.inputDescriptorId
              )?.requestedAttributes

              if (requestedAttributesNames) {
                attributesToDisplay = Array.from(requestedAttributesNames).map(
                  (attribute) => new Attribute({ name: attribute, value: '' })
                )
              }
            }

            return (
              <Record
                fields={attributesToDisplay ?? []}
                error={!entry.isSatisfied}
                header={() => (
                  <CredentialCard
                    credentialDisplay={entry.selectedOption?.credential.display}
                    requestedCredentialName={entry.name}
                    showActionButton={hasAltCredentials}
                    actionButtonTitle={t('ProofRequest.ChangeCredential')}
                    onActionButtonPress={hasAltCredentials ? () => onCredentialChangePress(entry) : undefined}
                  />
                )}
              />
            )
          }}
        />
      </SectionCard>
      <View style={styles.buttonsContainer}>
        <Button
          title={t('Global.Decline')}
          accessibilityLabel={t('Global.Decline')}
          buttonType={ButtonType.SecondaryCritical}
          onPress={() => setIsDeclineModalVisible(true)}
          disabled={isShared}
        />
        {presentationSubmission.areAllSatisfied && (
          <Button
            title={t('Global.Share')}
            accessibilityLabel={t('Global.Share')}
            buttonType={ButtonType.Primary}
            onPress={onAccept}
            disabled={isShared}
          />
        )}
      </View>
      <ProofRequestAcceptModal
        proofId={isProofExchange ? presentationSubmission.proofExchangeRecord.id : undefined}
        visible={isShared}
      />
      <ActionWarningModal
        usage={ModalUsage.ProofRequestDecline}
        visible={isDeclineModalVisible}
        onSubmit={onDecline}
        onCancel={() => setIsDeclineModalVisible(false)}
      />
    </ScrollView>
  )
}

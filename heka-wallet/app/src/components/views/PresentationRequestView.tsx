import { Button, ButtonType, NotificationStackParams as BifoldNotificationStackParams } from '@bifold/core'
import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import { useNavigation } from '@react-navigation/native'
import { StackNavigationProp } from '@react-navigation/stack'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, ScrollView, StyleSheet, View } from 'react-native'

import {
  AnoncredsPresentationSubmission,
  OpenIdPresentationSubmission,
  PresentationSubmissionEntry,
  PresentationSubmissionType,
} from '../../credentials'
import { usePresentationSubmissionEntries } from '../../hooks/usePresentationSubmissionEntries'
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

  const { entriesToDisplay, changeSelectedCredential } = usePresentationSubmissionEntries(
    presentationSubmission,
    setSubmissionEntries
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
          data={entriesToDisplay}
          contentContainerStyle={styles.credentialsContainer}
          scrollEnabled={false}
          renderItem={({ item: { entry, attributes, hasAltCredentials } }) => (
            <Record
              fields={attributes}
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
          )}
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

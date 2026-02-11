import { CredentialExchangeRecord } from '@credo-ts/core'
import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import { Button, ButtonType } from '@hyperledger/aries-bifold-core'
import { useNavigation } from '@react-navigation/native'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, View } from 'react-native'

import { Credential } from '../../credentials'
import { CredentialCard, SectionCard } from '../cards'
import { Record } from '../misc'
import { ExternalPartyDisplay } from '../misc/ExternalPartyDisplay'
import { CredentialOfferAcceptModal } from '../modals'
import ActionWarningModal, { ModalUsage } from '../modals/ActionWarningModal'

const useStyles = ({ Spacing }: HekaTheme) =>
  StyleSheet.create({
    container: {
      gap: Spacing.xs,
    },
    buttonsContainer: {
      padding: Spacing.xl,
      gap: Spacing.sm,
    },
  })

interface Props {
  credential: Credential
  onAccept: () => Promise<void>
  onDecline: () => void
  isAccepted?: boolean
  isUseBackAsDecline?: boolean
}

export const CredentialOfferView: React.FC<Props> = ({
  credential,
  onAccept,
  onDecline,
  isAccepted,
  isUseBackAsDecline,
}) => {
  const { t } = useTranslation()

  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const [isDeclineModalVisible, setIsDeclineModalVisible] = useState(false)

  const isCredentialExchange = credential.record instanceof CredentialExchangeRecord

  const navigation = useNavigation()

  // When hit back button(also hardware), show decline dialog
  // Configured for OpenID Credentials, see OpenIdCredentialOffer
  useEffect(() => {
    if (!isUseBackAsDecline || isAccepted) return
    return navigation.addListener('beforeRemove', (e) => {
      e.preventDefault()
      setIsDeclineModalVisible(true)
    })
  }, [navigation, isUseBackAsDecline, isAccepted])

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <SectionCard title={t('Global.Issuer')}>
        <ExternalPartyDisplay
          label={credential.display.issuer.name}
          logoUrl={credential.display.issuer.logo?.url}
          interactionDate={credential.record.createdAt}
          backgroundColor={credential.display.issuer.backgroundColor}
        />
      </SectionCard>
      <SectionCard title={t('Credentials.Credential')}>
        <Record
          fields={credential.display.attributes || []}
          header={() => <CredentialCard credentialDisplay={credential.display} />}
        />
      </SectionCard>
      <View style={styles.buttonsContainer}>
        <Button
          title={t('Global.Decline')}
          accessibilityLabel={t('Global.Decline')}
          buttonType={ButtonType.SecondaryCritical}
          onPress={() => setIsDeclineModalVisible(true)}
          disabled={isAccepted}
        />
        <Button
          title={t('Global.Accept')}
          accessibilityLabel={t('Global.Accept')}
          buttonType={ButtonType.Primary}
          onPress={onAccept}
          disabled={isAccepted}
        />
      </View>
      <CredentialOfferAcceptModal
        credentialId={isCredentialExchange ? credential.id : undefined}
        visible={isAccepted}
        name={credential.display.name}
        issuer={credential.display.issuer.name}
      />
      <ActionWarningModal
        usage={ModalUsage.CredentialOfferDecline}
        visible={isDeclineModalVisible}
        onSubmit={onDecline}
        onCancel={() => setIsDeclineModalVisible(false)}
      />
    </ScrollView>
  )
}

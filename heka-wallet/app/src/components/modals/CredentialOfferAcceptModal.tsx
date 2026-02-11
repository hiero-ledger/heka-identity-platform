import { CredentialState } from '@credo-ts/core'
import { useCredentialById } from '@credo-ts/react-hooks'
import { ColorPallet, HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import { Button, ButtonType, TabStacks as BifoldTabStacks } from '@hyperledger/aries-bifold-core'
import { Stacks as BifoldStacks } from '@hyperledger/aries-bifold-core/App/types/navigators'
import { useNavigation } from '@react-navigation/native'
import { StackNavigationProp } from '@react-navigation/stack'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import CarImage from '../../assets/car.svg'
import { RootStackParams, Stacks } from '../../navigators/types'
import { Loader } from '../views/LoadingView'

const useStyles = ({ TextTheme, Spacing }: HekaTheme) =>
  StyleSheet.create({
    container: {
      height: '100%',
      padding: Spacing.lg,
      paddingTop: 100,
    },
    pendingOfferBackground: {
      backgroundColor: ColorPallet.brand.modalPrimaryBackground,
    },
    completedOfferBackground: {
      backgroundColor: ColorPallet.brand.brandedSecondary,
    },
    image: {
      minHeight: 240,
      alignItems: 'center',
    },
    messageContainer: {
      marginTop: Spacing.lg,
      alignItems: 'center',
    },
    messageText: {
      textAlign: 'left',
      ...TextTheme.headingOne,
    },
    messageTextSecondary: {
      marginTop: Spacing.sm,
      textAlign: 'left',
      ...TextTheme.caption,
    },
    controlsContainer: {
      marginTop: 'auto',
      margin: Spacing.lg,
    },
  })

interface Props {
  visible?: boolean
  credentialId?: string
  name?: string
  issuer?: string
}

// Based on Bifold component: https://github.com/openwallet-foundation/bifold-wallet/blob/main/packages/legacy/core/App/screens/CredentialOfferAccept.tsx
export const CredentialOfferAcceptModal: React.FC<Props> = ({
  visible,
  credentialId: credentialExchangeRecordId,
  name,
  issuer,
}) => {
  const { t } = useTranslation()

  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const navigation = useNavigation<StackNavigationProp<RootStackParams>>()

  const credentialRecord = useCredentialById(credentialExchangeRecordId ?? '')

  // If there is nothing to track (no credentialId/credentialRecord provided), we can assume that proof has already been sent (OpenId4Vc flow)
  const [isCompleted, setIsCompleted] = useState(!credentialRecord)

  useEffect(() => {
    if (!credentialRecord) return

    if (
      credentialRecord.state === CredentialState.CredentialReceived ||
      credentialRecord.state === CredentialState.Done
    ) {
      setIsCompleted(true)
    }
  }, [credentialRecord])

  const navigateToHome = useCallback(() => {
    navigation.navigate(Stacks.BifoldStack, {
      screen: BifoldStacks.TabStack,
      params: { screen: BifoldTabStacks.HomeStack },
    })
  }, [navigation])

  return (
    <Modal visible={visible} transparent={true} animationType={'none'}>
      {isCompleted ? (
        <SafeAreaView style={styles.completedOfferBackground}>
          <StatusBar backgroundColor={theme.ColorPallet.brand.brandedSecondary} />
          <ScrollView style={styles.container}>
            <View style={styles.image}>
              <CarImage />
            </View>
            <View style={styles.messageContainer}>
              <Text style={styles.messageText}>{t('CredentialOffer.CredentialAddedToYourWallet')}</Text>
              <Text style={styles.messageTextSecondary}>
                {name}. {t('CredentialOffer.IssuedBy')} {issuer}.
              </Text>
            </View>
          </ScrollView>
          <View style={styles.controlsContainer}>
            <Button
              title={t('Global.Done')}
              accessibilityLabel={t('Global.Done')}
              onPress={navigateToHome}
              buttonType={ButtonType.ModalPrimary}
            />
          </View>
        </SafeAreaView>
      ) : (
        <SafeAreaView style={styles.pendingOfferBackground}>
          <ScrollView style={styles.container}>
            <View style={styles.image}>
              <Loader />
            </View>
            <View style={styles.messageContainer}>
              <Text style={styles.messageText}>{t('CredentialOffer.CredentialOnTheWay')}</Text>
            </View>
          </ScrollView>
          <View style={styles.controlsContainer}>
            <Button
              title={t('Loading.GoBack')}
              accessibilityLabel={t('Loading.BackToHome')}
              onPress={() => navigation.goBack()}
              buttonType={ButtonType.ModalSecondary}
            />
          </View>
        </SafeAreaView>
      )}
    </Modal>
  )
}

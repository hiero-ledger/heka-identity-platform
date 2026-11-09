import {
  Button,
  ButtonType,
  TabStacks as BifoldTabStacks,
  Stacks as BifoldStacks,
  SafeAreaModal,
  testIdWithKey,
} from '@bifold/core'
import { useCredentialById } from '@bifold/react-hooks'
import { DidCommCredentialState } from '@credo-ts/didcomm'
import { ColorPalette, HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import { useNavigation } from '@react-navigation/native'
import { StackNavigationProp } from '@react-navigation/stack'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import CarImage from '../../assets/car.svg'
import { RootStackParams, Stacks } from '../../navigators/types'
import { Loader } from '../views/LoadingView'

const useStyles = ({ TextTheme, Spacing }: HekaTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      padding: Spacing.lg,
      paddingTop: 100,
    },
    pendingOfferBackground: {
      flex: 1,
      backgroundColor: ColorPalette.brand.modalPrimaryBackground,
    },
    completedOfferBackground: {
      flex: 1,
      backgroundColor: ColorPalette.brand.brandedSecondary,
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
      credentialRecord.state === DidCommCredentialState.CredentialReceived ||
      credentialRecord.state === DidCommCredentialState.Done
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

  const goBack = useCallback(() => navigation.goBack(), [navigation])

  const view = isCompleted
    ? {
        background: styles.completedOfferBackground,
        message: t('CredentialOffer.CredentialAddedToYourWallet'),
        buttonTitle: t('Global.Done'),
        buttonLabel: t('Global.Done'),
        onPress: navigateToHome,
        buttonType: ButtonType.ModalPrimary,
        testID: testIdWithKey('CredentialOfferDone'),
      }
    : {
        background: styles.pendingOfferBackground,
        message: t('CredentialOffer.CredentialOnTheWay'),
        buttonTitle: t('Loading.GoBack'),
        buttonLabel: t('Loading.BackToHome'),
        onPress: goBack,
        buttonType: ButtonType.ModalSecondary,
        testID: undefined,
      }

  return (
    <SafeAreaModal visible={visible} transparent={true} animationType={'none'}>
      <SafeAreaView edges={['bottom', 'left', 'right']} style={view.background}>
        {isCompleted && <StatusBar backgroundColor={theme.ColorPalette.brand.brandedSecondary} />}
        <ScrollView style={styles.container}>
          <View style={styles.image}>{isCompleted ? <CarImage /> : <Loader />}</View>
          <View style={styles.messageContainer}>
            <Text style={styles.messageText}>{view.message}</Text>
            {isCompleted && (
              <Text style={styles.messageTextSecondary}>
                {name}. {t('CredentialOffer.IssuedBy')} {issuer}.
              </Text>
            )}
          </View>
        </ScrollView>
        <View style={styles.controlsContainer}>
          <Button
            title={view.buttonTitle}
            accessibilityLabel={view.buttonLabel}
            testID={view.testID}
            onPress={view.onPress}
            buttonType={view.buttonType}
          />
        </View>
      </SafeAreaView>
    </SafeAreaModal>
  )
}

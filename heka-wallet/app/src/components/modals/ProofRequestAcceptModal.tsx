import { ProofState } from '@credo-ts/core'
import { useProofById } from '@credo-ts/react-hooks'
import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import { Button, ButtonType, Screens as BifoldScreens, Stacks as BifoldStacks } from '@hyperledger/aries-bifold-core'
import { useNavigation } from '@react-navigation/native'
import { StackNavigationProp } from '@react-navigation/stack'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import TrainImage from '../../assets/train.svg'
import { RootStackParams, Stacks } from '../../navigators/types'
import { Loader } from '../views/LoadingView'

const useStyles = ({ ColorPallet, TextTheme, Spacing }: HekaTheme) =>
  StyleSheet.create({
    container: {
      height: '100%',
      padding: Spacing.lg,
      paddingTop: 100,
    },
    pendingBackground: {
      backgroundColor: ColorPallet.brand.modalPrimaryBackground,
    },
    completedBackground: {
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
    controlsContainer: {
      marginTop: 'auto',
      margin: Spacing.lg,
    },
  })

interface Props {
  visible?: boolean
  proofId?: string
}

// Based on Bifold component: https://github.com/openwallet-foundation/bifold-wallet/blob/main/packages/legacy/core/App/screens/ProofRequestAccept.tsx
export const ProofRequestAcceptModal: React.FC<Props> = ({ visible, proofId }) => {
  const { t } = useTranslation()

  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const navigation = useNavigation<StackNavigationProp<RootStackParams>>()

  const proofRecord = useProofById(proofId ?? '')

  // If there is nothing to track (no proofId/proofRecord provided), we can assume that proof has already been sent (OpenId4Vc flow)
  const [isCompleted, setIsCompleted] = useState(!proofRecord)

  const navigateToHome = () => {
    navigation.navigate(Stacks.BifoldStack, {
      screen: BifoldStacks.TabStack,
      params: { screen: BifoldScreens.Home },
    })
  }

  useEffect(() => {
    if (!proofRecord) return

    if (proofRecord.state === ProofState.Done || proofRecord.state === ProofState.PresentationSent) {
      setIsCompleted(true)
    }
  }, [proofRecord])

  return (
    <Modal visible={visible} transparent={true} animationType={'slide'}>
      {isCompleted ? (
        <SafeAreaView style={styles.completedBackground}>
          <StatusBar backgroundColor={theme.ColorPallet.brand.brandedSecondary} />
          <ScrollView style={styles.container}>
            <View style={styles.image}>
              <TrainImage />
            </View>
            <View style={styles.messageContainer}>
              <Text style={styles.messageText}>{t('ProofRequest.PresentationAccepted')}</Text>
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
        <SafeAreaView style={styles.pendingBackground}>
          <ScrollView style={styles.container}>
            <View style={styles.image}>
              <Loader />
            </View>
            <View style={styles.messageContainer}>
              <Text style={styles.messageText}>{t('ProofRequest.PresentationOnTheWay')}</Text>
            </View>
          </ScrollView>
          <View style={styles.controlsContainer}>
            <Button
              title={t('Loading.GoBack')}
              accessibilityLabel={t('Loading.BackToHome')}
              onPress={navigateToHome}
              buttonType={ButtonType.ModalSecondary}
            />
          </View>
        </SafeAreaView>
      )}
    </Modal>
  )
}

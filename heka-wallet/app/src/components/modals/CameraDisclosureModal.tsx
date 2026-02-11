import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import { Button, ButtonType, Screens, TabStacks } from '@hyperledger/aries-bifold-core'
import DismissiblePopupModal from '@hyperledger/aries-bifold-core/App/components/modals/DismissiblePopupModal'
import { HomeStackParams } from '@hyperledger/aries-bifold-core/App/types/navigators'
import { useNavigation } from '@react-navigation/native'
import { StackNavigationProp } from '@react-navigation/stack'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, ScrollView, StyleSheet, Text, View, Linking } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const useStyles = ({ ColorPallet, Spacing }: HekaTheme) =>
  StyleSheet.create({
    container: {
      height: '100%',
      backgroundColor: ColorPallet.brand.modalPrimaryBackground,
      padding: Spacing.lg,
      gap: Spacing.xxl,
    },
    controlsContainer: {
      backgroundColor: ColorPallet.brand.modalPrimaryBackground,
      marginTop: 'auto',
      margin: Spacing.lg,
      gap: Spacing.sm,
    },
  })

interface CameraDisclosureModalProps {
  requestCameraUse: () => Promise<boolean>
}

const CameraDisclosureModal: React.FC<CameraDisclosureModalProps> = ({ requestCameraUse }) => {
  const { t } = useTranslation()
  const navigation = useNavigation<StackNavigationProp<HomeStackParams>>()
  const [modalVisible, setModalVisible] = useState(true)
  const [showSettingsPopup, setShowSettingsPopup] = useState(false)
  const [requestInProgress, setRequestInProgress] = useState(false)
  const theme = useHekaTheme()

  const styles = useStyles(theme)

  const onContinueTouched = async () => {
    setRequestInProgress(true)
    const granted = await requestCameraUse()
    if (!granted) {
      setShowSettingsPopup(true)
    }
    setRequestInProgress(false)
  }

  const onOpenSettingsTouched = async () => {
    setModalVisible(false)
    await Linking.openSettings()
    navigation.getParent()?.navigate(TabStacks.HomeStack, { screen: Screens.Home })
  }

  const onNotNowTouched = () => {
    setModalVisible(false)
    navigation.getParent()?.navigate(TabStacks.HomeStack, { screen: Screens.Home })
  }

  const onOpenSettingsDismissed = () => {
    setShowSettingsPopup(false)
  }

  return (
    <Modal visible={modalVisible} animationType={'slide'} supportedOrientations={['portrait', 'landscape']} transparent>
      {showSettingsPopup && (
        <DismissiblePopupModal
          title={t('CameraDisclosure.AllowCameraUse')}
          description={t('CameraDisclosure.ToContinueUsing')}
          onCallToActionLabel={t('CameraDisclosure.OpenSettings')}
          onCallToActionPressed={onOpenSettingsTouched}
          onDismissPressed={onOpenSettingsDismissed}
        />
      )}
      <SafeAreaView>
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={theme.TextTheme.modalHeadingOne}>{t('CameraDisclosure.AllowCameraUse')}</Text>
          <Text style={theme.TextTheme.modalNormal}>{t('CameraDisclosure.CameraDisclosure')}</Text>
          <Text style={theme.TextTheme.modalNormal}>{t('CameraDisclosure.ToContinueUsing')}</Text>
        </ScrollView>
        <View style={styles.controlsContainer}>
          <Button
            title={t('Global.NotNow')}
            accessibilityLabel={t('Global.NotNow')}
            testID={'NotNow'}
            onPress={onNotNowTouched}
            buttonType={ButtonType.ModalSecondary}
          />
          <Button
            title={t('Global.Continue')}
            accessibilityLabel={t('Global.Continue')}
            testID={'Continue'}
            onPress={onContinueTouched}
            buttonType={ButtonType.ModalPrimary}
            disabled={requestInProgress}
          />
        </View>
      </SafeAreaView>
    </Modal>
  )
}

export default CameraDisclosureModal

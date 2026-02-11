import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import ScanCamera from '@hyperledger/aries-bifold-core/App/components/misc/ScanCamera'
import { hitSlop } from '@hyperledger/aries-bifold-core/App/constants'
import { QrCodeScanError } from '@hyperledger/aries-bifold-core/App/types/error'
import { useNavigation } from '@react-navigation/native'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View, Pressable, StyleSheet, Text } from 'react-native'
import Icon from 'react-native-vector-icons/MaterialCommunityIcons'

import CloseIcon from '../../assets/close.svg'
import { AlertModal } from '../modals'

interface Props {
  handleCodeScan: (value: string) => Promise<void>
  error?: QrCodeScanError | null
  enableCameraOnError?: boolean
}

const useStyles = (theme: HekaTheme) => {
  const { ColorPallet, TextTheme } = theme

  return StyleSheet.create({
    container: {
      flex: 1,
    },
    viewFinderContainer: {
      flexGrow: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    viewFinder: {
      width: 250,
      height: 250,
      borderRadius: 24,
      borderWidth: 2,
      borderColor: ColorPallet.grayscale.white,
    },
    errorMessageContainer: {
      marginHorizontal: 40,
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'center',
      paddingBottom: 30,
    },
    icon: {
      color: ColorPallet.grayscale.white,
      padding: 4,
    },
    closeIcon: {
      zIndex: 10000,
      position: 'absolute',
      top: 32,
      right: 24,
    },
    errorText: {
      ...TextTheme.title,
      color: 'white',
      marginHorizontal: 10,
      textAlign: 'left',
    },
  })
}

const QRScanner: React.FC<Props> = ({ handleCodeScan, error, enableCameraOnError }) => {
  const navigation = useNavigation()
  const { t } = useTranslation()

  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const [showErrorDetailsModal, setShowErrorDetailsModal] = useState(false)

  const onClose = useCallback(() => navigation.goBack(), [navigation])

  return (
    <View style={styles.container}>
      <CloseIcon style={styles.closeIcon} onPress={onClose} />
      <ScanCamera handleCodeScan={handleCodeScan} error={error} enableCameraOnError={enableCameraOnError} />
      <View style={styles.viewFinderContainer}>
        <View style={styles.viewFinder} />
      </View>
      <View style={styles.errorMessageContainer}>
        {error && (
          <>
            <Text style={styles.errorText}>{error.message}</Text>
            <Pressable
              onPress={() => setShowErrorDetailsModal(true)}
              accessibilityLabel={t('Scan.ShowDetails')}
              accessibilityRole={'button'}
              hitSlop={hitSlop}
            >
              <Icon name="information-outline" size={40} style={styles.icon} />
            </Pressable>
          </>
        )}
        <AlertModal
          title={t('Scan.ErrorDetails')}
          description={error?.details || t('Scan.NoDetails')}
          visible={showErrorDetailsModal}
          onCancel={() => setShowErrorDetailsModal(false)}
          buttonTitle={t('Global.Dismiss')}
        />
      </View>
    </View>
  )
}

export default QRScanner

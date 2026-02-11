import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import { Button, ButtonType, GenericFn } from '@hyperledger/aries-bifold-core'
import { hitSlop } from '@hyperledger/aries-bifold-core/App/constants'
import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Dialog, Portal } from 'react-native-paper'
import { SafeAreaView } from 'react-native-safe-area-context'
import Icon from 'react-native-vector-icons/MaterialIcons'

interface ModalProps {
  title: string
  description?: string
  buttonTitle?: string
  onCancel: GenericFn
  onAccept?: GenericFn
  visible: boolean
}

const useStyles = ({ ColorPallet, TextTheme, BorderRadius, Spacing, IconSizes }: HekaTheme) =>
  StyleSheet.create({
    dialog: {
      backgroundColor: ColorPallet.brand.modalPrimaryBackground,
      borderRadius: BorderRadius.bigger,
      paddingHorizontal: Spacing.lg,
    },
    contentContainer: {
      gap: Spacing.lg,
    },
    iconContainer: {
      position: 'absolute',
      top: 0,
      right: 0,
      height: IconSizes.large,
      width: IconSizes.large,
      borderRadius: BorderRadius.medium,
      backgroundColor: ColorPallet.brand.primaryBackground,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeIcon: {
      color: ColorPallet.brand.modalIcon,
    },
    titleContainer: {
      paddingRight: Spacing.xxxl,
    },
    title: TextTheme.modalTitle,
    bodyText: TextTheme.modalNormal,
    controlsContainer: {
      marginTop: Spacing.xxxl,
      marginBottom: Spacing.lg,
    },
  })

export const AlertModal: React.FC<ModalProps> = ({ visible, title, description, onCancel, onAccept, buttonTitle }) => {
  const { t } = useTranslation()

  const theme = useHekaTheme()
  const styles = useStyles(theme)

  return (
    <Portal theme={{ colors: { backdrop: 'rgba(0,0,0, 0.9)' } }}>
      <Dialog visible={visible} style={styles.dialog} dismissable={false}>
        <SafeAreaView edges={['left', 'right', 'bottom']}>
          <ScrollView contentContainerStyle={styles.contentContainer}>
            <View style={styles.titleContainer}>
              <Text style={styles.title}>{title}</Text>
            </View>
            <TouchableOpacity
              accessibilityLabel={t('Global.Close')}
              accessibilityRole={'button'}
              onPress={onCancel}
              hitSlop={hitSlop}
              style={styles.iconContainer}
            >
              <Icon name={'close'} size={theme.IconSizes.medium} color={styles.closeIcon.color} />
            </TouchableOpacity>
            <Text style={styles.bodyText}>{description}</Text>
          </ScrollView>
          <View style={styles.controlsContainer}>
            <Button
              title={buttonTitle ?? t('Global.Okay')}
              onPress={() => (onAccept ? onAccept() : onCancel())}
              buttonType={ButtonType.ModalPrimary}
            />
          </View>
        </SafeAreaView>
      </Dialog>
    </Portal>
  )
}

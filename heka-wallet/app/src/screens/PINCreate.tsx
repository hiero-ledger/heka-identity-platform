import { Screens } from '@bifold/core'
import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import { ParamListBase } from '@react-navigation/native'
import { StackScreenProps } from '@react-navigation/stack'
import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View, Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import PinKeyPad from '../components/misc/PinKeyPad'
import { AlertModal } from '../components/modals/AlertModal'
import { Loader } from '../components/views/LoadingView'
import { PinEntry, usePinCreation } from '../hooks/usePinCreation'

const useStyles = ({ TextTheme, Spacing }: HekaTheme) => {
  return StyleSheet.create({
    container: {
      height: '100%',
      padding: Spacing.lg,
    },
    textContainer: {
      flex: 1,
      gap: Spacing.xxl,
    },
    textTitle: TextTheme.headingFour,
    textDetails: TextTheme.normal,
    loaderContainer: {
      minHeight: Spacing.xxl,
      justifyContent: 'flex-end',
    },
  })
}

interface PINCreateProps extends StackScreenProps<ParamListBase, Screens.CreatePIN> {
  setAuthenticated: (status: boolean) => void
}

const PINCreate: React.FC<PINCreateProps> = ({ setAuthenticated, route }) => {
  const updatePin = (route.params as any)?.updatePin

  const { t } = useTranslation()

  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const { pinEntry, isPinChecking, modalState, setModalState, onPinOldSet, onPinSet, onPinRepeatSet } = usePinCreation(
    updatePin,
    setAuthenticated
  )

  const pinEntryHandlers: Record<PinEntry, (PIN: string) => Promise<boolean>> = {
    [PinEntry.Old]: onPinOldSet,
    [PinEntry.New]: onPinSet,
    [PinEntry.NewRepeat]: onPinRepeatSet,
  }

  const { title, details } = useMemo(() => {
    switch (pinEntry) {
      case PinEntry.New: {
        if (updatePin) {
          return {
            title: t('PINCreate.EnterNewPinTitle'),
            details: t('PINCreate.EnterNewPinText'),
          }
        } else {
          return {
            title: t('PINCreate.CreatePinTitle'),
            details: t('PINCreate.CreatePinText'),
          }
        }
      }
      case PinEntry.NewRepeat: {
        if (updatePin) {
          return {
            title: t('PINCreate.ReEnterNewPinTitle'),
            details: t('PINCreate.ReEnterNewPinText'),
          }
        } else {
          return {
            title: t('PINCreate.ReEnterPinTitle'),
            details: t('PINCreate.ReEnterPinText'),
          }
        }
      }
      case PinEntry.Old:
        return {
          title: t('PINCreate.EnterOldPinTitle'),
          details: t('PINCreate.EnterOldPinText'),
        }
    }
  }, [pinEntry, t, updatePin])

  return (
    <SafeAreaView>
      <View style={styles.container}>
        <View style={styles.textContainer}>
          <Text style={styles.textTitle}>{title}</Text>
          <Text style={styles.textDetails}>{details}</Text>
          <AlertModal
            title={modalState.title}
            description={modalState.message}
            visible={modalState.visible}
            onCancel={() => {
              if (modalState.onModalDismiss) {
                modalState.onModalDismiss()
              }
              setModalState({ ...modalState, visible: false, onModalDismiss: undefined })
            }}
          />
        </View>
        <View style={styles.loaderContainer}>
          {isPinChecking && <Loader size={styles.loaderContainer.minHeight} />}
        </View>
        {/* A new key per step remounts the pad, so the next step starts empty */}
        <PinKeyPad key={pinEntry} onPinEntered={pinEntryHandlers[pinEntry]} />
      </View>
    </SafeAreaView>
  )
}

export default PINCreate

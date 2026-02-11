import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import React, { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { ToastShowParams } from 'react-native-toast-message'

export const ToastConfig = {
  success: (props: ToastShowParams) => (
    <BaseToast text1={props?.text1} text2={props?.text2} toastType={ToastType.Success} />
  ),
  warn: (props: ToastShowParams) => <BaseToast text1={props?.text1} text2={props?.text2} toastType={ToastType.Warn} />,
  error: (props: ToastShowParams) => (
    <BaseToast text1={props?.text1} text2={props?.text2} toastType={ToastType.Error} />
  ),
  info: (props: ToastShowParams) => <BaseToast text1={props?.text1} text2={props?.text2} toastType={ToastType.Info} />,
}

interface BaseToastProps {
  text1?: string
  text2?: string
  toastType: string
}

const useStyles = ({ TextTheme, ColorPallet, Spacing, BorderRadius }: HekaTheme) => {
  return StyleSheet.create({
    container: {
      width: '90%',
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.md,
      borderRadius: BorderRadius.medium,
      alignItems: 'center',
      marginBottom: 2 * Spacing.xxl,
      gap: Spacing.xxs,
    },
    text: {
      ...TextTheme.normal,
      color: ColorPallet.grayscale.white,
    },
  })
}

export enum ToastType {
  Success = 'success',
  Info = 'info',
  Warn = 'warn',
  Error = 'error',
}

const BaseToast: React.FC<BaseToastProps> = ({ text1, text2, toastType }) => {
  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const backgroundColor = useMemo(() => {
    switch (toastType) {
      case ToastType.Success:
        return theme.ColorPallet.grayscale.black
      case ToastType.Info:
        return theme.ColorPallet.notification.info
      case ToastType.Warn:
        return theme.ColorPallet.notification.warn
      case ToastType.Error:
        return theme.ColorPallet.semantic.error
      default:
        throw new Error('ToastType was not set correctly.')
    }
  }, [theme, toastType])

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <Text style={styles.text}>{text1}</Text>
      {text2 && <Text style={styles.text}>{text2}</Text>}
    </View>
  )
}

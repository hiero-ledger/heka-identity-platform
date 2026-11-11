import type { DigitalCredentialsRequest } from '@animo-id/expo-digital-credentials-api'

import {
  AuthProvider,
  ContainerProvider,
  initStoredLanguage,
  MainContainer,
  StoreProvider as BifoldStoreProvider,
  ThemeProvider,
} from '@bifold/core'
import { HekaTheme, theme, useHekaTheme } from '@heka-wallet/shared'
import React, { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { PaperProvider } from 'react-native-paper'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import { container as rootContainer } from 'tsyringe'

import { AppContainer } from '../../container-impl'
import PinKeyPad from '../components/misc/PinKeyPad'
import { useDcApiSharing } from '../hooks/useDcApiSharing'

const useStyles = ({ ColorPalette, TextTheme, Spacing, BorderRadius }: HekaTheme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.4)',
    },
    sheet: {
      backgroundColor: ColorPalette.brand.modalPrimaryBackground,
      borderTopLeftRadius: BorderRadius.bigger,
      borderTopRightRadius: BorderRadius.bigger,
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.xl,
      gap: Spacing.xs,
    },
    title: TextTheme.headingFour,
    origin: TextTheme.label,
    body: {
      paddingTop: Spacing.md,
    },
    loader: {
      paddingVertical: Spacing.xxxl,
    },
    error: {
      ...TextTheme.label,
      color: ColorPalette.semantic.error,
    },
  })

type DcApiSharingScreenProps = {
  request: DigitalCredentialsRequest
}

type DcApiSharingSheetProps = {
  request: DigitalCredentialsRequest
}

export function DcApiSharingScreen({ request }: DcApiSharingScreenProps) {
  const overlayContainer = useMemo(() => {
    return new AppContainer(new MainContainer(rootContainer.createChildContainer()).init()).init()
  }, [])

  // Apply the user's stored language. App.tsx does this on mount, but in a cold-started DC API activity the main app component never mounts
  useEffect(() => {
    void initStoredLanguage()
  }, [])

  return (
    <ContainerProvider value={overlayContainer}>
      <BifoldStoreProvider>
        <ThemeProvider themes={[theme]} defaultThemeName={theme.themeName}>
          <PaperProvider theme={theme.PaperTheme}>
            <AuthProvider>
              <SafeAreaProvider>
                <DcApiSharingSheet request={request} />
              </SafeAreaProvider>
            </AuthProvider>
          </PaperProvider>
        </ThemeProvider>
      </BifoldStoreProvider>
    </ContainerProvider>
  )
}

function DcApiSharingSheet({ request }: DcApiSharingSheetProps) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()

  const hekaTheme = useHekaTheme()
  const styles = useStyles(hekaTheme)

  const { onPinEntered, onCancel, isProcessing, pinError } = useDcApiSharing(request)

  return (
    <View style={styles.root}>
      <Pressable
        style={styles.backdrop}
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel={t('DigitalCredentials.Cancel')}
      />
      <View style={[styles.sheet, { paddingBottom: insets.bottom || hekaTheme.Spacing.xl }]}>
        <Text style={styles.title}>{t('DigitalCredentials.EnterPinToShare')}</Text>
        <Text style={styles.origin} numberOfLines={1}>
          {t('DigitalCredentials.SharingWith', {
            origin: request.origin,
            interpolation: { escapeValue: false },
          })}
        </Text>
        {pinError && <Text style={styles.error}>{t('DigitalCredentials.IncorrectPin')}</Text>}
        <View style={styles.body}>
          {isProcessing ? (
            <ActivityIndicator size="large" style={styles.loader} />
          ) : (
            <PinKeyPad onPinEntered={onPinEntered} />
          )}
        </View>
      </View>
    </View>
  )
}

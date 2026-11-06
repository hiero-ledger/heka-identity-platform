import type { DigitalCredentialsRequest } from '@animo-id/expo-digital-credentials-api'

import {
  AuthProvider,
  ContainerProvider,
  initStoredLanguage,
  MainContainer,
  StoreProvider as BifoldStoreProvider,
  ThemeProvider,
  TOKENS,
  useServices,
} from '@bifold/core'
import { GlobalLogger, HekaTheme, theme, useHekaTheme } from '@heka-wallet/shared'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { PaperProvider } from 'react-native-paper'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import { container as rootContainer } from 'tsyringe'

import { AppContainer } from '../../container-impl'
import PinKeyPad from '../components/misc/PinKeyPad'
import { dcApiResolveRequest, dcApiSendErrorResponse, dcApiSendResponse } from '../credentials/dcApi'
import { HekaWalletAgent } from '../utils/agent'
import { formatError } from '../utils/error'
import { unlockDcApiAgent } from '../utils/unlockDcApiAgent'

const logger = GlobalLogger.createContextLogger('DcApiSharing')

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

  const [hashPIN] = useServices([TOKENS.FN_PIN_HASH_ALGORITHM])

  const [isProcessing, setIsProcessing] = useState(false)
  const [pinError, setPinError] = useState(false)

  // Guards against sending more than one response (PIN keypad can re-fire; backdrop can be tapped).
  const completedRef = useRef(false)

  const onPinEntered = useCallback(
    async (pin: string): Promise<boolean> => {
      if (completedRef.current) return true

      setPinError(false)
      setIsProcessing(true)

      let agent: HekaWalletAgent | null
      try {
        agent = await unlockDcApiAgent(pin, hashPIN)
      } catch (error) {
        logger.error('Failed to open the wallet for a Digital Credentials API request', {
          error: formatError(error),
        })
        completedRef.current = true
        dcApiSendErrorResponse('Unable to open the wallet')
        return true
      }

      if (!agent) {
        setPinError(true)
        setIsProcessing(false)
        return false
      }

      completedRef.current = true
      try {
        const resolved = await dcApiResolveRequest(agent, request)
        await dcApiSendResponse(agent, resolved)
        return true
      } catch (error) {
        agent.config.logger.error('Failed to build the Digital Credentials API response', {
          error: formatError(error),
        })
        dcApiSendErrorResponse(error instanceof Error ? error.message : 'Unable to share the credential')
        return true
      } finally {
        // Best-effort cleanup, the activity is finishing regardless
        await agent
          .shutdown()
          .catch((error: unknown) =>
            agent.config.logger.warn('DC API agent shutdown failed', { error: formatError(error) })
          )
      }
    },
    [request, hashPIN]
  )

  const onCancel = useCallback(() => {
    if (completedRef.current) return
    completedRef.current = true
    dcApiSendErrorResponse('The request was cancelled')
  }, [])

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

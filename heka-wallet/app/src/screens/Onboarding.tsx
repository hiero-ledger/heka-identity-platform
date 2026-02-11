import KeplrLogo from '@heka-wallet/keplr/assets/logo.svg'
import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import {
  AuthenticateStackParams,
  Button,
  ButtonType,
  OnboardingStackParams,
  useStore,
} from '@hyperledger/aries-bifold-core'
import { TOKENS, useServices } from '@hyperledger/aries-bifold-core/App/container-api'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { StackNavigationProp } from '@react-navigation/stack'
import React, { Ref, useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Animated, BackHandler, FlatList, StatusBar, StyleSheet, useWindowDimensions, View } from 'react-native'
import { ExpandingDot } from 'react-native-animated-pagination-dots'
import { SafeAreaView } from 'react-native-safe-area-context'
import { SvgProps } from 'react-native-svg'

import CredentialsImage from '../assets/credentials.svg'
import QrCodeImage from '../assets/qr_code.svg'
import SafeImage from '../assets/safe.svg'
import WalletImage from '../assets/wallet.svg'
import { OnBoardingPage } from '../components/views/OnBoardingPage'
import { isKeplrIntegrationEnabled, isWalletBackupEnabled } from '../config'
import { RootStackParams, Screens, Stacks } from '../navigators'

interface OnboardingProps {
  pages: Array<Element>
  nextButtonText: string
  previousButtonText: string
  disableSkip?: boolean
}

export const useStyles = (theme: HekaTheme) => {
  const { OnboardingTheme, ColorPallet, Spacing } = theme

  return StyleSheet.create({
    container: {
      height: '100%',
      alignItems: 'center',
      backgroundColor: ColorPallet.brand.brandedSecondary,
      paddingHorizontal: Spacing.xxl,
      paddingVertical: Spacing.sm,
    },
    pagerDot: {
      ...OnboardingTheme.pagerDot,
    },
    pagerDotActive: {
      ...OnboardingTheme.pagerDotActive,
    },
    pagerDotInactive: {
      ...OnboardingTheme.pagerDotInactive,
    },
    pagerPosition: {
      position: 'relative',
      top: 0,
    },
    controlsContainer: {
      width: '100%',
      margin: Spacing.lg,
    },
  })
}

interface OnBoardingPageDetails {
  image: React.FC<SvgProps>
  title: string
  body: string
  buttonTitle: string
  showBackupButton?: boolean
}

const Onboarding: React.FC<OnboardingProps> = () => {
  const [store, dispatch] = useStore()

  const theme = useHekaTheme()
  const styles = useStyles(theme)
  const onbordingNavigation = useNavigation<StackNavigationProp<RootStackParams & OnboardingStackParams>>()
  const authNavigation = useNavigation<StackNavigationProp<AuthenticateStackParams>>()

  const [onTutorialCompletedCurried] = useServices([TOKENS.FN_ONBOARDING_DONE])

  const [activeIndex, setActiveIndex] = useState(0)
  const flatList: Ref<FlatList> = useRef(null)
  const scrollX = useRef(new Animated.Value(0)).current
  const { t } = useTranslation()
  const { width } = useWindowDimensions()

  const steps = useMemo(() => {
    const steps: OnBoardingPageDetails[] = [
      {
        image: WalletImage,
        title: 'Onboarding.WelcomeParagraph1',
        body: 'Onboarding.WelcomeParagraph2',
        buttonTitle: 'Global.Next',
      },
      {
        image: CredentialsImage,
        title: 'Onboarding.StoredSecurelyTitle',
        body: 'Onboarding.StoredSecurelyBody',
        buttonTitle: 'Global.Next',
      },
      {
        image: QrCodeImage,
        title: 'Onboarding.UsingCredentialsTitle',
        body: 'Onboarding.UsingCredentialsBody',
        buttonTitle: 'Global.Next',
      },
      {
        image: SafeImage,
        title: 'Onboarding.PrivacyConfidentiality',
        body: 'Onboarding.PrivacyParagraph',
        buttonTitle: store.onboarding.didCompleteOnboarding ? 'Global.Done' : 'Onboarding.GetStarted',
        showBackupButton: true,
      },
    ]

    if (isKeplrIntegrationEnabled) {
      const keplrIntegrationGuide = {
        image: KeplrLogo,
        title: 'Onboarding.KeplrWalletTitle',
        body: 'Onboarding.KeplrWalletBody',
        buttonTitle: 'Global.Next',
      }
      steps.push(keplrIntegrationGuide)
    }
    return steps
  }, [store.onboarding.didCompleteOnboarding])

  const onViewableItemsChangedRef = useRef(({ viewableItems }: any) => {
    if (!viewableItems[0]) {
      return
    }

    setActiveIndex(viewableItems[0].index)
  })

  const viewabilityConfigRef = useRef({
    viewAreaCoveragePercentThreshold: 60,
  })

  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
    useNativeDriver: false,
  })

  const next = useCallback(() => {
    if (activeIndex + 1 < steps.length) {
      flatList?.current?.scrollToIndex({
        index: activeIndex + 1,
        animated: true,
      })
    } else {
      if (!store.onboarding.didCompleteOnboarding) {
        onTutorialCompletedCurried(dispatch, authNavigation)()
      } else {
        authNavigation.goBack()
      }
    }
  }, [
    activeIndex,
    steps.length,
    store.onboarding.didCompleteOnboarding,
    onTutorialCompletedCurried,
    dispatch,
    authNavigation,
  ])

  const renderItem = useCallback(
    ({ item, index }: { item: Element; index: number }) => (
      <View key={index} style={{ width }}>
        {item as React.ReactNode}
      </View>
    ),
    [width]
  )

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (!store.onboarding.didCompleteOnboarding) {
          BackHandler.exitApp()
        } else {
          authNavigation.goBack()
        }
        return true
      }

      BackHandler.addEventListener('hardwareBackPress', onBackPress)

      return () => BackHandler.removeEventListener('hardwareBackPress', onBackPress)
    }, [authNavigation, store.onboarding.didCompleteOnboarding])
  )

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor={theme.ColorPallet.brand.brandedSecondary} />
      <FlatList
        ref={flatList}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={{ width }}
        data={steps.map(OnBoardingPage)}
        renderItem={renderItem}
        viewabilityConfig={viewabilityConfigRef.current}
        onViewableItemsChanged={onViewableItemsChangedRef.current}
        onScroll={onScroll}
        scrollEventThrottle={16}
      />
      <ExpandingDot
        data={steps}
        scrollX={scrollX}
        inActiveDotColor={styles.pagerDotInactive.color}
        inActiveDotOpacity={1}
        activeDotColor={styles.pagerDotActive.color}
        expandingDotWidth={24}
        dotStyle={styles.pagerDot}
        containerStyle={styles.pagerPosition}
      />
      <View style={styles.controlsContainer}>
        {!store.onboarding.didCompleteOnboarding && isWalletBackupEnabled && steps[activeIndex].showBackupButton && (
          <View style={{ marginBottom: 10 }}>
            <Button
              title={t('Onboarding.RestoreWallet')}
              accessibilityLabel={t('Onboarding.RestoreWallet')}
              onPress={() => onbordingNavigation.navigate(Stacks.BackupStack, { screen: Screens.WalletRestore })}
              buttonType={ButtonType.Secondary}
            />
          </View>
        )}
        <Button
          /*@ts-ignore - ignore localization key check*/
          title={t(steps[activeIndex].buttonTitle)}
          /*@ts-ignore - ignore localization key check*/
          accessibilityLabel={t(steps[activeIndex].buttonTitle)}
          onPress={next}
          buttonType={ButtonType.Primary}
        />
      </View>
    </SafeAreaView>
  )
}

export default Onboarding

import { Button, ButtonType, DispatchAction, OnboardingStackParams, useStore } from '@bifold/core'
import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import { useNavigation } from '@react-navigation/native'
import { StackNavigationProp } from '@react-navigation/stack'
import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const DEFAULT_TEXT_SPACING = 10
const PARAGRAPH_SPACING = DEFAULT_TEXT_SPACING * 2

const useStyles = ({ ColorPalette, TextTheme, Spacing }: HekaTheme) =>
  StyleSheet.create({
    container: {
      backgroundColor: ColorPalette.brand.primaryBackground,
      padding: Spacing.lg,
    },
    bodyText: {
      ...TextTheme.normal,
      flexShrink: 1,
    },
    titleText: {
      ...TextTheme.bold,
    },
    controlsContainer: {
      marginVertical: Spacing.xxxl,
    },
    paragraph: {
      flexDirection: 'row',
      marginTop: PARAGRAPH_SPACING,
    },
    textWithSpacing: {
      marginTop: DEFAULT_TEXT_SPACING,
    },
    enumeration: {
      ...TextTheme.normal,
      marginLeft: Spacing.sm,
    },
    link: {
      ...TextTheme.normal,
      color: ColorPalette.brand.link,
      textDecorationLine: 'underline',
      fontWeight: 'bold',
    },
  })

export const TERMS_VERSION = '1.0'

export const Terms: React.FC = () => {
  const { t } = useTranslation()
  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const navigation = useNavigation<StackNavigationProp<OnboardingStackParams>>()
  navigation.setOptions({ title: 'User License Agreement' })

  const [store, dispatch] = useStore()

  const onSubmitPressed = useCallback(() => {
    dispatch({
      type: DispatchAction.DID_AGREE_TO_TERMS,
      payload: [{ DidAgreeToTerms: TERMS_VERSION }],
    })
  }, [dispatch])

  const onBackPressed = useCallback(() => {
    navigation.goBack()
  }, [navigation])

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']}>
      <StatusBar backgroundColor={theme.ColorPalette.brand.primaryBackground} />
      <ScrollView style={styles.container}>
        <Text style={{ ...styles.bodyText }}>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</Text>
        <Text style={{ ...styles.bodyText, ...styles.textWithSpacing }}>
          Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud
          exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit
          in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non
          proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
        </Text>

        <View style={styles.paragraph}>
          <View
            style={{
              flexShrink: 1,
              flexDirection: 'column',
            }}
          >
            <Text style={styles.titleText}>Excepteur sint occaecat cupidatat non proident, sunt in culpa qui</Text>
            <Text style={{ ...styles.bodyText, ...styles.textWithSpacing }}>
              exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in
              reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Tempor incididunt ut labore
              et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip
              ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu
              fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt
              mollit anim id est laborum.
            </Text>
          </View>
        </View>

        <View style={styles.controlsContainer}>
          {store.authentication.didAuthenticate && (
            <View style={{ paddingBottom: 10 }}>
              <Button
                title={t('Global.Back')}
                accessibilityLabel={t('Global.Back')}
                onPress={onBackPressed}
                buttonType={ButtonType.Secondary}
              />
            </View>
          )}
          {(!store.onboarding.didAgreeToTerms || store.onboarding.didAgreeToTerms !== TERMS_VERSION) && (
            <Button
              title={t('Global.Accept')}
              accessibilityLabel={t('Global.Accept')}
              onPress={onSubmitPressed}
              buttonType={ButtonType.Primary}
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

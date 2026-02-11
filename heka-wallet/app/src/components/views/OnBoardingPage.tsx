import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import {
  useStore,
  DispatchAction,
  OnboardingStackParams,
  Screens as BifoldScreens,
} from '@hyperledger/aries-bifold-core'
import { useNavigation } from '@react-navigation/native'
import { StackNavigationProp } from '@react-navigation/stack'
import React, { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, TouchableWithoutFeedback, View } from 'react-native'
import { ScrollView } from 'react-native-gesture-handler'
import { SvgProps } from 'react-native-svg'

import { RootStackParams } from '../../navigators/types'

const touchCountToEnableDeveloperOptions = 9

const imageDisplayOptions = {
  height: 240,
  width: 290,
}

const useStyles = ({ TextTheme, Spacing }: HekaTheme) =>
  StyleSheet.create({
    container: {
      padding: Spacing.lg,
      gap: Spacing.lg,
    },
    imageContainer: {
      minHeight: imageDisplayOptions.height,
      alignItems: 'center',
    },
    messageContainer: {
      textAlign: 'left',
      gap: Spacing.sm,
    },
    messageText: TextTheme.headingOne,
    messageTextSecondary: TextTheme.caption,
  })

interface OnBoardingPageProps {
  image: React.FC<SvgProps>
  title: string
  body: string
}

export const OnBoardingPage = ({ image, title, body }: OnBoardingPageProps) => {
  const { t } = useTranslation()
  const [store, dispatch] = useStore()
  const navigation = useNavigation<StackNavigationProp<RootStackParams & OnboardingStackParams>>()

  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const developerOptionCount = useRef(0)

  const incrementDeveloperMenuCounter = () => {
    if (developerOptionCount.current >= touchCountToEnableDeveloperOptions) {
      developerOptionCount.current = 0
      dispatch({
        type: DispatchAction.ENABLE_DEVELOPER_MODE,
        payload: [true],
      })
      navigation.navigate(BifoldScreens.Developer)
      return
    }

    developerOptionCount.current = developerOptionCount.current + 1
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.imageContainer}>
        <TouchableWithoutFeedback
          onPress={incrementDeveloperMenuCounter}
          disabled={store.preferences.developerModeEnabled}
        >
          {image(imageDisplayOptions)}
        </TouchableWithoutFeedback>
      </View>
      <View style={styles.messageContainer}>
        <Text style={styles.messageText}>
          {/*@ts-ignore - ignore localization key check*/}
          {t(title)}
        </Text>
        <Text style={styles.messageTextSecondary}>
          {/*@ts-ignore - ignore localization key check*/}
          {t(body)}
        </Text>
      </View>
    </ScrollView>
  )
}

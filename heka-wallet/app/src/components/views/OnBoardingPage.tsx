import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import { ScrollView } from 'react-native-gesture-handler'
import { SvgProps } from 'react-native-svg'

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

  const theme = useHekaTheme()
  const styles = useStyles(theme)

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/*TODO: Revisit sync/async functional components typing (new React feature)*/}
      <View style={styles.imageContainer}>{image(imageDisplayOptions) as React.ReactNode}</View>
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

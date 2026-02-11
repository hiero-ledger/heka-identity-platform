import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import { Locales, TOKENS, useServices } from '@hyperledger/aries-bifold-core'
import { storeLanguage } from '@hyperledger/aries-bifold-core/App/localization'
import React, { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, StyleSheet, Text, View } from 'react-native'
import BouncyCheckbox from 'react-native-bouncy-checkbox'
import { SafeAreaView } from 'react-native-safe-area-context'
import Icon from 'react-native-vector-icons/MaterialIcons'

export const useStyles = (theme: HekaTheme) => {
  const { ColorPallet, TextTheme, FontWeights, Spacing } = theme

  return StyleSheet.create({
    container: {
      height: '100%',
      padding: Spacing.lg,
    },
    section: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: Spacing.xs,
      gap: Spacing.xs,
    },
    checkbox: {
      color: ColorPallet.brand.secondaryBackground,
    },
    checkboxIcon: {
      borderColor: ColorPallet.brand.primary,
      borderWidth: 2,
      color: ColorPallet.brand.primary,
    },
    itemTitle: {
      ...TextTheme.title,
      fontWeight: FontWeights.medium,
    },
  })
}

interface LanguageOption {
  id: Locales
  value: string
}

const Language = () => {
  const { i18n } = useTranslation()
  const [{ supportedLanguages }] = useServices([TOKENS.CONFIG])

  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const languages: LanguageOption[] = useMemo(
    () =>
      supportedLanguages.map((lang) => ({
        id: lang,
        value: i18n.t(`Language.code`, { context: lang }),
      })),
    [i18n, supportedLanguages]
  )

  const handleLanguageChange = useCallback(
    async (language: LanguageOption) => {
      await i18n.changeLanguage(language.id as Locales)
      await storeLanguage(language.id)
    },
    [i18n]
  )

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={languages}
        renderItem={({ item: language }) => {
          return (
            <View style={styles.section}>
              <BouncyCheckbox
                accessibilityLabel={language.value}
                fillColor={styles.checkbox.color}
                unfillColor={styles.checkbox.color}
                size={theme.IconSizes.medium}
                innerIconStyle={styles.checkboxIcon}
                ImageComponent={() => (
                  <Icon name="circle" size={theme.IconSizes.small} color={styles.checkboxIcon.color} />
                )}
                onPress={async () => await handleLanguageChange(language)}
                isChecked={language.id === i18n.language}
                disableBuiltInState
              />
              <Text style={styles.itemTitle}>{language.value}</Text>
            </View>
          )
        }}
      />
    </SafeAreaView>
  )
}

export default Language

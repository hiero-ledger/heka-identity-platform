import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import { Link, Screens, Stacks } from '@hyperledger/aries-bifold-core'
import { ContactStackParams } from '@hyperledger/aries-bifold-core/App/types/navigators'
import { StackNavigationProp } from '@react-navigation/stack'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'

const useStyles = ({ TextTheme, ListItems, Spacing }: HekaTheme) =>
  StyleSheet.create({
    container: {
      paddingTop: Spacing.lg,
      gap: Spacing.xl,
      textAlign: 'left',
    },
    titleText: TextTheme.headingThree,
    detailsText: ListItems.emptyList,
  })

export interface EmptyListProps {
  navigation: StackNavigationProp<ContactStackParams, Screens.Contacts>
}

const EmptyListContacts: React.FC<EmptyListProps> = ({ navigation }) => {
  const { t } = useTranslation()
  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const navigateToWhatAreContacts = () => {
    navigation.getParent()?.navigate(Stacks.ContactStack, { screen: Screens.WhatAreContacts })
  }

  return (
    <View style={styles.container}>
      <Text style={styles.titleText}>{t('Contacts.EmptyList')}</Text>
      <Text style={styles.detailsText}>{t('Contacts.PeopleAndOrganizations')}</Text>
      <Link linkText={t('Contacts.WhatAreContacts')} onPress={navigateToWhatAreContacts} />
    </View>
  )
}

export default EmptyListContacts

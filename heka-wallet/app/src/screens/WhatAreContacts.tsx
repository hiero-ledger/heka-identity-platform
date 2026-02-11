import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import { Link, Screens, Stacks } from '@hyperledger/aries-bifold-core'
import UnorderedList from '@hyperledger/aries-bifold-core/App/components/misc/UnorderedList'
import { NavigationProp, ParamListBase } from '@react-navigation/native'
import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native'

interface WhatAreContactsProps {
  navigation: NavigationProp<ParamListBase>
}

const useStyles = ({ TextTheme, Spacing }: HekaTheme) =>
  StyleSheet.create({
    container: {
      padding: Spacing.lg,
      gap: Spacing.lg,
    },
    title: {
      ...TextTheme.headingThree,
      textAlign: 'left',
    },
    details: TextTheme.normal,
  })

const WhatAreContacts: React.FC<WhatAreContactsProps> = ({ navigation }) => {
  const { t } = useTranslation()

  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const goToContactList = useCallback(() => {
    navigation.getParent()?.navigate(Stacks.ContactStack, { screen: Screens.Contacts })
  }, [navigation])

  const bulletPoints = [
    t('WhatAreContacts.ListItemDirectMessage'),
    t('WhatAreContacts.ListItemNewCredentials'),
    t('WhatAreContacts.ListItemNotifiedOfUpdates'),
    t('WhatAreContacts.ListItemRequest'),
  ]

  return (
    <SafeAreaView>
      <ScrollView
        contentContainerStyle={styles.container}
        directionalLockEnabled
        automaticallyAdjustContentInsets={false}
        showsHorizontalScrollIndicator={false}
      >
        <Text style={styles.title}>{t('WhatAreContacts.Title')}</Text>
        <Text style={styles.details}>{t('WhatAreContacts.Preamble')}</Text>
        <View>
          <UnorderedList unorderedListItems={bulletPoints} />
        </View>
        <Text style={styles.details}>
          {`${t('WhatAreContacts.RemoveContacts')} `}
          <Link linkText={t('WhatAreContacts.ContactsLink')} onPress={goToContactList} />
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

export default WhatAreContacts

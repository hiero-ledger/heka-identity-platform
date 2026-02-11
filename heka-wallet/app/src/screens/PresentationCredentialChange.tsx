import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import { StackScreenProps } from '@react-navigation/stack'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { CredentialCard } from '../components/cards'
import { Record } from '../components/misc'
import { OpenIdStackParams, Screens } from '../navigators/types'

const useStyles = ({ ColorPallet, Spacing, BorderWidth, BorderRadius }: HekaTheme) =>
  StyleSheet.create({
    pageContainer: {
      flex: 1,
    },
    pageMargin: {
      marginHorizontal: Spacing.lg,
    },
    selectedCred: {
      borderWidth: BorderWidth.large,
      borderRadius: BorderRadius.big,
      borderColor: ColorPallet.semantic.focus,
    },
  })

type Props = StackScreenProps<OpenIdStackParams, Screens.PresentationCredentialChange>

// Based on Bifold component: https://github.com/openwallet-foundation/bifold-wallet/blob/main/packages/legacy/core/App/screens/ProofChangeCredential.tsx
export const PresentationCredentialChange: React.FC<Props> = ({ route, navigation }) => {
  if (!route?.params) {
    throw new Error('Change credential route params were not set properly')
  }

  const { inputDescriptorId, selectedCredentialId, submissionOptions, onCredentialChange } = route.params

  const { t } = useTranslation()

  const theme = useHekaTheme()
  const styles = useStyles(theme)
  const { TextTheme } = theme

  const selectCredential = (credentialId: string) => {
    onCredentialChange(inputDescriptorId, credentialId)
    navigation.goBack()
  }

  return (
    <SafeAreaView style={styles.pageContainer} edges={['bottom', 'left', 'right']}>
      <FlatList
        data={submissionOptions}
        ListHeaderComponent={
          <View style={{ ...styles.pageMargin, marginVertical: 20 }}>
            <Text style={TextTheme.normal}>{t('ProofRequest.MultipleCredentials')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.pageMargin}>
            <TouchableOpacity
              onPress={() => selectCredential(item.credential.id ?? '')}
              style={[
                item.credential.id === selectedCredentialId ? styles.selectedCred : undefined,
                { marginBottom: 10 },
              ]}
              activeOpacity={1}
            >
              <Record
                fields={item.requestedAttributes ?? []}
                header={() => <CredentialCard credentialDisplay={item.credential.display} />}
              />
            </TouchableOpacity>
          </View>
        )}
      ></FlatList>
    </SafeAreaView>
  )
}

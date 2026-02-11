import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import { Screens as BifoldScreens, TOKENS, useServices } from '@hyperledger/aries-bifold-core'
import { CredentialStackParams } from '@hyperledger/aries-bifold-core/App/types/navigators'
import { toImageSource } from '@hyperledger/aries-bifold-core/App/utils/credential'
import { useNavigation } from '@react-navigation/core'
import { StackNavigationProp } from '@react-navigation/stack'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

import LoadingView from '../components/views/LoadingView'
import { CredentialDisplay, useCredentials } from '../credentials'

const useStyles = ({
  IconSizes,
  BorderRadius,
  TextTheme,
  Spacing,
  BorderWidth,
  ColorPallet,
  HekaTextTheme,
  FontWeights,
}: HekaTheme) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      gap: Spacing.sm,
      paddingVertical: Spacing.xs,
      borderBottomColor: ColorPallet.brand.primaryDisabled,
      borderBottomWidth: BorderWidth.small,
    },
    logoContainer: {
      backgroundColor: ColorPallet.grayscale.white,
      borderRadius: BorderRadius.small,
      padding: Spacing.xxxs,
      paddingRight: Spacing.lg,
    },
    logo: {
      resizeMode: 'cover',
      width: IconSizes.large,
      height: IconSizes.large,
      borderRadius: BorderRadius.small,
      backgroundColor: ColorPallet.grayscale.white,
    },
    logoName: {
      ...TextTheme.title,
      width: IconSizes.large,
      height: IconSizes.large,
      fontSize: 0.5 * IconSizes.large,
      color: ColorPallet.grayscale.white,
    },
    textContainer: {
      gap: Spacing.xxxs,
    },
    credentialName: {
      ...TextTheme.modalNormal,
      fontWeight: FontWeights.bold,
    },
    issuerName: {
      ...HekaTextTheme.bodySmall,
      color: ColorPallet.grayscale.mediumGrey,
    },
  })

interface CredentialRowProps {
  credentialDisplay: CredentialDisplay
  onPress: () => void
}

export const CredentialRow: React.FC<CredentialRowProps> = ({ onPress, credentialDisplay }) => {
  const { t } = useTranslation()

  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const logo = credentialDisplay.logo ?? credentialDisplay.issuer.logo

  return (
    <TouchableOpacity activeOpacity={0.8} disabled={onPress === undefined} onPress={onPress} style={styles.container}>
      <View style={[styles.logoContainer, { backgroundColor: credentialDisplay.backgroundColor }]}>
        {logo ? (
          <Image source={toImageSource(logo.url)} style={styles.logo} />
        ) : (
          <Text style={styles.logoName}>{(credentialDisplay.name ?? 'C')?.charAt(0).toUpperCase()}</Text>
        )}
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.credentialName}>{credentialDisplay.name}</Text>
        <Text style={styles.issuerName}>
          {t('CredentialOffer.IssuedBy')} {credentialDisplay.issuer.name}
        </Text>
      </View>
    </TouchableOpacity>
  )
}

export const CredentialList: React.FC = () => {
  const { t } = useTranslation()

  const { ColorPallet, Spacing } = useHekaTheme()

  const navigation = useNavigation<StackNavigationProp<CredentialStackParams>>()

  const [CredentialListOptions, CredentialEmptyList] = useServices([
    TOKENS.COMPONENT_CRED_LIST_OPTIONS,
    TOKENS.COMPONENT_CRED_EMPTY_LIST,
  ])

  const { credentials, isLoading } = useCredentials()

  return (
    <View>
      <FlatList
        style={{ backgroundColor: ColorPallet.brand.primaryBackground }}
        contentContainerStyle={{
          marginHorizontal: Spacing.lg,
        }}
        data={credentials}
        keyExtractor={(credential) => credential.id}
        renderItem={({ item: credential, index }) => (
          <CredentialRow
            key={index}
            credentialDisplay={credential.display}
            onPress={() => navigation.navigate(BifoldScreens.CredentialDetails, { credential: credential as any })}
          />
        )}
        ListEmptyComponent={() =>
          isLoading ? <LoadingView /> : <CredentialEmptyList message={t('Credentials.EmptyList')} />
        }
      />
      <CredentialListOptions />
    </View>
  )
}

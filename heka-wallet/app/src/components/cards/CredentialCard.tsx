import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import CardWatermark from '@hyperledger/aries-bifold-core/App/components/misc/CardWatermark'
import { credentialTextColor, toImageSource } from '@hyperledger/aries-bifold-core/App/utils/credential'
import React from 'react'
import { useTranslation } from 'react-i18next'
import {
  Image,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native'
import MaterialIcon from 'react-native-vector-icons/MaterialIcons'

import { CredentialDisplay } from '../../credentials'

const useStyles = (theme: HekaTheme, credentialDisplay?: CredentialDisplay) => {
  const { ColorPallet, Spacing, BorderRadius, IconSizes, BorderWidth } = theme

  return StyleSheet.create({
    container: {
      backgroundColor: credentialDisplay?.backgroundColor,
      display: 'flex',
      borderRadius: BorderRadius.bigger,
      marginVertical: Spacing.xs,
      padding: Spacing.xl,
      gap: Spacing.xxl,
    },
    secondaryHeaderContainer: {
      height: 1.5 * IconSizes.larger,
      backgroundColor:
        (credentialDisplay?.backgroundImage ? 'rgba(0, 0, 0, 0)' : credentialDisplay?.backgroundColor) ??
        'rgba(0, 0, 0, 0.24)',
    },
    actionButtonContainer: {
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.md,
      borderWidth: BorderWidth.small,
      borderRadius: BorderRadius.big,
      borderColor: ColorPallet.brand.primaryLight,
    },
    logo: {
      resizeMode: 'cover',
      width: IconSizes.larger,
      height: IconSizes.larger,
      borderRadius: BorderRadius.small,
      borderWidth: BorderWidth.small,
      borderColor: ColorPallet.grayscale.white,
    },
    logoContainer: {
      width: IconSizes.larger,
      height: IconSizes.larger,
      backgroundColor: '#ffffff',
      borderRadius: BorderRadius.small,
      justifyContent: 'center',
      alignItems: 'center',
    },
    textContainer: {
      color: credentialTextColor(ColorPallet, credentialDisplay?.backgroundColor ?? ColorPallet.grayscale.white),
    },
  })
}

interface Props {
  credentialDisplay?: CredentialDisplay
  requestedCredentialName?: string
  showActionButton?: boolean
  actionButtonTitle?: string
  onActionButtonPress?: () => void
  shortIssuerLabel?: boolean
  containerStyle?: ViewStyle
  credentialNameStyle?: TextStyle
  issuerLabelStyle?: TextStyle
}

export const CredentialCard: React.FC<Props> = ({
  credentialDisplay,
  requestedCredentialName,
  showActionButton,
  actionButtonTitle,
  onActionButtonPress,
  shortIssuerLabel,
  containerStyle,
  credentialNameStyle,
  issuerLabelStyle,
}) => {
  const { t } = useTranslation()

  const theme = useHekaTheme()
  const styles = useStyles(theme, credentialDisplay)
  const { HekaTextTheme, Spacing, TextTheme, IconSizes } = theme

  const { width, height } = useWindowDimensions()

  if (!credentialDisplay) {
    return <MissingCredentialCard requestedCredentialName={requestedCredentialName} />
  }

  const logo = credentialDisplay.logo ?? credentialDisplay.issuer.logo
  return (
    <View style={{ ...styles.container, ...containerStyle }}>
      {/*TODO: Add proper support for credential background image*/}
      {/*{credential.display.backgroundImage ? (*/}
      {/*  <ImageBackground*/}
      {/*    source={toImageSource(credential.display.backgroundImage.url)}*/}
      {/*    imageStyle={{*/}
      {/*      resizeMode: 'cover',*/}
      {/*    }}*/}
      {/*  >*/}
      {/*    <View style={styles.secondaryHeaderContainer} />*/}
      {/*  </ImageBackground>*/}
      {/*) : null}*/}
      <View style={styles.logoContainer}>
        {logo ? (
          <Image source={toImageSource(logo.url)} style={styles.logo} />
        ) : (
          <Text style={[TextTheme.title, { fontSize: 0.5 * IconSizes.larger, color: '#000' }]}>
            {(credentialDisplay.name ?? 'C')?.charAt(0).toUpperCase()}
          </Text>
        )}
      </View>
      <View>
        <View style={{ gap: Spacing.xxs }}>
          {credentialDisplay.watermark && (
            <CardWatermark width={width} height={height} watermark={credentialDisplay.watermark} />
          )}
          <Text style={{ ...TextTheme.headingFour, ...credentialNameStyle, ...styles.textContainer }} numberOfLines={2}>
            {credentialDisplay.name}
          </Text>
          <Text
            style={{ ...HekaTextTheme.labelMedium, ...issuerLabelStyle, ...styles.textContainer }}
            numberOfLines={1}
          >
            {shortIssuerLabel
              ? credentialDisplay.issuer.name
              : `${t('Credentials.IssuedBy')} ${credentialDisplay.issuer.name}`}
          </Text>
        </View>
      </View>
      {showActionButton && (
        <TouchableOpacity onPress={onActionButtonPress} style={styles.actionButtonContainer}>
          <Text
            style={[
              HekaTextTheme.labelLarge,
              styles.textContainer,
              {
                textAlign: 'center',
              },
            ]}
          >
            {actionButtonTitle}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

interface MissingCredentialCardProps {
  requestedCredentialName?: string
}

const MissingCredentialCard: React.FC<MissingCredentialCardProps> = ({ requestedCredentialName }) => {
  const theme = useHekaTheme()
  const styles = useStyles(theme)
  const { TextTheme, ColorPallet, IconSizes } = theme

  return (
    <View
      style={{
        ...styles.container,
        backgroundColor: ColorPallet.semantic.errorTransparentLight,
      }}
    >
      <View style={{ ...styles.logoContainer, backgroundColor: ColorPallet.semantic.errorTransparent }}>
        <MaterialIcon name={'warning'} size={IconSizes.medium} color={ColorPallet.semantic.error} />
      </View>
      <Text style={TextTheme.headingFour}>{requestedCredentialName ?? 'Unknown credential'}</Text>
    </View>
  )
}

interface PropsWithOnPress extends Omit<Props, 'showActionButton' | 'actionButtonTitle' | 'onActionButtonPress'> {
  onPress?: () => void
}

export const CredentialCardPressable: React.FC<PropsWithOnPress> = ({ onPress, ...cardProps }) => {
  return (
    <TouchableOpacity activeOpacity={1} disabled={onPress === undefined} onPress={onPress}>
      <CredentialCard {...cardProps} />
    </TouchableOpacity>
  )
}

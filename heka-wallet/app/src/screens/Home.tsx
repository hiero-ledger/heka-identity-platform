import { Screens as BifoldScreens, Stacks as BifoldStacks, TOKENS, useServices } from '@bifold/core'
import { HomeStackParams, RootStackParams } from '@bifold/core/src/types/navigators'
import { DidCommConnectionRecord } from '@credo-ts/didcomm'
import { HekaTheme, IconButton, useHekaTheme } from '@heka-wallet/shared'
import Badge from '@react-navigation/bottom-tabs/src/views/Badge'
import { useNavigation } from '@react-navigation/core'
import { StackNavigationProp, StackScreenProps } from '@react-navigation/stack'
import React, { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { ListRenderItemInfo, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons'

import QRCodeIcon from '../assets/qr_code.svg'
import { CredentialCardPressable, ItemsListCard, NotificationCard, NotificationType } from '../components/cards'
import { Credential, useCredentials } from '../credentials'
import { useContacts } from '../utils/useContacts'
import { useNotifications } from '../utils/useNotifications'

import { ContactListItem } from './ContactList'

const MAX_DISPLAYED_CREDENTIALS = 3

const NOTIFICATIONS_BADGE_SIZE = 20

const CREDENTIALS_ICON_SIZE = 120
const CREDENTIAL_CARD_WIDTH = 144
const CREDENTIAL_CARD_HEIGHT = 200

const useStyles = ({
  Spacing,
  TextTheme,
  ColorPalette,
  FontWeights,
  IconSizes,
  BorderWidth,
  BorderRadius,
}: HekaTheme) =>
  StyleSheet.create({
    container: {
      gap: Spacing.xs,
      paddingBottom: 90,
    },
    horizontalListContainer: {
      paddingHorizontal: Spacing.xl,
      gap: Spacing.sm,
    },
    notificationsBadgeText: {
      ...TextTheme.caption,
      color: ColorPalette.grayscale.white,
      fontWeight: FontWeights.medium,
    },
    credentialCard: {
      width: CREDENTIAL_CARD_WIDTH,
      height: CREDENTIAL_CARD_HEIGHT,
      borderRadius: BorderRadius.big,
      padding: Spacing.md,
      marginVertical: 0,
    },
    chatsCardContent: {
      paddingHorizontal: Spacing.xl,
      paddingTop: 0,
      paddingBottom: 0,
    },
    allCredentialsCard: {
      width: CREDENTIAL_CARD_WIDTH,
      height: CREDENTIAL_CARD_HEIGHT,
      borderWidth: BorderWidth.small,
      borderRadius: BorderRadius.big,
      borderColor: ColorPalette.grayscale.lightGrey,
      backgroundColor: ColorPalette.grayscale.white,
      justifyContent: 'space-between',
    },
    allCredentialsIconContainer: {
      margin: Spacing.md,
      width: IconSizes.larger,
      height: IconSizes.larger,
      backgroundColor: ColorPalette.brand.primaryBackground,
      borderRadius: BorderRadius.small,
      justifyContent: 'center',
      alignItems: 'center',
    },
    allCredentialsText: {
      ...TextTheme.normal,
      padding: Spacing.md,
    },
  })

type HomeProps = StackScreenProps<HomeStackParams, BifoldScreens.Home>

export const Home: React.FC<HomeProps> = () => {
  const { t } = useTranslation()

  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const { ColorPalette, TextTheme } = theme

  const [notificationObj] = useServices([TOKENS.NOTIFICATIONS])

  const navigation = useNavigation<StackNavigationProp<RootStackParams>>()

  const { credentials, isLoading: isCredentialsLoading } = useCredentials(MAX_DISPLAYED_CREDENTIALS)

  const customNotification = notificationObj.customNotificationConfig
  const notifications = useNotifications()

  const { contacts, isLoading: contactsLoading } = useContacts()

  const renderCredentialCard = ({ item: credential, index }: ListRenderItemInfo<Credential>) => {
    return (
      <CredentialCardPressable
        key={index}
        containerStyle={styles.credentialCard}
        credentialDisplay={credential.display}
        credentialNameStyle={TextTheme.bold}
        shortIssuerLabel
        onPress={() =>
          navigation.navigate(BifoldStacks.NotificationStack, {
            screen: BifoldScreens.CredentialDetails,
            params: { credentialId: credential as any },
          })
        }
      />
    )
  }

  const renderNotification = (item: any): ReactElement => {
    if (item.type === 'CredentialRecord') {
      const notificationType = item.revocationNotification
        ? NotificationType.Revocation
        : NotificationType.CredentialOffer
      return <NotificationCard notificationType={notificationType} notificationRecord={item} />
    } else if (item.type === 'CustomNotification' && customNotification) {
      return (
        <NotificationCard
          notificationType={NotificationType.Custom}
          notificationRecord={item}
          customNotification={customNotification}
        />
      )
    } else {
      return <NotificationCard notificationType={NotificationType.ProofRequest} notificationRecord={item} />
    }
  }

  const renderContactChat = ({ item: connection }: ListRenderItemInfo<DidCommConnectionRecord>) => {
    return <ContactListItem connection={connection} />
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ItemsListCard
        title={t('Home.Credentials')}
        items={credentials}
        isLoading={isCredentialsLoading}
        itemsContainerStyle={styles.horizontalListContainer}
        renderItem={renderCredentialCard}
        itemKeyExtractor={(item, _) => item.id}
        emptyListText={t('Home.CredentialsGuide')}
        emptyListIcon={<QRCodeIcon height={CREDENTIALS_ICON_SIZE} width={CREDENTIALS_ICON_SIZE} />}
        headerRightComponent={
          <IconButton
            iconName={'qr-code-scan'}
            label={t('Common.Scan')}
            onPress={() => navigation.navigate(BifoldStacks.ConnectStack, { screen: BifoldScreens.Scan })}
            iconColor={ColorPalette.brand.text}
            textStyle={TextTheme.labelTitle}
            containerStyle={{ paddingHorizontal: 0 }}
          />
        }
        listFooterComponent={credentials.length === MAX_DISPLAYED_CREDENTIALS ? <AllCredentialsCard /> : null}
      />
      <ItemsListCard
        title={t('Home.Notifications')}
        items={notifications}
        itemsContainerStyle={styles.horizontalListContainer}
        renderItem={({ item: notification }) => renderNotification(notification)}
        headerRightComponent={
          <Badge
            visible={!!notifications.length}
            size={NOTIFICATIONS_BADGE_SIZE}
            style={{ backgroundColor: ColorPalette.brand.highlight }}
          >
            {/* TODO: Find a way to pass styled text here without @ts-ignore */}
            {/* @ts-ignore */}
            <Text style={styles.notificationsBadgeText}>{notifications.length}</Text>
          </Badge>
        }
        emptyListText={t('Home.NotificationsEmpty')}
      />
      <ItemsListCard
        title={t('Home.Chats')}
        items={contacts}
        cardContentStyle={styles.chatsCardContent}
        isLoading={contactsLoading}
        horizontal={false}
        renderItem={renderContactChat}
        emptyListText={t('Home.ChatsEmpty')}
      />
    </ScrollView>
  )
}

const AllCredentialsCard = () => {
  const { t } = useTranslation()

  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const { ColorPalette, IconSizes } = theme

  const navigation = useNavigation<StackNavigationProp<RootStackParams>>()

  return (
    <TouchableOpacity
      style={styles.allCredentialsCard}
      onPress={() => navigation.navigate(BifoldStacks.CredentialStack, { screen: BifoldScreens.Credentials })}
    >
      <View style={styles.allCredentialsIconContainer}>
        <MaterialCommunityIcon name={'chevron-right'} size={IconSizes.medium} color={ColorPalette.brand.label} />
      </View>
      <Text style={styles.allCredentialsText}>{t('Home.AllCredentials')}</Text>
    </TouchableOpacity>
  )
}

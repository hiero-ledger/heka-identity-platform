import { ConnectionRecord, ConnectionType, DidExchangeState } from '@credo-ts/core'
import { useAgent } from '@credo-ts/react-hooks'
import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import {
  BifoldAgent,
  BifoldError,
  ButtonLocation,
  EventTypes,
  HeaderButton,
  Screens,
  Stacks,
  TOKENS,
  useServices,
  useStore,
} from '@hyperledger/aries-bifold-core'
import { useChatMessagesByConnection } from '@hyperledger/aries-bifold-core/App/hooks/chat-messages'
import { ContactStackParams, RootStackParams } from '@hyperledger/aries-bifold-core/App/types/navigators'
import { fetchContactsByLatestMessage } from '@hyperledger/aries-bifold-core/App/utils/contacts'
import { toImageSource } from '@hyperledger/aries-bifold-core/App/utils/credential'
import { formatTime, getConnectionName } from '@hyperledger/aries-bifold-core/App/utils/helpers'
import { useNavigation } from '@react-navigation/core'
import { StackNavigationProp } from '@react-navigation/stack'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DeviceEventEmitter, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

import EmptyListContacts from '../components/misc/EmptyListContacts'
import LoadingView from '../components/views/LoadingView'

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
      paddingVertical: Spacing.sm,
      borderBottomColor: ColorPallet.brand.primaryDisabled,
      borderBottomWidth: BorderWidth.small,
    },
    logoContainer: {
      backgroundColor: ColorPallet.grayscale.white,
      borderRadius: BorderRadius.small,
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
    connectionName: {
      ...TextTheme.modalNormal,
      fontWeight: FontWeights.bold,
    },
    connectionEvent: {
      ...HekaTextTheme.bodySmall,
      color: ColorPallet.grayscale.mediumGrey,
    },
    timeContainer: {
      paddingVertical: Spacing.xxxs,
      alignSelf: 'center',
      marginLeft: 'auto',
    },
    timeText: {
      color: TextTheme.normal.color,
    },
  })

interface ListContactsProps {
  navigation: StackNavigationProp<ContactStackParams, Screens.Contacts>
}

interface ConnectionRowProps {
  connection: ConnectionRecord
}

export const ContactListItem: React.FC<ConnectionRowProps> = ({ connection }) => {
  const [store] = useStore()
  const navigation = useNavigation<StackNavigationProp<RootStackParams>>()

  const theme = useHekaTheme()
  const styles = useStyles(theme)

  const contactLabel = useMemo(
    () => getConnectionName(connection, store.preferences.alternateContactNames),
    [connection, store.preferences.alternateContactNames]
  )

  const messages = useChatMessagesByConnection(connection)
  const message = messages[0]

  const onPressContact = useCallback(() => {
    navigation.getParent()?.navigate(Stacks.ContactStack, {
      screen: Screens.Chat,
      params: { connectionId: connection.id },
    })
  }, [navigation, connection.id])

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPressContact} style={styles.container}>
      <View style={styles.logoContainer}>
        {connection.imageUrl ? (
          <Image source={toImageSource(connection.imageUrl)} style={styles.logo} />
        ) : (
          <Text style={styles.logoName}>{contactLabel?.charAt(0).toUpperCase()}</Text>
        )}
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.connectionName}>{contactLabel}</Text>
        {message && (
          <Text style={styles.connectionEvent} numberOfLines={1} ellipsizeMode={'tail'}>
            {message.text}
          </Text>
        )}
      </View>
      <View style={styles.timeContainer}>
        {message && (
          <Text style={styles.timeText}>{formatTime(message.createdAt, { shortMonth: true, trim: true })}</Text>
        )}
      </View>
    </TouchableOpacity>
  )
}

const ListContacts: React.FC<ListContactsProps> = ({ navigation }) => {
  const { t } = useTranslation()
  const { agent } = useAgent()
  const [store] = useStore()
  const [{ contactHideList }] = useServices([TOKENS.CONFIG])

  const { ColorPallet, Spacing } = useHekaTheme()

  const [connections, setConnections] = useState<ConnectionRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchAndSetConnections = async () => {
      if (!agent) return
      let orderedContacts = await fetchContactsByLatestMessage(agent as BifoldAgent)

      // if developer mode is disabled, filter out mediator connections and connections in the hide list
      if (!store.preferences.developerModeEnabled) {
        orderedContacts = orderedContacts.filter((r) => {
          return (
            !r.connectionTypes.includes(ConnectionType.Mediator) &&
            !contactHideList?.includes((r.theirLabel || r.alias) ?? '') &&
            r.state === DidExchangeState.Completed
          )
        })
      }

      setConnections(orderedContacts)
    }

    fetchAndSetConnections()
      .catch((err) => {
        agent?.config.logger.error('Error fetching contacts:', err)
        const error = new BifoldError(
          t('Error.Title1046'),
          t('Error.Message1046'),
          (err as Error)?.message ?? err,
          1046
        )
        DeviceEventEmitter.emit(EventTypes.ERROR_ADDED, error)
      })
      .finally(() => setIsLoading(false))
  }, [agent, contactHideList, store.preferences.developerModeEnabled, t])

  const onPressAddContact = useCallback(() => {
    navigation.getParent()?.navigate(Stacks.ConnectStack, { screen: Screens.Scan, params: { defaultToConnect: true } })
  }, [navigation])

  useEffect(() => {
    if (store.preferences.useConnectionInviterCapability) {
      navigation.setOptions({
        headerRight: () => (
          <HeaderButton
            buttonLocation={ButtonLocation.Right}
            testID={t('Contacts.AddContact')}
            accessibilityLabel={t('Contacts.AddContact')}
            onPress={onPressAddContact}
            icon="plus-circle-outline"
          />
        ),
      })
    } else {
      navigation.setOptions({
        headerRight: () => false,
      })
    }
  }, [navigation, onPressAddContact, store.preferences.useConnectionInviterCapability, t])

  return (
    <View>
      <FlatList
        style={{ backgroundColor: ColorPallet.brand.primaryBackground }}
        contentContainerStyle={{
          marginHorizontal: Spacing.lg,
        }}
        data={connections}
        keyExtractor={(connection) => connection.id}
        renderItem={({ item: connection, index }) => <ContactListItem key={index} connection={connection} />}
        ListEmptyComponent={() => (isLoading ? <LoadingView /> : <EmptyListContacts navigation={navigation} />)}
        showsVerticalScrollIndicator={false}
      />
    </View>
  )
}

export default ListContacts

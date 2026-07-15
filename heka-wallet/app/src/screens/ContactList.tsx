import {
  BifoldAgent,
  BifoldError,
  ButtonLocation,
  ContactStackParams,
  EventTypes,
  formatTime,
  getConnectionName,
  IconButton,
  Screens,
  Stacks,
  TOKENS,
  useServices,
  useStore,
} from '@bifold/core'
import { useChatMessagesByConnection } from '@bifold/core/src/hooks/chat-messages'
import { RootStackParams } from '@bifold/core/src/types/navigators'
import { fetchContactsByLatestMessage } from '@bifold/core/src/utils/contacts'
import { toImageSource } from '@bifold/core/src/utils/credential'
import { useConnections, useOptionalAgent } from '@bifold/react-hooks'
import { DidCommConnectionRecord, DidCommConnectionType, DidCommDidExchangeState } from '@credo-ts/didcomm'
import { HekaTheme, useHekaTheme } from '@heka-wallet/shared'
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
  ColorPalette,
  HekaTextTheme,
  FontWeights,
}: HekaTheme) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      gap: Spacing.sm,
      paddingVertical: Spacing.sm,
      borderBottomColor: ColorPalette.brand.primaryDisabled,
      borderBottomWidth: BorderWidth.small,
    },
    logoContainer: {
      backgroundColor: ColorPalette.grayscale.white,
      borderRadius: BorderRadius.small,
    },
    logo: {
      resizeMode: 'cover',
      width: IconSizes.large,
      height: IconSizes.large,
      borderRadius: BorderRadius.small,
      backgroundColor: ColorPalette.grayscale.white,
    },
    logoName: {
      ...TextTheme.title,
      width: IconSizes.large,
      height: IconSizes.large,
      fontSize: 0.5 * IconSizes.large,
      color: ColorPalette.grayscale.white,
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
      color: ColorPalette.grayscale.mediumGrey,
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
  connection: DidCommConnectionRecord
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
  const { agent } = useOptionalAgent()
  const [store] = useStore()
  const [{ contactHideList }] = useServices([TOKENS.CONFIG])

  const { ColorPalette, Spacing } = useHekaTheme()

  const { records: connectionRecords } = useConnections()

  const [connections, setConnections] = useState<DidCommConnectionRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchAndSetConnections = async () => {
      if (!agent || !connectionRecords) return
      let orderedContacts = await fetchContactsByLatestMessage(agent as BifoldAgent, connectionRecords)

      // if developer mode is disabled, filter out mediator connections and connections in the hide list
      if (!store.preferences.developerModeEnabled) {
        orderedContacts = orderedContacts.filter((r) => {
          return (
            !r.connectionTypes.includes(DidCommConnectionType.Mediator) &&
            !contactHideList?.includes((r.theirLabel || r.alias) ?? '') &&
            r.state === DidCommDidExchangeState.Completed
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
  }, [agent, connectionRecords, contactHideList, store.preferences.developerModeEnabled, t])

  const onPressAddContact = useCallback(() => {
    navigation.getParent()?.navigate(Stacks.ConnectStack, { screen: Screens.Scan, params: { defaultToConnect: true } })
  }, [navigation])

  useEffect(() => {
    if (store.preferences.useConnectionInviterCapability) {
      navigation.setOptions({
        headerRight: () => (
          <IconButton
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
        style={{ backgroundColor: ColorPalette.brand.primaryBackground }}
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

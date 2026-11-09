import { ContactStackParams, getConnectionName, Screens, Stacks, useNetwork, useStore } from '@bifold/core'
import { RootStackParams } from '@bifold/core/src/types/navigators'
import { useConnectionById } from '@bifold/react-hooks'
import { DidCommConnectionRecord } from '@credo-ts/didcomm'
import { useHekaTheme } from '@heka-wallet/shared'
import { useIsFocused, useNavigation } from '@react-navigation/native'
import { StackNavigationProp, StackScreenProps } from '@react-navigation/stack'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { GiftedChat } from 'react-native-gifted-chat'
import { SafeAreaView } from 'react-native-safe-area-context'

import { renderComposer, renderInputToolbar, renderSend } from '../components/chat'
import ActionSlider from '../components/chat/ActionSlider'
import { renderActions } from '../components/chat/ChatActions'
import { ChatMessage } from '../components/chat/ChatMessage'
import { Role } from '../components/chat/types'
import ConnectionContextMenu from '../components/misc/ConnectionContextMenu'
import { useChatMessagesByConnection } from '../hooks/chat-messages'
import { useChatActions } from '../hooks/useChatActions'

type ChatProps = StackScreenProps<ContactStackParams, Screens.Chat> | StackScreenProps<RootStackParams, Screens.Chat>

const Chat: React.FC<ChatProps> = ({ route }) => {
  if (!route?.params) {
    throw new Error('Chat route params were not set properly')
  }

  const { connectionId } = route.params
  const [store] = useStore()
  const { t } = useTranslation()
  const navigation = useNavigation<StackNavigationProp<RootStackParams | ContactStackParams>>()
  const connection = useConnectionById(connectionId) as DidCommConnectionRecord
  const chatMessages = useChatMessagesByConnection(connection)
  const isFocused = useIsFocused()
  const { assertNetworkConnected, silentAssertConnectedNetwork } = useNetwork()
  const [showActionSlider, setShowActionSlider] = useState(false)

  const theme = useHekaTheme()
  const { ColorPalette, ChatTheme, Assets } = theme

  const [theirLabel, setTheirLabel] = useState(getConnectionName(connection, store.preferences.alternateContactNames))

  // This useEffect is for properly rendering changes to the alt contact name, useMemo did not pick them up
  useEffect(() => {
    setTheirLabel(getConnectionName(connection, store.preferences.alternateContactNames))
  }, [isFocused, connection, store.preferences.alternateContactNames])

  useMemo(() => {
    assertNetworkConnected()
  }, [assertNetworkConnected])

  useEffect(() => {
    navigation.setOptions({
      title: theirLabel,
      headerRight: () => (
        <View>
          <ConnectionContextMenu connection={connection} />
        </View>
      ),
    })
  }, [connection, theirLabel, navigation])

  const { sendMessage } = useChatActions(connectionId)

  const onSendRequest = useCallback(async () => {
    navigation.navigate(Stacks.ProofRequestsStack as any, {
      screen: Screens.ProofRequests,
      params: { navigation: navigation, connectionId },
    })
  }, [navigation, connectionId])

  const actions = useMemo(() => {
    return store.preferences.useVerifierCapability
      ? [
          {
            text: t('Verifier.SendProofRequest'),
            onPress: () => {
              setShowActionSlider(false)
              onSendRequest()
            },
            icon: () => <Assets.svg.iconInfoSentDark height={30} width={30} />,
          },
        ]
      : undefined
  }, [t, store.preferences.useVerifierCapability, onSendRequest, Assets])

  const onDismiss = () => {
    setShowActionSlider(false)
  }

  return (
    <SafeAreaView
      edges={['bottom', 'left', 'right']}
      style={{ flex: 1, backgroundColor: ColorPalette.grayscale.white, borderRadius: 24 }}
    >
      <GiftedChat
        messages={chatMessages}
        showAvatarForEveryMessage={true}
        alignTop
        renderAvatar={() => null}
        messageIdGenerator={(msg) => msg?._id.toString() || '0'}
        renderMessage={(props) => <ChatMessage messageProps={props} />}
        renderInputToolbar={(props) => renderInputToolbar(props, ChatTheme)}
        renderSend={(props) => renderSend(props, ChatTheme)}
        renderComposer={(props) => renderComposer(props, ChatTheme, t('Contacts.TypeHere'))}
        disableComposer={!silentAssertConnectedNetwork()}
        onSend={sendMessage}
        user={{
          _id: Role.me,
        }}
        renderActions={(props) => renderActions(props, ChatTheme, actions)}
        onPressActionButton={actions ? () => setShowActionSlider(true) : undefined}
      />
      {showActionSlider && <ActionSlider onDismiss={onDismiss} actions={actions} />}
    </SafeAreaView>
  )
}

export default Chat

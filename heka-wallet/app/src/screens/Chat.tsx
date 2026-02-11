import { BasicMessageRepository, ConnectionRecord } from '@credo-ts/core'
import { useAgent, useBasicMessagesByConnectionId, useConnectionById } from '@credo-ts/react-hooks'
import { useHekaTheme } from '@heka-wallet/shared'
import { Stacks, useStore } from '@hyperledger/aries-bifold-core'
import { useNetwork } from '@hyperledger/aries-bifold-core/App/contexts/network'
import { BasicMessageMetadata, basicMessageCustomMetadata } from '@hyperledger/aries-bifold-core/App/types/metadata'
import { ContactStackParams, RootStackParams, Screens } from '@hyperledger/aries-bifold-core/App/types/navigators'
import { getConnectionName } from '@hyperledger/aries-bifold-core/App/utils/helpers'
import { useIsFocused, useNavigation } from '@react-navigation/native'
import { StackNavigationProp, StackScreenProps } from '@react-navigation/stack'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { GiftedChat, IMessage } from 'react-native-gifted-chat'
import { SafeAreaView } from 'react-native-safe-area-context'

import { renderComposer, renderInputToolbar, renderSend } from '../components/chat'
import ActionSlider from '../components/chat/ActionSlider'
import { renderActions } from '../components/chat/ChatActions'
import { ChatMessage } from '../components/chat/ChatMessage'
import { Role } from '../components/chat/types'
import ConnectionContextMenu from '../components/misc/ConnectionContextMenu'
import { useChatMessagesByConnection } from '../hooks/chat-messages'

type ChatProps = StackScreenProps<ContactStackParams, Screens.Chat> | StackScreenProps<RootStackParams, Screens.Chat>

const Chat: React.FC<ChatProps> = ({ route }) => {
  if (!route?.params) {
    throw new Error('Chat route params were not set properly')
  }

  const { connectionId } = route.params
  const [store] = useStore()
  const { t } = useTranslation()
  const { agent } = useAgent()
  const navigation = useNavigation<StackNavigationProp<RootStackParams | ContactStackParams>>()
  const connection = useConnectionById(connectionId) as ConnectionRecord
  const basicMessages = useBasicMessagesByConnectionId(connectionId)
  const chatMessages = useChatMessagesByConnection(connection)
  const isFocused = useIsFocused()
  const { assertConnectedNetwork, silentAssertConnectedNetwork } = useNetwork()
  const [showActionSlider, setShowActionSlider] = useState(false)

  const theme = useHekaTheme()
  const { ColorPallet, ChatTheme, Assets } = theme

  const [theirLabel, setTheirLabel] = useState(getConnectionName(connection, store.preferences.alternateContactNames))

  // This useEffect is for properly rendering changes to the alt contact name, useMemo did not pick them up
  useEffect(() => {
    setTheirLabel(getConnectionName(connection, store.preferences.alternateContactNames))
  }, [isFocused, connection, store.preferences.alternateContactNames])

  useMemo(() => {
    assertConnectedNetwork()
  }, [assertConnectedNetwork])

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

  // when chat is open, mark messages as seen
  useEffect(() => {
    basicMessages.forEach((msg) => {
      const meta = msg.metadata.get(BasicMessageMetadata.customMetadata) as basicMessageCustomMetadata
      if (agent && !meta?.seen) {
        msg.metadata.set(BasicMessageMetadata.customMetadata, { ...meta, seen: true })
        const basicMessageRepository = agent.context.dependencyManager.resolve(BasicMessageRepository)
        basicMessageRepository.update(agent.context, msg)
      }
    })
  }, [basicMessages, agent])

  const onSend = useCallback(
    async (messages: IMessage[]) => {
      const message = messages
        ?.map((s) => s.text?.trim())
        ?.join('\n')
        .replace(/(\n)+/g, '\n')
        .trim()
      await agent?.basicMessages.sendMessage(connectionId, message)
    },
    [agent, connectionId]
  )

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
      style={{ flex: 1, backgroundColor: ColorPallet.grayscale.white, borderRadius: 24 }}
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
        onSend={onSend}
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

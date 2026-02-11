import { useHekaTheme } from '@heka-wallet/shared'
import { Text } from '@hyperledger/aries-bifold-core'
import { formatTime } from '@hyperledger/aries-bifold-core/App/utils/helpers'
import React, { useMemo } from 'react'
import { View } from 'react-native'
import { Bubble, IMessage, Message } from 'react-native-gifted-chat'

import { EventStyles } from './ChatEvent'
import { Role } from './types'

export interface ChatMessageProps {
  messageProps: React.ComponentProps<typeof Message>
}

export interface ExtendedChatMessage extends IMessage {
  renderEvent: () => JSX.Element
  createdAt: Date
  eventStyles?: EventStyles
}

const MessageTime: React.FC<{ message: ExtendedChatMessage }> = ({ message }) => {
  const { ChatTheme: theme } = useHekaTheme()

  return (
    <Text
      // @ts-ignore
      style={[
        message.user._id === Role.me ? theme.timeStyleRight : theme.timeStyleLeft,
        { flex: 1, textAlign: 'right' },
        message.eventStyles?.fontColor ? { color: message.eventStyles.fontColor } : {},
      ]}
    >
      {formatTime(message.createdAt, { includeHour: true, chatFormat: true, trim: true })}
    </Text>
  )
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ messageProps }: ChatMessageProps) => {
  const { ChatTheme: theme } = useHekaTheme()
  const message = useMemo(() => messageProps.currentMessage as ExtendedChatMessage, [messageProps])

  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: message.user._id === Role.me ? 'flex-end' : 'flex-start',
      }}
    >
      <View style={theme.containerStyle}>
        <Bubble
          {...messageProps}
          renderUsernameOnMessage={false}
          renderMessageText={() => message.renderEvent()}
          wrapperStyle={{
            left: {
              ...theme.leftBubble,
              backgroundColor: message.eventStyles?.backgroundColor ?? theme.leftBubble.backgroundColor,
              minWidth: 140,
            },
            right: {
              ...theme.rightBubble,
              backgroundColor: message.eventStyles?.backgroundColor ?? theme.rightBubble.backgroundColor,
              minWidth: 140,
            },
          }}
          renderTime={() => <MessageTime message={message} />}
        />
      </View>
    </View>
  )
}

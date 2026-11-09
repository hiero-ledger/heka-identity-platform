import { Text, formatTime } from '@bifold/core'
import { useHekaTheme } from '@heka-wallet/shared'
import React, { useMemo } from 'react'
import { View } from 'react-native'
import { Bubble, Message } from 'react-native-gifted-chat'

import { ChatMessageContent } from './ChatMessageContent'
import { ExtendedChatMessage } from './messages'
import { Role } from './types'

export interface ChatMessageProps {
  messageProps: React.ComponentProps<typeof Message>
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
          renderMessageText={() => <ChatMessageContent message={message} />}
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

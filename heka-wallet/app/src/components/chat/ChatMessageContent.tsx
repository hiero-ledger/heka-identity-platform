import { GlobalLogger, HekaTheme, useHekaTheme } from '@heka-wallet/shared'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, StyleSheet, Text } from 'react-native'

import { formatError } from '../../utils/error'

import { ChatEvent } from './ChatEvent'
import { ExtendedChatMessage } from './messages'
import { Role } from './types'

const logger = GlobalLogger.createContextLogger('ChatMessageContent')

const useStyles = ({ ColorPalette }: HekaTheme) =>
  StyleSheet.create({
    link: {
      color: ColorPalette.brand.link,
      textDecorationLine: 'underline',
    },
  })

const openLink = (link: string) => {
  Linking.openURL(link).catch((error: unknown) =>
    logger.warn('Failed to open a chat link', { link, error: formatError(error) })
  )
}

interface ChatMessageContentProps {
  message: ExtendedChatMessage
}

export const ChatMessageContent: React.FC<ChatMessageContentProps> = ({ message }) => {
  const { t } = useTranslation()
  const theme = useHekaTheme()
  const { ChatTheme } = theme
  const styles = useStyles(theme)
  const { content } = message

  switch (content.kind) {
    case 'event':
      return <ChatEvent event={content.event} onPress={content.onPress} />

    case 'connected':
      return (
        <Text style={ChatTheme.rightText}>
          {t('Chat.YouConnected')}
          <Text style={[ChatTheme.rightText, ChatTheme.rightTextHighlighted]}> {content.label}</Text>
        </Text>
      )

    case 'text':
      return (
        <Text style={message.user._id === Role.me ? ChatTheme.rightText : ChatTheme.leftText}>
          {content.segments.map(({ text, link }, i) => (
            <Text
              key={`${message._id}-${i}`}
              onPress={link ? () => openLink(link) : undefined}
              style={link ? styles.link : undefined}
              accessibilityRole={link ? 'link' : undefined}
            >
              {text}
            </Text>
          ))}
        </Text>
      )
  }
}

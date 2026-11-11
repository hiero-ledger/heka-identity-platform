import { GlobalLogger } from '@heka-wallet/shared'
import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { Linking } from 'react-native'

import { ChatMessageContent } from '../../src/components/chat/ChatMessageContent'
import { ExtendedChatMessage } from '../../src/components/chat/messages'
import { Role } from '../../src/components/chat/types'

jest.mock('@heka-wallet/shared', () => {
  const theme = { ChatTheme: { leftText: {}, rightText: {} }, ColorPalette: { brand: { link: 'blue' } } }
  const logger = { warn: jest.fn() }
  return {
    GlobalLogger: { createContextLogger: () => logger },
    useHekaTheme: () => theme,
  }
})

jest.mock('react-i18next', () => {
  const translation = { t: (key: string) => key }
  return { useTranslation: () => translation }
})

jest.mock('../../src/components/chat/ChatEvent', () => ({ ChatEvent: () => null }))

// The component's module logger; the mock factory returns the same instance on every call.
const logger = GlobalLogger.createContextLogger('ChatMessageContent')

const renderLink = (link: string) => {
  const message = {
    _id: 'message-id',
    text: link,
    content: { kind: 'text', segments: [{ text: 'Open me', link }] },
    createdAt: new Date(),
    user: { _id: Role.them },
  } as ExtendedChatMessage
  render(<ChatMessageContent message={message} />)
  fireEvent.press(screen.getByText('Open me'))
}

describe('ChatMessageContent', () => {
  beforeEach(() => {
    jest.mocked(Linking.openURL).mockResolvedValue(true)
  })

  it.each(['https://heka.example/a', 'http://heka.example/a', 'mailto:me@heka.example', 'HTTPS://heka.example/a'])(
    'opens an allowed link %s',
    (link) => {
      renderLink(link)

      expect(Linking.openURL).toBeCalledWith(link)
    }
  )

  it.each(['javascript:alert(1)', 'tel:+123456', 'intent://scan#Intent;end', 'heka.example/no-scheme'])(
    'refuses to open a link with a disallowed scheme %s',
    (link) => {
      renderLink(link)

      expect(Linking.openURL).not.toBeCalled()
      expect(logger.warn).toBeCalledWith('Refused to open a chat link with a disallowed scheme', expect.any(Object))
    }
  )
})

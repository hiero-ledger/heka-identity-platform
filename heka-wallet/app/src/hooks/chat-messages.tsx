import type { RootStackParams } from '@bifold/core/src/types/navigators'

import { ContactStackParams, getConnectionName, Screens, Stacks, useStore } from '@bifold/core'
import { getMessageEventRole } from '@bifold/core/src/utils/helpers'
import {
  useBasicMessagesByConnectionId,
  useCredentialsByConnectionId,
  useProofsByConnectionId,
} from '@bifold/react-hooks'
import {
  DidCommBasicMessageRecord,
  DidCommConnectionRecord,
  DidCommCredentialExchangeRecord,
  DidCommCredentialState,
  DidCommProofExchangeRecord,
  DidCommProofState,
} from '@credo-ts/didcomm'
import { useHekaTheme, ColorPalette } from '@heka-wallet/shared'
import { useNavigation } from '@react-navigation/native'
import { StackNavigationProp } from '@react-navigation/stack'
import React, { Fragment, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Linking, Text } from 'react-native'

import { ChatEvent, EventDetails, EventStates, EventTypes } from '../components/chat/ChatEvent'
import { ExtendedChatMessage } from '../components/chat/ChatMessage'
import { Role } from '../components/chat/types'
import { resolveOverlay } from '../credentials'

const pendingEventStyles = {
  backgroundColor: ColorPalette.brand.primaryBackground,
  fontColor: ColorPalette.grayscale.black,
}

const successEventStyles = {
  backgroundColor: ColorPalette.semantic.successTransparent,
  fontColor: ColorPalette.grayscale.black,
}

const errorEventStyles = {
  backgroundColor: ColorPalette.semantic.errorTransparent,
  fontColor: ColorPalette.grayscale.black,
}

const getRecordEventDetails = async (
  record: DidCommCredentialExchangeRecord | DidCommProofExchangeRecord,
  connection: DidCommConnectionRecord
): Promise<EventDetails> => {
  if (record instanceof DidCommCredentialExchangeRecord) {
    const bundleOverlay = await resolveOverlay(record, connection)
    const image = bundleOverlay.brandingOverlay?.logo || connection.imageUrl

    if (record.state === DidCommCredentialState.Done || record.state === DidCommCredentialState.CredentialReceived) {
      return {
        role: Role.me,
        type: EventTypes.Credential,
        state: EventStates.Accepted,
        image,
        styles: successEventStyles,
      }
    }
    if (record.state === DidCommCredentialState.RequestSent) {
      return {
        role: Role.me,
        type: EventTypes.Credential,
        state: EventStates.Requested,
        image,
        styles: successEventStyles,
      }
    }
    if (record.state === DidCommCredentialState.OfferReceived) {
      return {
        role: Role.them,
        type: EventTypes.CredentialOffer,
        image,
        styles: pendingEventStyles,
      }
    }
    if (record.state === DidCommCredentialState.Declined || record.state === DidCommCredentialState.Abandoned) {
      return {
        role: Role.me,
        type: EventTypes.CredentialOffer,
        state: EventStates.Declined,
        image,
        styles: errorEventStyles,
      }
    }
  }

  if (record instanceof DidCommProofExchangeRecord) {
    const image = connection.imageUrl

    if (record.state === DidCommProofState.RequestReceived) {
      return {
        role: Role.me,
        type: EventTypes.PresentationRequest,
        image,
        styles: pendingEventStyles,
      }
    }
    if (record.state === DidCommProofState.PresentationSent || record.state === DidCommProofState.Done) {
      return {
        role: Role.me,
        type: EventTypes.Presentation,
        state: EventStates.Sent,
        image,
        styles: successEventStyles,
      }
    }
    if (record.state === DidCommProofState.Declined) {
      return {
        role: Role.me,
        type: EventTypes.PresentationRequest,
        state: EventStates.Declined,
        image,
        styles: errorEventStyles,
      }
    }
    if (record.state === DidCommProofState.Abandoned) {
      return {
        role: Role.them,
        type: EventTypes.PresentationRequest,
        state: EventStates.Declined,
        image,
        styles: errorEventStyles,
      }
    }
  }
  return {
    role: Role.me,
    type: record.type,
    state: record.state,
  }
}

/**
 * Custom hook for retrieving chat messages for a given connection. This hook includes some of
 * the JSX for rendering the chat messages, including the logic for handling links in messages.
 *
 * @param {DidCommConnectionRecord} connection - The connection to retrieve chat messages for.
 * @returns {ExtendedChatMessage[]} The chat messages for the given connection.
 */
export const useChatMessagesByConnection = (connection: DidCommConnectionRecord): ExtendedChatMessage[] => {
  const [messages, setMessages] = useState<Array<ExtendedChatMessage>>([])
  const [store] = useStore()
  const { t } = useTranslation()
  const { ChatTheme: theme, ColorPalette } = useHekaTheme()
  const navigation = useNavigation<StackNavigationProp<RootStackParams | ContactStackParams>>()
  const basicMessages = useBasicMessagesByConnectionId(connection?.id)
  const credentials = useCredentialsByConnectionId(connection?.id)
  const proofs = useProofsByConnectionId(connection?.id)
  const [theirLabel, setTheirLabel] = useState(getConnectionName(connection, store.preferences.alternateContactNames))

  // This useEffect is for properly rendering changes to the alt contact name, useMemo did not pick them up
  useEffect(() => {
    setTheirLabel(getConnectionName(connection, store.preferences.alternateContactNames))
  }, [connection, store.preferences.alternateContactNames])

  const prepareChatMessages = useCallback(
    async () => {
      const transformedMessages: Array<ExtendedChatMessage> = basicMessages.map((record: DidCommBasicMessageRecord) => {
        const role = getMessageEventRole(record)
        // eslint-disable-next-line
        const linkRegex = /(?:https?\:\/\/\w+(?:\.\w+)+\S*)|(?:[\w\d\.\_\-]+@\w+(?:\.\w+)+)/gim
        // eslint-disable-next-line
        const mailRegex = /^[\w\d\.\_\-]+@\w+(?:\.\w+)+$/gim
        const links = record.content.match(linkRegex) ?? []
        const handleLinkPress = (link: string) => {
          if (link.match(mailRegex)) {
            link = 'mailto:' + link
          }
          Linking.openURL(link)
        }
        const msgText = (
          <Text style={role === Role.me ? theme.rightText : theme.leftText}>
            {record.content.split(linkRegex).map((split, i) => {
              if (i < links.length) {
                const link = links[i]
                return (
                  <Fragment key={`${record.id}-${i}`}>
                    <Text>{split}</Text>
                    <Text
                      onPress={() => handleLinkPress(link)}
                      style={{ color: ColorPalette.brand.link, textDecorationLine: 'underline' }}
                      accessibilityRole={'link'}
                    >
                      {link}
                    </Text>
                  </Fragment>
                )
              }
              return <Text key={`${record.id}-${i}`}>{split}</Text>
            })}
          </Text>
        )
        return {
          _id: record.id,
          text: record.content,
          renderEvent: () => msgText,
          createdAt: record.updatedAt || record.createdAt,
          type: record.type,
          user: { _id: role },
        }
      })

      for (const record of credentials) {
        const event = await getRecordEventDetails(record, connection)
        const onPressEvent = () => {
          if (record.state === DidCommCredentialState.Done) {
            navigation.navigate(Stacks.ContactStack as any, {
              screen: Screens.CredentialDetails,
              params: { credential: record },
            })
          }
          if (record.state === DidCommCredentialState.OfferReceived) {
            navigation.navigate(Stacks.NotificationStack as any, {
              screen: Screens.CredentialOffer,
              params: { credentialId: record.id },
            })
          }
        }

        transformedMessages.push({
          _id: record.id,
          text: record.type,
          renderEvent: () => <ChatEvent event={event} onPress={onPressEvent} />,
          eventStyles: event.styles,
          createdAt: record.updatedAt || record.createdAt,
          user: { _id: event.role },
        })
      }

      for (const record of proofs) {
        const event = await getRecordEventDetails(record, connection)
        const onPressEvent = () => {
          if (
            record.state === DidCommProofState.Done ||
            record.state === DidCommProofState.PresentationSent ||
            record.state === DidCommProofState.PresentationReceived
          ) {
            navigation.navigate(Stacks.ContactStack as any, {
              screen: Screens.ProofDetails,
              params: {
                recordId: record.id,
                isHistory: true,
                senderReview:
                  record.state === DidCommProofState.PresentationSent ||
                  (record.state === DidCommProofState.Done && record.isVerified === undefined),
              },
            })
          }
          if (record.state === DidCommProofState.RequestReceived) {
            navigation.navigate(Stacks.NotificationStack as any, {
              screen: Screens.ProofRequest,
              params: { proofId: record.id },
            })
          }
        }

        transformedMessages.push({
          _id: record.id,
          text: record.type,
          renderEvent: () => <ChatEvent event={event} onPress={onPressEvent} />,
          eventStyles: event.styles,
          createdAt: record.updatedAt || record.createdAt,
          user: { _id: event.role },
        })
      }

      const connectedMessage = connection
        ? {
            _id: 'connected',
            text: `${t('Chat.YouConnected')} ${theirLabel}`,
            renderEvent: () => (
              <Text style={theme.rightText}>
                {t('Chat.YouConnected')}
                <Text style={[theme.rightText, theme.rightTextHighlighted]}> {theirLabel}</Text>
              </Text>
            ),
            createdAt: connection.createdAt,
            user: { _id: Role.me },
          }
        : undefined

      setMessages(
        connectedMessage
          ? [...transformedMessages.sort((a: any, b: any) => b.createdAt - a.createdAt), connectedMessage]
          : transformedMessages.sort((a: any, b: any) => b.createdAt - a.createdAt)
      )
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [basicMessages, credentials, proofs, theirLabel]
  )

  useEffect(() => {
    prepareChatMessages()
  }, [prepareChatMessages])

  return messages
}

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
import { ColorPalette, GlobalLogger } from '@heka-wallet/shared'
import { useNavigation } from '@react-navigation/native'
import { StackNavigationProp } from '@react-navigation/stack'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EventDetails, EventStates, EventTypes } from '../components/chat/ChatEvent'
import { ExtendedChatMessage, MessageTextSegment } from '../components/chat/messages'
import { Role } from '../components/chat/types'
import { resolveOverlay } from '../credentials'
import { formatError } from '../utils/error'

const logger = GlobalLogger.createContextLogger('ChatMessages')

const linkRegex = /(?:https?:\/\/\w+(?:\.\w+)+\S*)|(?:[\w.-]+@\w+(?:\.\w+)+)/gim
const mailRegex = /^[\w.-]+@\w+(?:\.\w+)+$/im

// Splits a basic message into plain text and links; an email address opens as mailto:
const toTextSegments = (content: string): MessageTextSegment[] => {
  const links = content.match(linkRegex) ?? []
  return content.split(linkRegex).flatMap((text, i) => {
    if (i >= links.length) return [{ text }]
    const link = links[i]
    return [{ text }, { text: link, link: mailRegex.test(link) ? `mailto:${link}` : link }]
  })
}

const byNewestFirst = (a: ExtendedChatMessage, b: ExtendedChatMessage) => b.createdAt.getTime() - a.createdAt.getTime()

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
    // The overlay only supplies the logo; a failure must not hide the event or the rest of the chat
    const bundleOverlay = await resolveOverlay(record, connection).catch((error: unknown) => {
      logger.error('Failed to resolve the credential overlay', { recordId: record.id, error: formatError(error) })
      return undefined
    })
    const image = bundleOverlay?.brandingOverlay?.logo || connection.imageUrl

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

/** Chat messages of a connection, newest first, as data for `ChatMessageContent` to render. */
export const useChatMessagesByConnection = (connection: DidCommConnectionRecord): ExtendedChatMessage[] => {
  const [messages, setMessages] = useState<Array<ExtendedChatMessage>>([])
  const [store] = useStore()
  const { t } = useTranslation()
  const navigation = useNavigation<StackNavigationProp<RootStackParams | ContactStackParams>>()
  const basicMessages = useBasicMessagesByConnectionId(connection?.id)
  const credentials = useCredentialsByConnectionId(connection?.id)
  const proofs = useProofsByConnectionId(connection?.id)
  const [theirLabel, setTheirLabel] = useState(getConnectionName(connection, store.preferences.alternateContactNames))

  // This useEffect is for properly rendering changes to the alt contact name, useMemo did not pick them up
  useEffect(() => {
    setTheirLabel(getConnectionName(connection, store.preferences.alternateContactNames))
  }, [connection, store.preferences.alternateContactNames])

  const prepareChatMessages = useCallback(async (): Promise<ExtendedChatMessage[]> => {
    const transformedMessages: Array<ExtendedChatMessage> = basicMessages.map((record: DidCommBasicMessageRecord) => {
      const role = getMessageEventRole(record)
      return {
        _id: record.id,
        text: record.content,
        content: { kind: 'text', segments: toTextSegments(record.content) },
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
        content: { kind: 'event', event, onPress: onPressEvent },
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
        content: { kind: 'event', event, onPress: onPressEvent },
        eventStyles: event.styles,
        createdAt: record.updatedAt || record.createdAt,
        user: { _id: event.role },
      })
    }

    const connectedMessage: ExtendedChatMessage | undefined = connection
      ? {
          _id: 'connected',
          text: `${t('Chat.YouConnected')} ${theirLabel}`,
          content: { kind: 'connected', label: theirLabel },
          createdAt: connection.createdAt,
          user: { _id: Role.me },
        }
      : undefined

    return connectedMessage
      ? [...transformedMessages.sort(byNewestFirst), connectedMessage]
      : transformedMessages.sort(byNewestFirst)
  }, [basicMessages, credentials, proofs, theirLabel, connection, navigation, t])

  useEffect(() => {
    // A newer run replaces the result of one still in progress
    let cancelled = false

    prepareChatMessages()
      .then((preparedMessages) => {
        if (!cancelled) setMessages(preparedMessages)
      })
      .catch((error: unknown) => logger.error('Failed to prepare chat messages', error))

    return () => {
      cancelled = true
    }
  }, [prepareChatMessages])

  return messages
}

import { IMessage } from 'react-native-gifted-chat'

import { EventDetails, EventStyles } from './ChatEvent'

export interface MessageTextSegment {
  text: string
  // URL to open when the segment is pressed
  link?: string
}

export type ChatMessageContentData =
  | { kind: 'text'; segments: MessageTextSegment[] }
  | { kind: 'event'; event: EventDetails; onPress: () => void }
  | { kind: 'connected'; label: string }

export interface ExtendedChatMessage extends IMessage {
  content: ChatMessageContentData
  createdAt: Date
  eventStyles?: EventStyles
}

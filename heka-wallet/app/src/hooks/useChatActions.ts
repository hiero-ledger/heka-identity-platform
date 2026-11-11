import { BasicMessageMetadata, basicMessageCustomMetadata } from '@bifold/core'
import { useBasicMessagesByConnectionId } from '@bifold/react-hooks'
import { DidCommBasicMessageRepository } from '@credo-ts/didcomm'
import { useCallback, useEffect } from 'react'
import { IMessage } from 'react-native-gifted-chat'

import { useHekaAgent } from '../utils/agent'
import { formatError } from '../utils/error'

interface ChatActions {
  sendMessage: (messages: IMessage[]) => Promise<void>
}

/**
 * Marks the connection's basic messages as seen while the chat is open, and sends
 * the composed chat messages as one DIDComm basic message.
 */
export function useChatActions(connectionId: string): ChatActions {
  const { agent } = useHekaAgent()
  const basicMessages = useBasicMessagesByConnectionId(connectionId)

  useEffect(() => {
    basicMessages.forEach((msg) => {
      const meta = msg.metadata.get(BasicMessageMetadata.customMetadata) as basicMessageCustomMetadata
      if (agent && !meta?.seen) {
        msg.metadata.set(BasicMessageMetadata.customMetadata, { ...meta, seen: true })
        const basicMessageRepository = agent.context.dependencyManager.resolve(DidCommBasicMessageRepository)
        basicMessageRepository.update(agent.context, msg).catch((error: unknown) =>
          agent.config.logger.error('Failed to mark a basic message as seen', {
            basicMessageId: msg.id,
            error: formatError(error),
          })
        )
      }
    })
  }, [basicMessages, agent])

  const sendMessage = useCallback(
    async (messages: IMessage[]) => {
      const message = messages
        ?.map((s) => s.text?.trim())
        ?.join('\n')
        .replace(/(\n)+/g, '\n')
        .trim()
      await agent?.didcomm.basicMessages.sendMessage(connectionId, message)
    },
    [agent, connectionId]
  )

  return { sendMessage }
}

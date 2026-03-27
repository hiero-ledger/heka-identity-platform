import { useAgent } from '@bifold/react-hooks'
import {
  DidCommBasicMessageEventTypes,
  DidCommBasicMessageRole,
  DidCommBasicMessageStateChangedEvent,
} from '@credo-ts/didcomm'
import { useEffect } from 'react'

import { useInvitationHandlers } from './useInvitationHandlers'

export const useBasicMessageInvitations = () => {
  const { agent } = useAgent()

  const { handleInvitationUrl } = useInvitationHandlers()

  useEffect(() => {
    if (!agent) return

    const listener = async (event: DidCommBasicMessageStateChangedEvent) => {
      const { basicMessageRecord } = event.payload

      if (basicMessageRecord.role === DidCommBasicMessageRole.Receiver) {
        await handleInvitationUrl(basicMessageRecord.content)
      }
    }

    agent.events.on(DidCommBasicMessageEventTypes.DidCommBasicMessageStateChanged, listener)

    return () => agent.events.off(DidCommBasicMessageEventTypes.DidCommBasicMessageStateChanged, listener)
  }, [agent, handleInvitationUrl])
}

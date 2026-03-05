import { BasicMessageEventTypes, BasicMessageRole, BasicMessageStateChangedEvent } from '@credo-ts/core'
import { useAgent } from '@credo-ts/react-hooks'
import { useEffect } from 'react'

import { useInvitationHandlers } from './useInvitationHandlers'

export const useBasicMessageInvitations = () => {
  const { agent } = useAgent()

  const { handleInvitationUrl } = useInvitationHandlers()

  useEffect(() => {
    if (!agent) return

    const listener = async (event: BasicMessageStateChangedEvent) => {
      const { basicMessageRecord } = event.payload

      if (basicMessageRecord.role === BasicMessageRole.Receiver) {
        await handleInvitationUrl(basicMessageRecord.content)
      }
    }

    agent.events.on(BasicMessageEventTypes.BasicMessageStateChanged, listener)

    return () => agent.events.off(BasicMessageEventTypes.BasicMessageStateChanged, listener)
  }, [agent, handleInvitationUrl])
}

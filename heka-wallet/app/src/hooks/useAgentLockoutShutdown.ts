import { useStore } from '@bifold/core'
import { useEffect, useRef, useState } from 'react'

import { type HekaWalletAgent, useHekaAgent } from '../utils/agent'

// Shutdown waits for every open DIDComm socket to close; a mediator socket that went stale
// in the background can hold it for a minute or more. Stop waiting after this.
export const AGENT_SHUTDOWN_TIMEOUT_MS = 10000

async function shutdownAgentForLockout(agent: HekaWalletAgent): Promise<void> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<'timeout'>((resolve) => {
    timeoutId = setTimeout(() => resolve('timeout'), AGENT_SHUTDOWN_TIMEOUT_MS)
  })

  try {
    const result = await Promise.race([agent.shutdown(), timedOut])
    if (result === 'timeout') {
      console.warn(
        `Agent shutdown did not finish in ${AGENT_SHUTDOWN_TIMEOUT_MS} ms during lockout, dropping the agent`
      )
    }
  } catch (err) {
    console.warn(`Agent shutdown failed during lockout: ${err}`)
  } finally {
    clearTimeout(timeoutId)
  }
}

// Shuts the agent down on lockout and returns the agent being shut down, or null.
// Must run above RootStack: logout unmounts BifoldStack while the shutdown is still pending.
export const useAgentLockoutShutdown = (): HekaWalletAgent | null => {
  const [store] = useStore()
  const { agent, setAgent } = useHekaAgent()
  const [shuttingDownAgent, setShuttingDownAgent] = useState<HekaWalletAgent | null>(null)
  const currentAgent = useRef(agent)

  useEffect(() => {
    currentAgent.current = agent
  }, [agent])

  useEffect(() => {
    // Shut down and erase the agent so the onboarding workflow re-runs Splash on re-unlock.
    // An unlock during the shutdown must not cancel this, or the app keeps the shut-down agent.
    if (store.authentication.didAuthenticate || !agent || agent === shuttingDownAgent) return

    setShuttingDownAgent(agent)
    shutdownAgentForLockout(agent).finally(() => {
      // Splash may have set a fresh agent meanwhile; keep it
      if (currentAgent.current === agent) setAgent(null)
      // A newer agent may be shutting down by now; keep its marker
      setShuttingDownAgent((current) => (current === agent ? null : current))
    })
  }, [store.authentication.didAuthenticate, agent, shuttingDownAgent, setAgent])

  return shuttingDownAgent
}

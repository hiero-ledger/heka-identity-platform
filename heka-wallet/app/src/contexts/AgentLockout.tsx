import type { PropsWithChildren } from 'react'
import type * as React from 'react'

import { createContext, useContext } from 'react'

import { useAgentLockoutShutdown } from '../hooks/useAgentLockoutShutdown'
import { type HekaWalletAgent } from '../utils/agent'

const AgentLockoutContext = createContext<HekaWalletAgent | null>(null)

// Lives outside RootStack so a lockout shutdown survives logout and a new login.
export const AgentLockoutProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const shuttingDownAgent = useAgentLockoutShutdown()

  return <AgentLockoutContext.Provider value={shuttingDownAgent}>{children}</AgentLockoutContext.Provider>
}

export const useShuttingDownAgent = (): HekaWalletAgent | null => useContext(AgentLockoutContext)

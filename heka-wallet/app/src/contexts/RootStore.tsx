import React, { createContext, PropsWithChildren, useContext, useState } from 'react'

import { RootStore } from '../stores'

export const RootStoreContext = createContext<RootStore | null>(null)

export const RootStoreProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const [state] = useState<RootStore>(() => new RootStore())
  return <RootStoreContext.Provider value={state}>{children}</RootStoreContext.Provider>
}

export function useRootStore(): RootStore {
  const context = useContext(RootStoreContext)
  if (!context) {
    throw new Error('useRootStore must be used within a RootStoreProvider')
  }
  return context
}

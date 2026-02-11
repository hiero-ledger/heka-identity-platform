import React, { createContext, PropsWithChildren, useContext, useState } from 'react'

import { KeplrStore, KeplrConfig } from './KeplrStore'

export const KeplrStoreContext = createContext<KeplrStore | null>(null)

interface Props {
  config: KeplrConfig
}

export const KeplrStoreProvider: React.FC<PropsWithChildren<Props>> = ({ config, children }) => {
  const [state] = useState<KeplrStore>(() => new KeplrStore(config))
  return <KeplrStoreContext.Provider value={state}>{children}</KeplrStoreContext.Provider>
}

export function useKeplrStore(): KeplrStore {
  const context = useContext(KeplrStoreContext)
  if (!context) {
    throw new Error('useKeplrStore must be used within a KeplrStoreProvider')
  }
  return context
}

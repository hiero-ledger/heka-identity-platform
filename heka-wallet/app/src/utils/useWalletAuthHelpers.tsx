import { LockoutReason, useAuth } from '@bifold/core'
import { useCallback } from 'react'

export const useWalletAuthHelpers = () => {
  const { lockOutUser } = useAuth()

  // BifoldStack shuts the agent down once the wallet is locked; doing it here would race with that
  const lockWallet = useCallback(() => lockOutUser(LockoutReason.Logout), [lockOutUser])

  return { lockWallet }
}

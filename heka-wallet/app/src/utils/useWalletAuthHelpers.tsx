import { DispatchAction, useAuth, useStore } from '@bifold/core'
import { useCallback } from 'react'

import { useHekaAgent } from './agent'

export const useWalletAuthHelpers = () => {
  const { agent } = useHekaAgent()
  const [state, dispatch] = useStore()
  const { removeSavedWalletSecret } = useAuth()

  const lockWallet = useCallback(async () => {
    if (!agent || !state.authentication.didAuthenticate) return

    removeSavedWalletSecret()
    await agent.shutdown()

    dispatch({
      type: DispatchAction.DID_AUTHENTICATE,
      payload: [{ didAuthenticate: false }],
    })

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent, dispatch, state.authentication.didAuthenticate])
  // Here 'removeSavedWalletSecret' is not placed in callback dependencies intentionally
  // The reason is that its implementation is not wrapped in useCallback and may cause updates on every re-render

  return { lockWallet }
}

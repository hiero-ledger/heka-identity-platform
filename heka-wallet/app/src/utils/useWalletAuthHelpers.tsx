import { DispatchAction, useAuth, useStore } from '@bifold/core'
import { useAgent } from '@bifold/react-hooks'
import { useCallback } from 'react'

export const useWalletAuthHelpers = () => {
  const { agent } = useAgent()
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

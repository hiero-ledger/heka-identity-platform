import React, { useEffect, useState } from 'react'

import LoadingView from '../components/views/LoadingView'
import { useAgentInitialization } from '../hooks/useAgentInitialization'

/**
 * To customize this splash screen set the background color of the
 * iOS and Android launch screen to match the background color of this view.
 */
export const Splash: React.FC = () => {
  const [mounted, setMounted] = useState(false)

  // Defer agent initialization until the screen has mounted to avoid running it
  // against a half-initialized component tree.
  useEffect(() => {
    setMounted(true)
  }, [])

  useAgentInitialization(mounted)

  return <LoadingView />
}

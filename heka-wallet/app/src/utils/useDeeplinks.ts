import { useEffect } from 'react'
import { Linking } from 'react-native'

import { useInvitationHandlers } from './useInvitationHandlers'

export const useDeeplinks = () => {
  const { handleInvitationUrl } = useInvitationHandlers()

  useEffect(() => {
    Linking.addEventListener('url', ({ url }) => handleInvitationUrl(url))
    return () => Linking.removeAllListeners('url')
  }, [handleInvitationUrl])
}

import { useEffect } from 'react'
import { Linking } from 'react-native'

import { useInvitationHandlers } from './useInvitationHandlers'

export const useDeeplinks = () => {
  const { handleInvitationUrl } = useInvitationHandlers()

  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => handleInvitationUrl(url))
    return () => subscription.remove()
  }, [handleInvitationUrl])
}

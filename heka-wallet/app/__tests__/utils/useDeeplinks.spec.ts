import { renderHook } from '@testing-library/react-native'
import { EmitterSubscription, Linking } from 'react-native'

import { useDeeplinks } from '../../src/utils/useDeeplinks'

jest.mock('../../src/utils/useInvitationHandlers', () => {
  const handlers = { handleInvitationUrl: jest.fn() }
  return { useInvitationHandlers: () => handlers }
})

describe('useDeeplinks', () => {
  it('removes its own url listener on unmount', () => {
    const subscription = { remove: jest.fn() } as unknown as EmitterSubscription
    jest.spyOn(Linking, 'addEventListener').mockReturnValue(subscription)

    const { unmount } = renderHook(() => useDeeplinks())
    unmount()

    expect(subscription.remove).toBeCalledTimes(1)
  })
})

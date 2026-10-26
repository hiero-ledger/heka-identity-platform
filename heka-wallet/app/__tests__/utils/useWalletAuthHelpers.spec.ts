import { renderHook } from '@testing-library/react-native'

import { useWalletAuthHelpers } from '../../src/utils/useWalletAuthHelpers'

const mockLockOutUser = jest.fn()
const mockShutdown = jest.fn(() => Promise.resolve())

jest.mock('@bifold/core', () => ({
  __esModule: true,
  LockoutReason: { Timeout: 'Timeout', Logout: 'Logout' },
  DispatchAction: { DID_AUTHENTICATE: 'authentication/didAuthenticate' },
  useAuth: () => ({ lockOutUser: mockLockOutUser, removeSavedWalletSecret: jest.fn() }),
  useStore: () => [{ authentication: { didAuthenticate: true } }, jest.fn()],
}))

// utils/agent.ts eagerly imports native/ESM Credo modules; only the hook is needed here.
jest.mock('../../src/utils/agent', () => ({
  useHekaAgent: () => ({ agent: { shutdown: mockShutdown }, setAgent: jest.fn() }),
}))

describe('useWalletAuthHelpers.lockWallet', () => {
  beforeEach(() => jest.clearAllMocks())

  it('locks the wallet through Bifold lockOutUser with the logout reason', async () => {
    const { result } = renderHook(() => useWalletAuthHelpers())

    await result.current.lockWallet()

    expect(mockLockOutUser).toHaveBeenCalledWith('Logout')
  })

  it('leaves the agent shutdown to the lockout in BifoldStack', async () => {
    const { result } = renderHook(() => useWalletAuthHelpers())

    await result.current.lockWallet()

    expect(mockShutdown).not.toHaveBeenCalled()
  })
})

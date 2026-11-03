import { act, render, waitFor } from '@testing-library/react-native'
import React from 'react'
import { DeviceEventEmitter } from 'react-native'

import { Splash } from '../../src/screens/Splash'
import { createAgent, createPublicDidOrGetExisting } from '../../src/utils/agent'

const mockSetAgent = jest.fn()
const mockSetPublicDid = jest.fn()
// The mounted Splash's store dispatch, so a test can change an init dependency on the same instance.
let mockStoreDispatch: (action: { type: string }) => void = () => undefined

interface MockStoreState {
  authentication: { didAuthenticate: boolean }
  attestation: { isAttestationComplete: boolean }
  onboarding: { didConsiderBiometry: boolean }
  migration: { didMigrateToAskar: boolean }
  preferences: { walletName?: string }
}

jest.mock('@bifold/core', () => {
  const { useReducer } = jest.requireActual('react')
  const reducer = (state: MockStoreState, action: { type: string }): MockStoreState => {
    switch (action.type) {
      case 'migration/didMigrateToAskar':
        return { ...state, migration: { didMigrateToAskar: true } }
      case 'attestation/setAttestationCompleted':
        return { ...state, attestation: { isAttestationComplete: true } }
      default:
        return state
    }
  }
  const initialState: MockStoreState = {
    authentication: { didAuthenticate: true },
    attestation: { isAttestationComplete: true },
    onboarding: { didConsiderBiometry: true },
    migration: { didMigrateToAskar: false },
    preferences: {},
  }
  const auth = { getWalletSecret: jest.fn().mockResolvedValue({ id: 'wallet-id', key: 'wallet-key', salt: 'salt' }) }
  const services = [[], { info: jest.fn(), warn: jest.fn() }]
  return {
    BifoldError: class extends Error {},
    DispatchAction: {
      DID_MIGRATE_TO_ASKAR: 'migration/didMigrateToAskar',
      SET_ATTESTATION_COMPLETED: 'attestation/setAttestationCompleted',
    },
    EventTypes: { ERROR_ADDED: 'ErrorAdded' },
    TOKENS: { UTIL_LEDGERS: 'ledgers', UTIL_LOGGER: 'logger' },
    useAuth: () => auth,
    useServices: () => services,
    useStore: () => {
      const store = useReducer(reducer, initialState)
      mockStoreDispatch = store[1]
      return store
    },
  }
})

jest.mock('@credo-ts/didcomm', () => ({
  DidCommHttpOutboundTransport: jest.fn(),
  DidCommWsOutboundTransport: jest.fn(),
}))

jest.mock('@heka-wallet/shared', () => jest.requireActual('../../../jest-helpers/__mocks__/logger').default)

jest.mock('react-i18next', () => {
  const translation = { t: (key: string) => key }
  return { useTranslation: () => translation }
})

jest.mock('../../src/components/views/LoadingView', () => ({ __esModule: true, default: () => null }))

jest.mock('../../src/config', () => ({
  indyBesuConfig: {},
  isExampleCredentialEnabled: false,
  isPublicInvitationEnabled: false,
}))

jest.mock('../../src/utils/agent', () => {
  const { useCallback, useState } = jest.requireActual('react')
  // Stateful like Bifold's AgentProvider: setAgent stores the agent and re-renders.
  const useHekaAgent = () => {
    const [agent, setAgentState] = useState(undefined)
    const setAgent = useCallback((newAgent: unknown) => {
      mockSetAgent(newAgent)
      setAgentState(newAgent)
    }, [])
    const setPublicDid = useCallback((did: string) => mockSetPublicDid(did), [])
    return { agent, setAgent, setPublicDid }
  }
  return {
    createAgent: jest.fn(),
    createAnoncredsLinkSecretIfRequired: jest.fn(),
    createPublicDidOrGetExisting: jest.fn().mockResolvedValue('did:example:public'),
    createPublicInvitationWhenMediatorReady: jest.fn(),
    ensureExampleCredentialCreated: jest.fn(),
    getMediatorSource: jest.fn(),
    trySetupMediator: jest.fn(),
    tryRestartExistingAgent: jest.fn(),
    useHekaAgent,
  }
})

describe('Splash', () => {
  it('creates one agent although the init changes its own dependencies', async () => {
    const newAgent = {
      didcomm: { registerOutboundTransport: jest.fn() },
      isInitialized: true,
      initialize: jest.fn().mockResolvedValue(undefined),
    }
    jest.mocked(createAgent).mockResolvedValue(newAgent as never)

    // Hold the public DID step, as real ledger I/O does, so React re-renders mid-init.
    let resolvePublicDid: (did: string) => void = () => undefined
    jest.mocked(createPublicDidOrGetExisting).mockReturnValue(
      new Promise<string>((resolve) => {
        resolvePublicDid = resolve
      })
    )

    render(<Splash />)

    await waitFor(() => expect(createPublicDidOrGetExisting).toBeCalled())
    // Let React render the DID_MIGRATE_TO_ASKAR dispatch made earlier in the init.
    await act(async () => {
      await new Promise((resolve) => setImmediate(resolve))
    })

    await act(async () => {
      resolvePublicDid('did:example:public')
    })

    await waitFor(() => expect(mockSetAgent).toBeCalledWith(newAgent))
    await waitFor(() => expect(mockSetPublicDid).toBeCalledTimes(1))
    expect(createAgent).toBeCalledTimes(1)
  })

  it('reports a failed init and retries it when a dependency changes', async () => {
    const emitSpy = jest.spyOn(DeviceEventEmitter, 'emit')
    jest.mocked(createAgent).mockRejectedValue(new Error('Wallet is locked'))

    render(<Splash />)

    await waitFor(() => expect(emitSpy).toBeCalledWith('ErrorAdded', expect.any(Error)))
    expect(createAgent).toBeCalledTimes(1)
    expect(mockSetAgent).not.toBeCalled()

    // Same mounted instance, so the in-progress guard is the one the failed init left behind.
    await act(async () => {
      mockStoreDispatch({ type: 'migration/didMigrateToAskar' })
    })

    await waitFor(() => expect(createAgent).toBeCalledTimes(2))
  })
})

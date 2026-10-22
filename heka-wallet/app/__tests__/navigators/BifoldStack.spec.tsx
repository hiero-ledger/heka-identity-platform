import { act, render, screen } from '@testing-library/react-native'
import React, { createContext, useContext, useState, type MutableRefObject } from 'react'
import { DeviceEventEmitter, Text } from 'react-native'

import { AGENT_SHUTDOWN_TIMEOUT_MS, BifoldStack } from '../../src/navigators/BifoldStack'

type FakeAgent = { shutdown: jest.Mock<Promise<void>, []> }

type HarnessValue = {
  didAuthenticate: boolean
  agent: FakeAgent | null
  setAgent: (agent: FakeAgent | null) => void
}

type HarnessControls = {
  setDidAuthenticate: (value: boolean) => void
  currentAgent: () => FakeAgent | null
}

const DID_COMPLETE_ONBOARDING = 'DidCompleteOnboarding'
const MAIN_STACK = 'main-stack'
const ONBOARDING_STACK = 'onboarding-stack'

// Shared by the @bifold/core and agent mocks; read lazily, so the hoisted factories never touch it early.
const mockHarnessContext = createContext<HarnessValue | null>(null)

const mockUseHarness = (): HarnessValue => {
  const value = useContext(mockHarnessContext)
  if (!value) throw new Error('BifoldStack must be rendered inside the test harness')
  return value
}

const mockDispatch = jest.fn()
const mockLoadState = jest.fn(() => Promise.resolve())
// Stands for PIN entry and Splash: Splash is where a fresh agent gets created.
const mockOnboardingStack = () => <Text>{ONBOARDING_STACK}</Text>
const mockMainStack = () => <Text>{MAIN_STACK}</Text>

jest.mock('@bifold/core', () => ({
  __esModule: true,
  TOKENS: { STACK_ONBOARDING: 'stack.onboarding', LOAD_STATE: 'state.load' },
  EventTypes: { DID_COMPLETE_ONBOARDING: 'DidCompleteOnboarding', ERROR_ADDED: 'ErrorAdded' },
  BifoldError: class extends Error {},
  ActivityProvider: ({ children }: { children: React.ReactNode }) => children,
  MainStack: () => mockMainStack(),
  useServices: () => [mockOnboardingStack, mockLoadState],
  useStore: () => [
    { stateLoaded: true, authentication: { didAuthenticate: mockUseHarness().didAuthenticate } },
    mockDispatch,
  ],
}))

// utils/agent.ts eagerly imports native/ESM Credo modules; only the hook is needed here.
jest.mock('../../src/utils/agent', () => ({
  useHekaAgent: () => {
    const { agent, setAgent } = mockUseHarness()
    return { agent, setAgent }
  },
}))

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const Harness: React.FC<{ initialAgent: FakeAgent; controls: MutableRefObject<HarnessControls | null> }> = ({
  initialAgent,
  controls,
}) => {
  const [agent, setAgent] = useState<FakeAgent | null>(initialAgent)
  const [didAuthenticate, setDidAuthenticate] = useState(true)

  controls.current = { setDidAuthenticate, currentAgent: () => agent }

  return (
    <mockHarnessContext.Provider value={{ didAuthenticate, agent, setAgent }}>
      <BifoldStack />
    </mockHarnessContext.Provider>
  )
}

// Renders an unlocked wallet with a running agent whose shutdown() settles only when the test says so.
// A pending shutdown stands in for Credo waiting on the 'close' event of a dead mediator WebSocket.
function renderUnlockedWallet() {
  const shutdown = deferred()
  const agent: FakeAgent = { shutdown: jest.fn(() => shutdown.promise) }
  const controls: MutableRefObject<HarnessControls | null> = { current: null }

  render(<Harness initialAgent={agent} controls={controls} />)
  act(() => {
    DeviceEventEmitter.emit(DID_COMPLETE_ONBOARDING)
  })
  expect(screen.getByText(MAIN_STACK)).toBeOnTheScreen()

  // controls.current is replaced on every render, so always read it at call time
  const harness = () => controls.current as HarnessControls

  return {
    agent,
    // Bifold lockOutUser after the app was in the background longer than the auto-lock time.
    lock: () => act(() => harness().setDidAuthenticate(false)),
    // Correct PIN (or biometry) on the PIN screen.
    unlock: () => act(() => harness().setDidAuthenticate(true)),
    finishShutdown: () =>
      act(async () => {
        shutdown.resolve()
        // let the lockout effect's continuation after `await agent.shutdown()` run
        await new Promise((resolve) => setImmediate(resolve))
      }),
    failShutdown: () =>
      act(async () => {
        shutdown.reject(new Error('store close failed'))
        await new Promise((resolve) => setImmediate(resolve))
      }),
    currentAgent: () => harness().currentAgent(),
  }
}

describe('BifoldStack lockout', () => {
  it('clears the agent and shows onboarding on unlock when the shutdown finished before unlock', async () => {
    const wallet = renderUnlockedWallet()

    wallet.lock()
    expect(wallet.agent.shutdown).toHaveBeenCalledTimes(1)
    await wallet.finishShutdown()
    wallet.unlock()

    expect(wallet.currentAgent()).toBeNull()
    expect(screen.getByText(ONBOARDING_STACK)).toBeOnTheScreen()
  })

  it('does not show the main stack with an agent that is still shutting down when the user unlocks', async () => {
    const wallet = renderUnlockedWallet()

    wallet.lock()
    wallet.unlock()

    try {
      expect(wallet.agent.shutdown).toHaveBeenCalledTimes(1)
      expect(screen.queryByText(MAIN_STACK)).not.toBeOnTheScreen()
    } finally {
      await wallet.finishShutdown()
    }
  })

  it('clears the shut-down agent so Splash creates a fresh one when the user unlocked during the shutdown', async () => {
    const wallet = renderUnlockedWallet()

    wallet.lock()
    wallet.unlock()
    await wallet.finishShutdown()

    expect(wallet.currentAgent()).toBeNull()
    expect(screen.getByText(ONBOARDING_STACK)).toBeOnTheScreen()
  })

  describe('when the shutdown never finishes', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it('clears the agent after the shutdown timeout', async () => {
      const wallet = renderUnlockedWallet()

      wallet.lock()
      wallet.unlock()
      await act(async () => {
        await jest.advanceTimersByTimeAsync(AGENT_SHUTDOWN_TIMEOUT_MS)
      })

      expect(wallet.currentAgent()).toBeNull()
      expect(screen.getByText(ONBOARDING_STACK)).toBeOnTheScreen()
    })
  })

  it('clears the agent when the shutdown fails', async () => {
    const wallet = renderUnlockedWallet()

    wallet.lock()
    await wallet.failShutdown()
    wallet.unlock()

    expect(wallet.currentAgent()).toBeNull()
    expect(screen.getByText(ONBOARDING_STACK)).toBeOnTheScreen()
  })
})

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import React from 'react'

import PinKeyPad, { COMPACT_KEYPAD_WINDOW_HEIGHT } from '../../src/components/misc/PinKeyPad'

jest.mock('@heka-wallet/shared', () => ({
  ...jest.requireActual('../../../jest-helpers/__mocks__/logger').default,
  useHekaTheme: () => ({
    ColorPalette: { brand: {} },
    TextTheme: {},
    Spacing: { sm: 12, xxl: 32, xxxl: 40 },
    BorderRadius: {},
  }),
}))

jest.mock('../../src/assets/delete.svg', () => 'DeleteIcon')

const mockWindowHeight = { current: 800 }
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 320, height: mockWindowHeight.current, scale: 1, fontScale: 1 }),
}))

// minPINLength in the Bifold mock is 6.
const enterPIN = async (digit: string) => {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      fireEvent.press(screen.getByText(digit))
    })
  }
}

const renderInWindow = (height: number) => {
  mockWindowHeight.current = height
  render(<PinKeyPad onPinEntered={jest.fn().mockResolvedValue(true)} />)
}

describe('PinKeyPad', () => {
  it('uses a compact key margin on a short window so the screen title stays visible', () => {
    renderInWindow(COMPACT_KEYPAD_WINDOW_HEIGHT - 80)

    expect(screen.getByText('1').parent?.parent).toHaveStyle({ marginVertical: 12 })
  })

  it('keeps the full key margin on a tall window', () => {
    renderInWindow(COMPACT_KEYPAD_WINDOW_HEIGHT + 80)

    expect(screen.getByText('1').parent?.parent).toHaveStyle({ marginVertical: 32 })
  })

  it('clears the PIN when the entry handler fails', async () => {
    const onPinEntered = jest.fn().mockRejectedValueOnce(new Error('Unlock failed')).mockResolvedValue(true)
    render(<PinKeyPad onPinEntered={onPinEntered} />)

    await enterPIN('1')
    await waitFor(() => expect(onPinEntered).toBeCalledTimes(1))

    await enterPIN('2')

    await waitFor(() => expect(onPinEntered).toBeCalledTimes(2))
    expect(onPinEntered).toHaveBeenLastCalledWith('222222')
  })

  it('ignores key presses while the PIN is being checked', async () => {
    let rejectFirst: (error: Error) => void = () => undefined
    const onPinEntered = jest
      .fn()
      .mockReturnValueOnce(new Promise<boolean>((_, reject) => (rejectFirst = reject)))
      .mockResolvedValue(true)
    render(<PinKeyPad onPinEntered={onPinEntered} />)

    await enterPIN('1')
    await waitFor(() => expect(onPinEntered).toBeCalledTimes(1))
    await act(async () => {
      fireEvent.press(screen.getByTestId('PinKeyDelete'))
      fireEvent.press(screen.getByText('2'))
    })
    await act(async () => rejectFirst(new Error('Unlock failed')))

    expect(onPinEntered).toBeCalledTimes(1)
  })

  it('accepts keys again after the PIN is rejected', async () => {
    let resolveFirst: (valid: boolean) => void = () => undefined
    const onPinEntered = jest
      .fn()
      .mockReturnValueOnce(new Promise<boolean>((resolve) => (resolveFirst = resolve)))
      .mockResolvedValue(true)
    render(<PinKeyPad onPinEntered={onPinEntered} />)

    await enterPIN('1')
    await waitFor(() => expect(onPinEntered).toBeCalledTimes(1))
    await act(async () => resolveFirst(false))
    await enterPIN('3')

    await waitFor(() => expect(onPinEntered).toBeCalledTimes(2))
    expect(onPinEntered).toHaveBeenLastCalledWith('333333')
  })

  it('submits a PIN once when the entry handler changes while it is checked', async () => {
    let resolveFirst: (valid: boolean) => void = () => undefined
    const firstHandler = jest.fn(() => new Promise<boolean>((resolve) => (resolveFirst = resolve)))
    const nextHandler = jest.fn().mockResolvedValue(false)
    const { rerender } = render(<PinKeyPad onPinEntered={firstHandler} />)

    await enterPIN('1')
    await waitFor(() => expect(firstHandler).toBeCalledTimes(1))

    // PINEnter recreates its handler when a wrong PIN updates the attempt count
    rerender(<PinKeyPad onPinEntered={nextHandler} />)
    await act(async () => resolveFirst(false))

    expect(nextHandler).not.toBeCalled()
  })
})

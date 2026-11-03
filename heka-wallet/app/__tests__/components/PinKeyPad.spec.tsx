import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import React from 'react'

import PinKeyPad from '../../src/components/misc/PinKeyPad'

jest.mock('@heka-wallet/shared', () => ({
  ...jest.requireActual('../../../jest-helpers/__mocks__/logger').default,
  useHekaTheme: () => ({
    ColorPalette: { brand: {} },
    TextTheme: {},
    Spacing: {},
    BorderRadius: {},
  }),
}))

jest.mock('../../src/assets/delete.svg', () => 'DeleteIcon')

// minPINLength in the Bifold mock is 6.
const enterPIN = async (digit: string) => {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      fireEvent.press(screen.getByText(digit))
    })
  }
}

describe('PinKeyPad', () => {
  it('clears the PIN when the entry handler fails', async () => {
    const onPinEntered = jest.fn().mockRejectedValueOnce(new Error('Unlock failed')).mockResolvedValue(true)
    render(<PinKeyPad onPinEntered={onPinEntered} />)

    await enterPIN('1')
    await waitFor(() => expect(onPinEntered).toBeCalledTimes(1))

    await enterPIN('2')

    await waitFor(() => expect(onPinEntered).toBeCalledTimes(2))
    expect(onPinEntered).toHaveBeenLastCalledWith('222222')
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

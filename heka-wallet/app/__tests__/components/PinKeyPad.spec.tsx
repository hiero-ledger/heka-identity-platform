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
})

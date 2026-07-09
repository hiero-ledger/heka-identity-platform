import { renderHook, act, waitFor } from '@testing-library/react-native'
import { useSimpleTimer } from '../../src/utils/useSimpleTimer'

describe('useSimpleTimer', () => {
  beforeAll(() => {
    jest.useFakeTimers()
  })

  afterAll(() => jest.useRealTimers())

  it('should schedule correct timer', async () => {
    const timeoutMs = 500

    const { result } = renderHook(useSimpleTimer)

    // Initially not timed out
    expect(result.current.isTimedOut).toBe(false)

    // Start timer — isTimedOut becomes true (timeoutId is set)
    act(() => {
      result.current.setTimer(timeoutMs)
    })
    expect(result.current.isTimedOut).toBe(true)

    // Advance past timeout — isTimedOut becomes false (timeoutId cleared)
    act(() => {
      jest.advanceTimersByTime(timeoutMs)
    })

    await waitFor(() => {
      expect(result.current.isTimedOut).toBe(false)
    })
  })
})

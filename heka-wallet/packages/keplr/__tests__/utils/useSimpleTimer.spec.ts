import { renderHook, waitFor } from '@testing-library/react-native'
import { useSimpleTimer } from '../../src/utils/useSimpleTimer'

describe('useSimpleTimer', () => {
  beforeAll(() => {
    jest.useFakeTimers()
    jest.spyOn(global, 'setTimeout')
    jest.spyOn(global, 'clearTimeout')
  })

  afterAll(() => jest.useRealTimers())

  it('should schedule correct timer', async () => {
    const timeoutMs = 500

    const { result } = renderHook(useSimpleTimer)

    await waitFor(() => {
      result.current.setTimer(timeoutMs)
      expect(result.current.isTimedOut).toBe(false)

      jest.advanceTimersByTime(timeoutMs)

      expect(result.current.isTimedOut).toBe(true)
    })

    expect(setTimeout).toBeCalledTimes(1)
    expect(setTimeout).toBeCalledWith(expect.any(Function), timeoutMs)

    expect(clearTimeout).toBeCalledTimes(1)
  })
})

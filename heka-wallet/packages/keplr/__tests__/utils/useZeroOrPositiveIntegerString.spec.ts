import { act, renderHook } from '@testing-library/react-native'
import { useZeroOrPositiveIntegerString } from '../../src/utils/useZeroOrPositiveIntegerString'

// Workaround to resolve errors related to leaking imports from shared package
jest.mock('@bifold/core', () => ({
  __esModule: true,
  ImageAssets: { svg: {} },
  useTheme: jest.fn(() => ({})),
}))
jest.mock('@react-navigation/elements', () => ({ __esModule: true }))

interface TestData {
  input: string
  expectedResult: number
}

describe('useZeroOrPositiveIntegerString', () => {
  it.each([
    { input: '10', expectedResult: 10 },
    { input: '   10   ', expectedResult: 10 },
    { input: '10.0011', expectedResult: 10 },
    { input: '0.9', expectedResult: 0 },
    { input: '-10', expectedResult: 0 },
    { input: '-10.0011', expectedResult: 0 },
  ] as TestData[])('should provide correct integer', ({ input, expectedResult }) => {
    const { result } = renderHook(() => useZeroOrPositiveIntegerString(input))
    expect(result.current).toStrictEqual(
      expect.objectContaining<Partial<typeof result.current>>({ number: expectedResult, value: input, isEmpty: false })
    )
  })

  it('should set a new value', async () => {
    const { result } = renderHook(() => useZeroOrPositiveIntegerString('10'))

    expect(result.current).toStrictEqual(
      expect.objectContaining<Partial<typeof result.current>>({ number: 10, value: '10', isEmpty: false })
    )

    act(() => result.current.setValue('20'))

    expect(result.current).toStrictEqual(
      expect.objectContaining<Partial<typeof result.current>>({ number: 20, value: '20', isEmpty: false })
    )
  })

  it('should provide NaN if empty', () => {
    const { result } = renderHook(() => useZeroOrPositiveIntegerString(''))

    expect(result.current).toStrictEqual(
      expect.objectContaining<Partial<typeof result.current>>({ number: NaN, value: '', isEmpty: true })
    )
  })
})

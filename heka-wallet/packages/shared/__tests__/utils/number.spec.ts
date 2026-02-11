import { tryParseInt } from '../../src/utils/number'

interface TryParseIntTestData {
  input: string
  expectedResult: number
}

describe('Number Utils', () => {
  describe('tryParseInt', () => {
    it.each([
      { input: '10', expectedResult: 10 },
      { input: '   10   ', expectedResult: 10 },
      { input: '10.0011', expectedResult: 10 },
      { input: '0.9', expectedResult: 0 },
      { input: '-0.9', expectedResult: -0 },
      { input: '-10', expectedResult: -10 },
      { input: '-10.0011', expectedResult: -10 },
    ] as TryParseIntTestData[])(
      'should return correct integer value',
      ({ input, expectedResult }: TryParseIntTestData) => {
        expect(tryParseInt(input)).toBe(expectedResult)
      }
    )

    it.each([null, undefined, 'NaN', ''])(
      'should return null if input is not a number string and there is no default value',
      (input) => {
        expect(tryParseInt(input)).toBeNull()
      }
    )

    it.each([null, undefined, 'NaN', ''])(
      'should return provided default value if input is not a number string',
      (input) => {
        const defaultValue = 10
        expect(tryParseInt(input, defaultValue)).toBe(defaultValue)
      }
    )
  })
})

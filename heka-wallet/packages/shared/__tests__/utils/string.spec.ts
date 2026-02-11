import { countSubstring, sanitizeString } from '../../src/utils/string'

interface CountSubstringTestData {
  str: string
  subStr: string
  expectedCount: number
}

interface SanitizeStringTestData {
  input: string
  expectedResult: string
}

describe('String Utils', () => {
  describe('countSubstring', () => {
    it.each([
      {
        str: 'test123test123test',
        subStr: '123',
        expectedCount: 2,
      },
      {
        str: 'test123test12123321123',
        subStr: '123',
        expectedCount: 3,
      },
      {
        str: 'test123test12123321123',
        subStr: 'test1234',
        expectedCount: 0,
      },
    ] as CountSubstringTestData[])(
      'should return correct substring count',
      ({ str, subStr, expectedCount }: CountSubstringTestData) => {
        expect(countSubstring(str, subStr)).toBe(expectedCount)
      }
    )
  })

  describe('sanitizeString', () => {
    it.each([
      {
        input: 'testCamelCaseString',
        expectedResult: 'Test camel case string',
      },
      {
        input: 'test_snake_case_string',
        expectedResult: 'Test snake case string',
      },
    ] as SanitizeStringTestData[])(
      'should return correct sanitized string',
      ({ input, expectedResult }: SanitizeStringTestData) => {
        expect(sanitizeString(input)).toBe(expectedResult)
      }
    )
  })
})

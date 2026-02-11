import { getHostNameFromUrl } from '../../src/utils/url'

interface GetHostNameFromUrlTestData {
  input: string
  expectedResult: string | undefined
}

describe('Url Utils', () => {
  describe('getHostNameFromUrl', () => {
    it('should return correct hostname', () => {})
    it.each([
      {
        input: 'https://localhost/',
        expectedResult: 'localhost',
      },
      {
        input: 'https://localhost:3000/',
        expectedResult: 'localhost',
      },
      {
        input: 'https://localhost.test.com/testPath/testAction',
        expectedResult: 'localhost.test.com',
      },
      {
        input: 'https:/localhost',
        expectedResult: undefined,
      },
      {
        input: '/localhost.com/',
        expectedResult: undefined,
      },
    ] as GetHostNameFromUrlTestData[])(
      'should return correct hostname',
      ({ input, expectedResult }: GetHostNameFromUrlTestData) => {
        expect(getHostNameFromUrl(input)).toBe(expectedResult)
      }
    )
  })
})

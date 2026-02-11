import { isPrivateKey, getPrivateKey, trimWords } from '../../src/utils/mnemonic'
import { Buffer } from 'buffer'

interface IsPrivateKeyTestData {
  mnemonic: string
  expectedResult: boolean
}

const privateKeyHex = '14c625b98183d7f3ceb15658c54d3fd9b55cc58b581a068b50a6829ffcb90b22'
const privateKeyHexWithPrefix = `0x${privateKeyHex}`

describe('Mnemonic Utils', () => {
  describe('isPrivateKey', () => {
    it.each([
      {
        mnemonic: privateKeyHex,
        expectedResult: true,
      },
      {
        mnemonic: privateKeyHexWithPrefix,
        expectedResult: true,
      },
      {
        mnemonic: 'invalidPrivateKey',
        expectedResult: false,
      },
    ] as IsPrivateKeyTestData[])(
      'should return correct result',
      ({ mnemonic, expectedResult }: IsPrivateKeyTestData) => {
        expect(isPrivateKey(mnemonic)).toBe(expectedResult)
      }
    )
  })

  describe('getPrivateKey', () => {
    it('should return correct buffer from hex string', () => {
      const expectedResult = Buffer.from(privateKeyHex, 'hex')

      const result = getPrivateKey(privateKeyHex)

      expect(result).toStrictEqual(expectedResult)
    })

    it('should return the same result for hex string with binary prefix', () => {
      const expectedResult = Buffer.from(privateKeyHex, 'hex')

      const result = getPrivateKey(privateKeyHex)
      const resultWithPrefix = getPrivateKey(privateKeyHexWithPrefix)

      expect(result).toStrictEqual(expectedResult)
      expect(resultWithPrefix).toStrictEqual(expectedResult)
    })
  })

  describe('trimWords', () => {
    it('should trim whitespaces', () => {
      expect(trimWords(' word1    word2   ')).toBe('word1 word2')
    })

    it('should trim newlines and empty lines', () => {
      const multilineWords = `
        word1
        
        word2
             
        word3
        `
      expect(trimWords(multilineWords)).toBe('word1 word2 word3')
    })
  })
})

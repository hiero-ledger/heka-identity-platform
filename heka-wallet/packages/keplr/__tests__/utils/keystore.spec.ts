import { getKeyStoreParagraph } from '../../src/utils/keystore'
import { MultiKeyStoreInfoWithSelectedElem } from '@keplr-wallet/background'

interface GetKeyStoreParagraphTestData {
  keyStore: MultiKeyStoreInfoWithSelectedElem
  expectedResult?: string
}

describe('Keystore Utils', () => {
  describe('getKeyStoreParagraph', () => {
    it.each([
      {
        keyStore: { type: 'ledger', bip44HDPath: { account: 0, change: 0, addressIndex: 0 } },
        expectedResult: `Ledger - m/44'/118'/0'`,
      },
      {
        keyStore: { type: 'ledger', bip44HDPath: { account: 1, change: 0, addressIndex: 1 } },
        expectedResult: `Ledger - m/44'/118'/1'/0/1`,
      },
      {
        keyStore: { type: 'mnemonic', bip44HDPath: { account: 0, change: 0, addressIndex: 0 } },
        expectedResult: undefined,
      },
      {
        keyStore: { type: 'mnemonic', bip44HDPath: { account: 1, change: 0, addressIndex: 1 } },
        expectedResult: `Mnemonic - m/44'/-/1'/0/1`,
      },
      {
        keyStore: { type: 'privateKey', meta: { email: 'test@test.com' } },
        expectedResult: 'test@test.com',
      },
    ] as GetKeyStoreParagraphTestData[])(
      'should return correct value based on keystore type and BIP44 HD Path',
      ({ keyStore, expectedResult }: GetKeyStoreParagraphTestData) => {
        expect(getKeyStoreParagraph(keyStore)).toBe(expectedResult)
      }
    )
  })
})

import { loadWalletSalt, secretForPIN } from '@bifold/core/src/services/keychain'

import { mockFunction } from '../../../jest-helpers/helpers'
import { createDcApiAgent } from '../../src/utils/createDcApiAgent'
import { unlockDcApiAgent } from '../../src/utils/unlockDcApiAgent'

jest.mock('@bifold/core/src/services/keychain', () => ({
  loadWalletSalt: jest.fn(),
  secretForPIN: jest.fn(),
}))

jest.mock('@credo-ts/askar', () => ({
  AskarStoreInvalidKeyError: class AskarStoreInvalidKeyError extends Error {},
}))

jest.mock('../../src/utils/createDcApiAgent', () => ({ createDcApiAgent: jest.fn() }))

// Imported after the mock so the class is the mocked one.
const { AskarStoreInvalidKeyError } = jest.requireMock('@credo-ts/askar')

const hashPIN = jest.fn()
const secret = { id: 'wallet-id', key: 'wallet-key', salt: 'salt' }

describe('unlockDcApiAgent', () => {
  beforeEach(() => {
    mockFunction(loadWalletSalt).mockResolvedValue({ id: 'wallet-id', salt: 'salt' })
    mockFunction(secretForPIN).mockResolvedValue(secret)
  })

  it('returns the agent opened with the derived key', async () => {
    const agent = { id: 'agent' }
    mockFunction(createDcApiAgent).mockResolvedValue(agent as never)

    await expect(unlockDcApiAgent('123456', hashPIN)).resolves.toBe(agent)
    expect(createDcApiAgent).toBeCalledWith(secret)
  })

  it('returns null when the store rejects the key', async () => {
    mockFunction(createDcApiAgent).mockRejectedValue(new AskarStoreInvalidKeyError('Invalid key'))

    await expect(unlockDcApiAgent('000000', hashPIN)).resolves.toBeNull()
  })

  it('returns null when the invalid key error is the cause', async () => {
    const error = new Error('Agent initialization failed', { cause: new AskarStoreInvalidKeyError('Invalid key') })
    mockFunction(createDcApiAgent).mockRejectedValue(error)

    await expect(unlockDcApiAgent('000000', hashPIN)).resolves.toBeNull()
  })

  it('rethrows any other failure', async () => {
    const error = new Error('Native module failed')
    mockFunction(createDcApiAgent).mockRejectedValue(error)

    await expect(unlockDcApiAgent('123456', hashPIN)).rejects.toBe(error)
  })
})

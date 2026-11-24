import { Agent } from '@credo-ts/core'

import { createDcApiAgent } from '../../src/utils/createDcApiAgent'

jest.mock('@credo-ts/core', () => ({
  Agent: jest.fn(),
  DidsModule: jest.fn(),
  JwkDidResolver: jest.fn(),
  KeyDidResolver: jest.fn(),
  PeerDidResolver: jest.fn(),
  WebDidResolver: jest.fn(),
  X509Module: jest.fn(),
}))
jest.mock('@credo-ts/askar', () => ({ AskarModule: jest.fn() }))
jest.mock('@credo-ts/openid4vc', () => ({ OpenId4VcModule: jest.fn() }))
jest.mock('@openwallet-foundation/askar-react-native', () => ({ NativeAskar: { instance: {} } }))
jest.mock('../../src/logger', () => ({ CredoLogger: jest.fn() }))
jest.mock('../../src/utils/agent', () => ({ TRUSTED_X509_CERTIFICATES: [] }))

describe('createDcApiAgent', () => {
  it('logs a failed shutdown after a failed initialize and rethrows the initialize error', async () => {
    const initializeError = new Error('Invalid key')
    const shutdownError = new Error('Store already closed')
    const agent = {
      initialize: jest.fn().mockRejectedValue(initializeError),
      shutdown: jest.fn().mockRejectedValue(shutdownError),
      config: { logger: { warn: jest.fn() } },
    }
    jest.mocked(Agent).mockImplementation(() => agent as never)

    await expect(createDcApiAgent({ id: 'wallet-id', key: 'wallet-key', salt: 'salt' })).rejects.toBe(initializeError)

    expect(agent.config.logger.warn).toBeCalledWith('DC API agent shutdown after a failed initialize failed', {
      error: shutdownError.stack,
    })
  })
})

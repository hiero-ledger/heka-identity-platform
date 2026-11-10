import { registerCredentials } from '@animo-id/expo-digital-credentials-api'
import { Platform } from 'react-native'

import { mockFunction } from '../../../../jest-helpers/helpers'
import { dcApiRegisterCredentials } from '../../../src/credentials/dcApi/registerCredentials'
import { mapCredentialRecord } from '../../../src/credentials/mappers/credential'
import { HekaWalletAgent } from '../../../src/utils/agent'

jest.mock('@animo-id/expo-digital-credentials-api', () => ({ registerCredentials: jest.fn() }))
jest.mock('../../../src/credentials/mappers/credential', () => ({ mapCredentialRecord: jest.fn() }))
jest.mock('../../../src/credentials/mappers/humanize', () => ({ humanizeAttributeName: (name: string) => name }))
jest.mock('../../../src/utils/agent', () => ({}))

const mdocRecord = {
  id: 'mdoc-record-id',
  firstCredential: {
    docType: 'org.iso.18013.5.1.mDL',
    issuerSignedNamespaces: { 'org.iso.18013.5.1': { given_name: 'Jane' } },
  },
}

const createAgent = () => ({
  mdoc: { getAll: jest.fn().mockResolvedValue([mdocRecord]) },
  sdJwtVc: { getAll: jest.fn().mockResolvedValue([]) },
  config: { logger: { trace: jest.fn(), warn: jest.fn(), error: jest.fn() } },
})

describe('dcApiRegisterCredentials', () => {
  beforeEach(() => {
    Platform.OS = 'android'
  })

  it('logs a display mapping failure and registers the credential with fallback labels', async () => {
    const error = new Error('Mapping failed')
    mockFunction(mapCredentialRecord).mockRejectedValue(error)
    const agent = createAgent()

    await dcApiRegisterCredentials(agent as unknown as HekaWalletAgent)

    expect(agent.config.logger.warn).toBeCalledWith('DC API display mapping failed', {
      recordId: mdocRecord.id,
      error: error.stack,
    })
    expect(registerCredentials).toBeCalledWith(
      expect.objectContaining({
        credentials: [
          expect.objectContaining({
            id: mdocRecord.id,
            display: expect.objectContaining({ title: 'Credential', subtitle: 'Unknown issuer' }),
          }),
        ],
      })
    )
  })
})

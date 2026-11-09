import { DidCommCredentialExchangeRecord } from '@credo-ts/didcomm'

import {
  getAnoncredsCredentialDisplay,
  getSdJwtCredentialDisplay,
  getW3cCredentialDisplay,
} from '../../../src/credentials/mappers/credential-display'
import { HekaWalletAgent } from '../../../src/utils/agent'

jest.mock('@bifold/oca/build/legacy', () => ({
  Attribute: class {
    public constructor(props: object) {
      Object.assign(this, props)
    }
  },
  BrandingOverlayType: { Branding10: 'aries/overlays/branding/1.0' },
  RemoteOCABundleResolver: jest.fn().mockImplementation(() => ({
    checkForUpdates: jest.fn().mockResolvedValue(undefined),
    resolveAllBundles: jest.fn().mockResolvedValue({
      bundle: { bundle: { flaggedAttributes: [] } },
      presentationFields: [],
      metaOverlay: {},
    }),
  })),
}))

jest.mock('@bifold/core', () => ({ getCredentialIdentifiers: jest.fn(() => ({})) }))

jest.mock('@credo-ts/anoncreds', () => ({ AnonCredsCredentialMetadataKey: '_anoncreds/credential' }))

jest.mock('@heka-wallet/shared', () => ({
  getHostNameFromUrl: (url: string) => url,
  sanitizeString: (value: string) => value,
}))

jest.mock('../../../src/config', () => ({
  agencyProviderURL: 'https://oca.example.com',
  fallbackDisplay: {
    credential: { color: '#f58529', logo: 'credential-logo' },
    issuer: { color: '#fff', logo: 'logo' },
  },
}))

jest.mock('../../../src/credentials/mappers/utils', () => ({ parseCredentialName: () => 'Diploma' }))

jest.mock('../../../src/utils/agent', () => ({}))

const agent = {
  didcomm: {
    connections: { findById: jest.fn().mockResolvedValue(null) },
    credentials: { findOfferMessage: jest.fn().mockResolvedValue(null) },
  },
} as unknown as HekaWalletAgent

const createExchangeRecord = (revocationNotification?: object) =>
  ({
    id: 'credential-exchange-id',
    connectionId: 'connection-id',
    credentialAttributes: [],
    metadata: { get: () => ({ schemaId: 'schema-id', credentialDefinitionId: 'cred-def-id' }) },
    revocationNotification,
  }) as unknown as DidCommCredentialExchangeRecord

describe('credential display revocation flag', () => {
  it('is set for a DIDComm AnonCreds credential with a revocation notification', async () => {
    const display = await getAnoncredsCredentialDisplay(
      createExchangeRecord({ revocationDate: new Date(), comment: 'Revoked' }),
      agent
    )

    expect(display.isRevoked).toBe(true)
  })

  it('is not set for a DIDComm AnonCreds credential without a revocation notification', async () => {
    const display = await getAnoncredsCredentialDisplay(createExchangeRecord(), agent)

    expect(display.isRevoked).toBe(false)
  })

  it('is not set for OpenID SD-JWT VC credentials', () => {
    const display = getSdJwtCredentialDisplay({ vct: 'Diploma', iss: 'https://issuer.example.com', name: 'Alice' })

    expect(display.isRevoked).toBeFalsy()
  })

  it('is not set for OpenID W3C credentials', () => {
    const display = getW3cCredentialDisplay({
      type: ['VerifiableCredential', 'Diploma'],
      issuer: { id: 'did:key:issuer' },
      issuanceDate: '2026-01-01T00:00:00Z',
      credentialSubject: { name: 'Alice' },
    })

    expect(display.isRevoked).toBeFalsy()
  })
})

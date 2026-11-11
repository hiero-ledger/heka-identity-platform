import { OpenId4VciCredentialFormatProfile } from '@credo-ts/openid4vc'

import { createCredentialRequestToCredentialMapper, CredentialIssuanceMetadata, tokenStatusListClaim } from '..'

const location = 'https://heka.example/token-status-lists/list-1'
const tokenStatusList = { type: 'token-status-list' as const, location, index: 7, indexes: [7, 42] }

type SdJwtResult = {
  credentials: Array<{
    payload: Record<string, unknown>
    disclosureFrame?: { _sd?: string[] }
  }>
}

describe('tokenStatusListClaim', () => {
  test('adds nothing without a credentialStatus or for a W3C bitstring entry', () => {
    expect(tokenStatusListClaim(undefined)).toEqual({})
    expect(tokenStatusListClaim({ location, index: 3 })).toEqual({})
    expect(tokenStatusListClaim({ type: 'bitstring', location, index: 3 })).toEqual({})
  })

  test('gives each credential of a batch its own entry', () => {
    expect(tokenStatusListClaim(tokenStatusList, 0)).toEqual({ status: { status_list: { idx: 7, uri: location } } })
    expect(tokenStatusListClaim(tokenStatusList, 1)).toEqual({ status: { status_list: { idx: 42, uri: location } } })
  })

  test('falls back to `index` when `indexes` is missing', () => {
    expect(tokenStatusListClaim({ type: 'token-status-list', location, index: 5 })).toEqual({
      status: { status_list: { idx: 5, uri: location } },
    })
  })

  test('throws when the batch is larger than what was reserved', () => {
    expect(() => tokenStatusListClaim(tokenStatusList, 2)).toThrow(/only 2 status-list entries were reserved/)
  })
})

describe('credential mapper — SD-JWT VC status', () => {
  const mapper = createCredentialRequestToCredentialMapper()

  const metadata = (overrides: Partial<CredentialIssuanceMetadata> = {}): CredentialIssuanceMetadata => ({
    format: OpenId4VciCredentialFormatProfile.SdJwtVc,
    type: 'https://example.com/vct',
    credentialSupportedId: 'cred-sd-1',
    issuer: { did: 'did:key:z6MkIssuer', didUrl: 'did:key:z6MkIssuer#z6MkIssuer' },
    payload: { vct: 'https://example.com/vct', given_name: 'Ada' },
    disclosureFrame: { _sd: ['given_name'] },
    ...overrides,
  })

  const map = (credential: CredentialIssuanceMetadata, holderKeys = 1): Promise<SdJwtResult> =>
    mapper({
      agentContext: {},
      issuanceSession: { issuanceMetadata: { credentials: [credential] } },
      holderBinding: {
        keys: Array.from({ length: holderKeys }, (_, index) => ({ method: 'jwk', jwk: { kid: `holder-${index}` } })),
      },
      credentialConfigurationId: 'cred-sd-1',
    } as never) as unknown as Promise<SdJwtResult>

  test('adds an always-disclosed status claim next to the user payload', async () => {
    const { credentials } = await map(metadata({ credentialStatus: tokenStatusList }))

    expect(credentials[0].payload).toEqual({
      vct: 'https://example.com/vct',
      given_name: 'Ada',
      status: { status_list: { idx: 7, uri: location } },
    })
    expect(credentials[0].disclosureFrame).toEqual({ _sd: ['given_name'] })
  })

  test('uses one reserved entry per holder binding key of a batch', async () => {
    const { credentials } = await map(metadata({ credentialStatus: tokenStatusList }), 2)

    expect(credentials.map((credential) => credential.payload.status)).toEqual([
      { status_list: { idx: 7, uri: location } },
      { status_list: { idx: 42, uri: location } },
    ])
  })

  test('refuses a batch larger than the reserved entries', async () => {
    await expect(map(metadata({ credentialStatus: tokenStatusList }), 3)).rejects.toThrow(/reserved at offer time/)
  })

  test('issues sessions created before status lists without a status claim', async () => {
    const { credentials } = await map(metadata())

    expect(credentials[0].payload).not.toHaveProperty('status')
  })
})

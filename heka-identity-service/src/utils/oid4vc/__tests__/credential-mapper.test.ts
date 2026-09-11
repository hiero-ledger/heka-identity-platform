import { webcrypto } from 'node:crypto'

import { AgentContext, X509Certificate } from '@credo-ts/core'
import { OpenId4VciCredentialFormatProfile } from '@credo-ts/openid4vc'
import * as x509 from '@peculiar/x509'

import { createCredentialRequestToCredentialMapper, CredentialIssuanceMetadata } from '../index'

const crypto = webcrypto as unknown as Crypto
x509.cryptoProvider.set(crypto)
const alg = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' } as const

async function makeCertificateBase64(commonName: string): Promise<string> {
  const keys = await crypto.subtle.generateKey(alg, true, ['sign', 'verify'])
  const certificate = await x509.X509CertificateGenerator.createSelfSigned(
    { keys, name: `CN=${commonName}`, notBefore: new Date('2026-01-01Z'), notAfter: new Date('2031-01-01Z') },
    crypto,
  )
  return Buffer.from(certificate.rawData).toString('base64')
}

type SdJwtResult = {
  credentials: Array<{
    issuer: { method: string; x5c?: X509Certificate[]; issuer?: string; didUrl?: string }
    payload: { status?: { status_list: { idx: number; uri: string } } }
  }>
}

describe('credential mapper — SD-JWT VC issuance', () => {
  let pinnedLeaf: string
  let root: string
  let currentLeaf: string
  const getPublicKey = vi.fn()
  const getSdJwtVcIssuerCertificate = vi.fn()
  const agentContext = { resolve: vi.fn(() => ({ getPublicKey })) } as unknown as AgentContext
  const mapper = createCredentialRequestToCredentialMapper({
    getMdocIssuerCertificate: vi.fn(),
    getSdJwtVcIssuerCertificate,
  })

  beforeAll(async () => {
    ;[pinnedLeaf, root, currentLeaf] = await Promise.all([
      makeCertificateBase64('issuer.example (pinned)'),
      makeCertificateBase64('Heka Service Root'),
      makeCertificateBase64('issuer.example (current)'),
    ])
  })

  beforeEach(() => {
    getPublicKey.mockReset().mockResolvedValue({ kty: 'EC', crv: 'P-256' })
    // "The" current chain: what a tenant would sign with today (a renewal since the offer).
    const current = X509Certificate.fromEncodedCertificate(currentLeaf)
    current.keyId = 'current-key'
    getSdJwtVcIssuerCertificate.mockReset().mockResolvedValue({
      certificateChain: [current, X509Certificate.fromEncodedCertificate(root)],
      issuerUrl: 'https://issuer.example',
    })
  })

  const metadata = (overrides: Partial<CredentialIssuanceMetadata> = {}): CredentialIssuanceMetadata => ({
    format: OpenId4VciCredentialFormatProfile.SdJwtVc,
    type: 'https://example.com/vct',
    credentialSupportedId: 'cred-sd-1',
    issuer: {},
    payload: { vct: 'https://example.com/vct', given_name: 'Ada' },
    ...overrides,
  })

  const map = (credential: CredentialIssuanceMetadata, holderKeys = 1): Promise<SdJwtResult> =>
    mapper({
      agentContext,
      issuanceSession: { issuanceMetadata: { credentials: [credential] } },
      holderBinding: {
        keys: Array.from({ length: holderKeys }, (_, index) => ({ method: 'jwk', jwk: { kid: `holder-${index}` } })),
      },
      credentialConfigurationId: 'cred-sd-1',
    } as never) as unknown as Promise<SdJwtResult>

  const statusList = {
    type: 'token-status-list' as const,
    location: 'https://heka.example/token-status-lists/tsl-1',
    index: 10,
  }

  test('M3: signs with the chain pinned at offer time, key id bound, even after the issuer certificate rotated', async () => {
    const result = await map(
      metadata({
        issuerMode: 'x5c',
        issuerSigner: { keyId: 'pinned-key', x5c: [pinnedLeaf, root], issuer: 'https://issuer.example' },
        credentialStatus: statusList,
      }),
    )

    const { issuer } = result.credentials[0]
    expect(issuer.method).toBe('x5c')
    expect(issuer.issuer).toBe('https://issuer.example')
    expect(issuer.x5c?.map((certificate) => certificate.toString('base64'))).toEqual([pinnedLeaf, root])
    expect(issuer.x5c?.[0].keyId).toBe('pinned-key')
    expect(getPublicKey).toHaveBeenCalledWith({ keyId: 'pinned-key' })
    expect(getSdJwtVcIssuerCertificate).not.toHaveBeenCalled()
  })

  test('M3: a pinned key that no longer exists fails the request instead of signing with another identity', async () => {
    getPublicKey.mockResolvedValue(null)
    await expect(
      map(
        metadata({
          issuerMode: 'x5c',
          issuerSigner: { keyId: 'gone-key', x5c: [pinnedLeaf, root], issuer: 'https://issuer.example' },
        }),
      ),
    ).rejects.toThrow(/pinned at offer time \(gone-key\) no longer exists/)
    expect(getSdJwtVcIssuerCertificate).not.toHaveBeenCalled()
  })

  test('x5c sessions created before the pin existed use the current chain', async () => {
    const result = await map(metadata({ issuerMode: 'x5c' }))
    expect(result.credentials[0].issuer.x5c?.map((certificate) => certificate.toString('base64'))).toEqual([
      currentLeaf,
      root,
    ])
    expect(result.credentials[0].issuer.x5c?.[0].keyId).toBe('current-key')
  })

  test('M4: every credential of a batch carries its own status-list entry', async () => {
    const result = await map(
      metadata({
        issuer: { didUrl: 'did:key:z6MkIssuer#key-1' },
        credentialStatus: { ...statusList, indexes: [10, 11, 12] },
      }),
      3,
    )
    expect(result.credentials).toHaveLength(3)
    expect(result.credentials.map((credential) => credential.payload.status?.status_list.idx)).toEqual([10, 11, 12])
    expect(new Set(result.credentials.map((credential) => credential.payload.status?.status_list.uri))).toEqual(
      new Set([statusList.location]),
    )
  })

  test('M4: a batch larger than the entries reserved at offer time fails closed', async () => {
    await expect(
      map(
        metadata({
          issuer: { didUrl: 'did:key:z6MkIssuer#key-1' },
          credentialStatus: { ...statusList, indexes: [10, 11] },
        }),
        3,
      ),
    ).rejects.toThrow(/requested credential 3 but only 2 status-list entries were reserved/)
  })

  test('pre-batch sessions with a single index still work for one credential', async () => {
    const result = await map(metadata({ issuer: { didUrl: 'did:key:z6MkIssuer#key-1' }, credentialStatus: statusList }))
    expect(result.credentials[0].payload.status).toEqual({
      status_list: { idx: 10, uri: statusList.location },
    })
    expect(result.credentials[0].issuer).toEqual({ method: 'did', didUrl: 'did:key:z6MkIssuer#key-1' })
  })
})

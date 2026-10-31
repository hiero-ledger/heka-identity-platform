import { AgentContext, ClaimFormat, Kms, SdJwtVcPayload, X509Certificate } from '@credo-ts/core'
import { OpenId4VciCredentialFormatProfile, OpenId4VciCredentialRequestToCredentialMapper } from '@credo-ts/openid4vc'
import { createMock } from '@golevelup/ts-vitest'

import AgentConfig from 'config/agent'

import { createCredentialRequestToCredentialMapper, CredentialIssuanceMetadata } from '..'

type MapperOptions = Parameters<OpenId4VciCredentialRequestToCredentialMapper>[0]

// Development mDL issuer certificate and key from the agent config defaults
const { mdlIssuerCertificate: MDL_ISSUER_CERTIFICATE, mdlIssuerPrivateKeyJwk: MDL_ISSUER_PRIVATE_KEY_JWK } =
  AgentConfig()

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000
const ONE_DAY_MS = 24 * 60 * 60 * 1000

describe('createCredentialRequestToCredentialMapper', () => {
  let agentContext: AgentContext
  let kms: Kms.KeyManagementApi

  beforeEach(() => {
    kms = createMock<Kms.KeyManagementApi>()
    vi.mocked(kms.importKey).mockResolvedValue({} as Awaited<ReturnType<Kms.KeyManagementApi['importKey']>>)
    agentContext = createMock<AgentContext>()
    vi.mocked(agentContext.resolve).mockImplementation(((token: unknown) => {
      if (token === Kms.KeyManagementApi) return kms
      throw new Error(`Unexpected dependency resolved: ${String(token)}`)
    }) as AgentContext['resolve'])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function mapperOptions(
    credential: CredentialIssuanceMetadata,
    holderBindingKeys: unknown[],
    credentialConfigurationId = credential.credentialSupportedId,
  ): MapperOptions {
    return {
      agentContext,
      issuanceSession: { issuanceMetadata: { credentials: [credential] } },
      holderBinding: { keys: holderBindingKeys },
      credentialConfigurationId,
    } as unknown as MapperOptions
  }

  describe('mso_mdoc', () => {
    const holderJwk = { kty: 'EC', crv: 'P-256', x: 'holder-x', y: 'holder-y' }
    const mdocMetadata = (overrides: Partial<CredentialIssuanceMetadata> = {}): CredentialIssuanceMetadata => ({
      format: OpenId4VciCredentialFormatProfile.MsoMdoc,
      type: 'org.iso.18013.5.1.mDL',
      credentialSupportedId: 'mdl-config',
      issuer: {},
      namespaces: {
        'org.iso.18013.5.1': { given_name: 'John', age_over_18: 'true', age_over_65: 'false' },
      },
      ...overrides,
    })

    test('builds an mso_mdoc credential signed with the configured issuer certificate', async () => {
      const mapper = createCredentialRequestToCredentialMapper(MDL_ISSUER_CERTIFICATE, MDL_ISSUER_PRIVATE_KEY_JWK)
      const before = Date.now()

      const result = await mapper(mapperOptions(mdocMetadata(), [{ method: 'jwk', jwk: holderJwk }]))

      expect(result.type).toBe('credentials')
      if (result.type !== 'credentials' || result.format !== ClaimFormat.MsoMdoc) {
        throw new Error(`Unexpected result format: ${JSON.stringify(result)}`)
      }
      expect(result.credentials).toHaveLength(1)
      const [credential] = result.credentials

      expect(credential.docType).toBe('org.iso.18013.5.1.mDL')
      expect(credential.namespaces).toEqual({
        'org.iso.18013.5.1': { given_name: 'John', age_over_18: true, age_over_65: false },
      })
      expect(credential.holderKey).toBe(holderJwk)

      // Credo 0.7.1+ rejects validFrom < signed, so the mapper must leave validFrom/signed to their defaults
      expect(credential.validityInfo).toBeDefined()
      expect(credential.validityInfo).not.toHaveProperty('validFrom')
      expect(credential.validityInfo).not.toHaveProperty('signed')
      const validUntil = credential.validityInfo?.validUntil as Date
      expect(validUntil).toBeInstanceOf(Date)
      expect(validUntil.getTime() - before).toBeGreaterThan(ONE_YEAR_MS - 2 * ONE_DAY_MS)
      expect(validUntil.getTime() - before).toBeLessThan(ONE_YEAR_MS + 2 * ONE_DAY_MS)

      const issuerCertificate = credential.issuerCertificate as X509Certificate
      expect(issuerCertificate).toBeInstanceOf(X509Certificate)
      expect(issuerCertificate.publicJwk.keyId).toBe(MDL_ISSUER_PRIVATE_KEY_JWK.kid)

      expect(kms.importKey).toHaveBeenCalledWith({ privateJwk: MDL_ISSUER_PRIVATE_KEY_JWK })
    })

    test.each([
      ['a KeyManagementKeyExistsError', () => new Kms.KeyManagementKeyExistsError('kid', 'askar')],
      ["a 'Duplicate entry' error", () => new Error('Duplicate entry')],
    ])('tolerates %s when the issuer key is already imported', async (_, createError) => {
      vi.mocked(kms.importKey).mockRejectedValue(createError())
      const mapper = createCredentialRequestToCredentialMapper(MDL_ISSUER_CERTIFICATE, MDL_ISSUER_PRIVATE_KEY_JWK)

      const result = await mapper(mapperOptions(mdocMetadata(), [{ method: 'jwk', jwk: holderJwk }]))

      expect(result).toMatchObject({ type: 'credentials', format: ClaimFormat.MsoMdoc })
    })

    test('propagates other key import errors', async () => {
      vi.mocked(kms.importKey).mockRejectedValue(new Error('kms unavailable'))
      const mapper = createCredentialRequestToCredentialMapper(MDL_ISSUER_CERTIFICATE, MDL_ISSUER_PRIVATE_KEY_JWK)

      await expect(mapper(mapperOptions(mdocMetadata(), [{ method: 'jwk', jwk: holderJwk }]))).rejects.toThrow(
        'kms unavailable',
      )
    })

    test('fails when MDL_ISSUER_CERTIFICATE is not configured', async () => {
      const mapper = createCredentialRequestToCredentialMapper(undefined, MDL_ISSUER_PRIVATE_KEY_JWK)

      await expect(mapper(mapperOptions(mdocMetadata(), [{ method: 'jwk', jwk: holderJwk }]))).rejects.toThrow(
        'MDL_ISSUER_CERTIFICATE is not configured',
      )
      expect(kms.importKey).not.toHaveBeenCalled()
    })

    test('fails when namespaces are missing', async () => {
      const mapper = createCredentialRequestToCredentialMapper(MDL_ISSUER_CERTIFICATE, MDL_ISSUER_PRIVATE_KEY_JWK)

      await expect(
        mapper(mapperOptions(mdocMetadata({ namespaces: undefined }), [{ method: 'jwk', jwk: holderJwk }])),
      ).rejects.toThrow("'namespaces' is missing")
    })

    test('fails when the holder binding has no key', async () => {
      const mapper = createCredentialRequestToCredentialMapper(MDL_ISSUER_CERTIFICATE, MDL_ISSUER_PRIVATE_KEY_JWK)

      await expect(mapper(mapperOptions(mdocMetadata(), []))).rejects.toThrow('No holder key found for mdoc binding')
    })
  })

  describe('vc+sd-jwt', () => {
    const issuerDidUrl = 'did:key:z6MkIssuer#z6MkIssuer'
    const sdJwtMetadata = (overrides: Partial<CredentialIssuanceMetadata> = {}): CredentialIssuanceMetadata => ({
      format: OpenId4VciCredentialFormatProfile.SdJwtVc,
      type: ['https://example.com/IdentityCredential', 'IgnoredSecondType'],
      credentialSupportedId: 'sd-jwt-config',
      issuer: { did: 'did:key:z6MkIssuer', didUrl: issuerDidUrl },
      // Templates store the claims without vct; the mapper adds it from the credential type
      payload: { given_name: 'Jane', family_name: 'Doe' } as unknown as SdJwtVcPayload,
      disclosureFrame: { _sd: ['family_name'] },
      ...overrides,
    })

    test('builds one SD-JWT VC per holder binding, issued by the template DID', async () => {
      const mapper = createCredentialRequestToCredentialMapper(MDL_ISSUER_CERTIFICATE, MDL_ISSUER_PRIVATE_KEY_JWK)
      const holderBindings = [
        { method: 'did', didUrl: 'did:key:z6MkHolder1#z6MkHolder1' },
        { method: 'did', didUrl: 'did:key:z6MkHolder2#z6MkHolder2' },
      ]

      const result = await mapper(mapperOptions(sdJwtMetadata(), holderBindings))

      expect(result).toEqual({
        type: 'credentials',
        format: ClaimFormat.SdJwtDc,
        credentials: holderBindings.map((holder) => ({
          holder,
          issuer: { method: 'did', didUrl: issuerDidUrl },
          payload: { vct: 'https://example.com/IdentityCredential', given_name: 'Jane', family_name: 'Doe' },
          disclosureFrame: { _sd: ['family_name'] },
          hashingAlgorithm: 'sha-256',
        })),
      })
      // SD-JWT issuance does not touch the mDL issuer key
      expect(kms.importKey).not.toHaveBeenCalled()
    })

    test('uses a string type as vct', async () => {
      const mapper = createCredentialRequestToCredentialMapper()

      const result = await mapper(
        mapperOptions(sdJwtMetadata({ type: 'urn:example:vct' }), [{ method: 'did', didUrl: 'did:key:z6MkH#z6MkH' }]),
      )

      expect(result).toMatchObject({ credentials: [{ payload: { vct: 'urn:example:vct' } }] })
    })

    test('fails when the payload is missing', async () => {
      const mapper = createCredentialRequestToCredentialMapper()

      await expect(
        mapper(
          mapperOptions(sdJwtMetadata({ payload: undefined }), [{ method: 'did', didUrl: 'did:key:z6MkH#z6MkH' }]),
        ),
      ).rejects.toThrow("'payload' is missing")
    })

    test('fails when the issuer didUrl is missing', async () => {
      const mapper = createCredentialRequestToCredentialMapper()

      await expect(
        mapper(
          mapperOptions(sdJwtMetadata({ issuer: { did: 'did:key:z6MkIssuer' } }), [
            { method: 'did', didUrl: 'did:key:z6MkH#z6MkH' },
          ]),
        ),
      ).rejects.toThrow("'didUrl' is missing")
    })
  })

  test('fails when the requested credential configuration is not in the issuance session', async () => {
    const mapper = createCredentialRequestToCredentialMapper()

    await expect(
      mapper(
        mapperOptions(
          {
            format: OpenId4VciCredentialFormatProfile.SdJwtVc,
            type: 'urn:example:vct',
            credentialSupportedId: 'known',
            issuer: {},
          },
          [],
          'unknown',
        ),
      ),
    ).rejects.toThrow('Credential not found for id: unknown')
  })
})

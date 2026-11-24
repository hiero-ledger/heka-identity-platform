import { Kms, SdJwtVcRecord, type Agent } from '@credo-ts/core'
import { compactDecrypt, exportJWK, generateKeyPair, type CryptoKey as JoseKey } from 'jose'
import { beforeAll, describe, expect, it, vi } from 'vitest'

// The verifier side of an OpenID4VP `direct_post.jwt` exchange, as Heka's Credo verifier sets it
// up by default: an ephemeral P-256 key in client_metadata.jwks, the response POSTed to
// response_uri as a JWE. The wallet side is the real agent (both KMS backends, IndexedDB).
const RESPONSE_URI = 'https://verifier.example/oid4vp/response'
const VCT = 'https://issuer.example/vct/Membership'
const posted: string[] = []

// browser-dependencies.ts binds globalThis.fetch when it loads, so stub it before the agent is imported.
vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : String(input)
  if (url !== RESPONSE_URI) throw new Error(`Unexpected request to ${url}`)
  const body = init?.body instanceof URLSearchParams ? init.body : new URLSearchParams(String(init?.body))
  posted.push(body.get('response') ?? '')
  return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
})

describe('presenting to a verifier that asks for an encrypted response (direct_post.jwt)', () => {
  let agent: Agent
  let present: typeof import('../present')
  let verifierJwk: Record<string, unknown>
  let verifierKey: JoseKey

  beforeAll(async () => {
    agent = await (await import('../../credo/lazy-agent')).getOrCreateAgent()
    present = await import('../present')

    // A credential to present, issued by the agent itself from a did:key.
    const issuer = await agent.dids.create({
      method: 'key',
      options: { createKey: { type: { kty: 'OKP', crv: 'Ed25519' } } },
    })
    const holderKey = await agent.kms.createKey({ backend: 'webcrypto-browser', type: { kty: 'EC', crv: 'P-256' } })
    const now = Math.floor(Date.now() / 1000)
    const signed = await agent.sdJwtVc.sign({
      issuer: { method: 'did', didUrl: issuer.didState.didDocument!.verificationMethod![0].id },
      holder: { method: 'jwk', jwk: Kms.PublicJwk.fromPublicJwk(holderKey.publicJwk) },
      payload: { vct: VCT, member: 'ada', level: 'gold', iat: now, exp: now + 3600 },
      disclosureFrame: { _sd: ['member', 'level'] },
    })
    await agent.sdJwtVc.store({
      record: new SdJwtVcRecord({
        credentialInstances: [{ compactSdJwtVc: signed.compact, kmsKeyId: holderKey.keyId }],
      }),
    })

    const { publicKey, privateKey } = await generateKeyPair('ECDH-ES', { crv: 'P-256' })
    verifierJwk = { ...(await exportJWK(publicKey)), kid: 'verifier-enc', use: 'enc', alg: 'ECDH-ES' }
    verifierKey = privateKey
  })

  const requestUri = (encValues: string[]) => {
    const request: Record<string, unknown> = {
      response_type: 'vp_token',
      client_id: `redirect_uri:${RESPONSE_URI}`,
      response_uri: RESPONSE_URI,
      response_mode: 'direct_post.jwt',
      nonce: crypto.randomUUID(),
      state: 'state-1',
      dcql_query: {
        credentials: [
          { id: 'membership', format: 'dc+sd-jwt', meta: { vct_values: [VCT] }, claims: [{ path: ['member'] }] },
        ],
      },
      client_metadata: {
        jwks: { keys: [verifierJwk] },
        encrypted_response_enc_values_supported: encValues,
        vp_formats_supported: {
          'dc+sd-jwt': { 'sd-jwt_alg_values': ['EdDSA', 'ES256'], 'kb-jwt_alg_values': ['ES256', 'EdDSA'] },
        },
      },
    }
    const query = Object.entries(request).map(([key, value]) => [
      key,
      typeof value === 'string' ? value : JSON.stringify(value),
    ])
    return `openid4vp://?${new URLSearchParams(query)}`
  }

  for (const [encValues, expectedEnc] of [
    [['A128GCM', 'A256GCM', 'A128CBC-HS256'], 'A128GCM'],
    [['A256GCM'], 'A256GCM'],
    [['A128CBC-HS256'], 'A128CBC-HS256'],
  ] as const) {
    it(`answers with a JWE (${expectedEnc}) that the verifier decrypts to the vp_token`, async () => {
      posted.length = 0
      const { resolved, selectedCredentials } = await present.handlePresentationRequest(requestUri([...encValues]))

      const result = await present.submitPresentation(resolved, selectedCredentials)

      expect(result.ok).toBe(true)
      expect(posted).toHaveLength(1)
      const { plaintext, protectedHeader } = await compactDecrypt(posted[0], verifierKey)
      expect(protectedHeader).toMatchObject({ alg: 'ECDH-ES', enc: expectedEnc, kid: 'verifier-enc' })
      const response = JSON.parse(new TextDecoder().decode(plaintext)) as { vp_token: Record<string, string[]> }
      const [presentation] = response.vp_token.membership
      const disclosed = presentation
        .split('~')
        .slice(1, -1)
        .map((disclosure) => JSON.parse(Buffer.from(disclosure, 'base64url').toString()) as unknown[])
      expect(disclosed.map((disclosure) => disclosure[1])).toEqual(['member'])

      // The single-use key was deleted by the key-agreement backend; Credo's own deleteKey
      // afterwards (to the default backend, which returns false) did not break the response.
      const { backends } = agent.dependencyManager.resolve(Kms.KeyManagementModuleConfig)
      const keyAgreement = backends.find((backend) => backend.backend === 'webcrypto-browser-ecdh')!
      const ephemeralKeyId = (protectedHeader.epk as { kid?: unknown } | undefined)?.kid
      expect(ephemeralKeyId).toEqual(expect.any(String))
      expect(await keyAgreement.getPublicKey(agent.context, ephemeralKeyId as string)).toBeNull()
    })
  }
})

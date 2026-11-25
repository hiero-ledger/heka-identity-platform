import { createHash } from 'node:crypto'

import { DidKey, Kms, type Agent, type KeyDidCreateOptions } from '@credo-ts/core'
import type { OpenId4VciCredentialBindingOptions } from '@credo-ts/openid4vc'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { getOrCreateAgent } from '../../credo/lazy-agent'
import { createHolderBinding, receiveResultMessage } from '../receive'

// The agent's fetch is bound when its dependencies module loads, so the spy goes in first.
const fetchSpy = vi.hoisted(() => {
  const spy = vi.fn<typeof fetch>()
  globalThis.fetch = spy
  return spy
})

type BindingOptions = Pick<
  OpenId4VciCredentialBindingOptions,
  'proofTypes' | 'supportsJwk' | 'supportsAllDidMethods' | 'supportedDidMethods'
>

const jwtProof = (...supportedSignatureAlgorithms: string[]) =>
  ({ jwt: { supportedSignatureAlgorithms } }) as unknown as BindingOptions['proofTypes']

// A real agent on the wallet's own storage and KMS (fake-indexeddb, Node WebCrypto).
describe('createHolderBinding', () => {
  let agent: Agent

  beforeAll(async () => {
    agent = await getOrCreateAgent()
  })

  const bind = (options: Partial<BindingOptions>) => {
    const created = { keyIds: [] as string[], dids: [] as string[] }
    const binding = createHolderBinding(
      agent,
      { proofTypes: jwtProof('ES256'), supportsJwk: false, supportsAllDidMethods: false, ...options },
      created,
    )
    return { binding, created }
  }

  it('binds to a P-256 public JWK when the issuer accepts JWK and ES256', async () => {
    const { binding, created } = bind({ supportsJwk: true, proofTypes: jwtProof('ES256', 'EdDSA') })

    const result = await binding
    if (result.method !== 'jwk') throw new Error(`expected a jwk binding, got ${result.method}`)
    expect(result.keys[0]).toBeInstanceOf(Kms.PublicJwk)
    expect(result.keys[0].toJson()).toMatchObject({ kty: 'EC', crv: 'P-256' })
    expect(created.keyIds).toHaveLength(1)
  })

  it('creates an Ed25519 key for an issuer that accepts only EdDSA proofs', async () => {
    const result = await bind({ supportsJwk: true, proofTypes: jwtProof('EdDSA') }).binding

    if (result.method !== 'jwk') throw new Error(`expected a jwk binding, got ${result.method}`)
    expect(result.keys[0].toJson()).toMatchObject({ kty: 'OKP', crv: 'Ed25519' })
  })

  it('binds to a did:jwk when the issuer accepts only DIDs, and keeps the DID record', async () => {
    const { binding, created } = bind({ supportedDidMethods: ['did:jwk', 'did:key'] })

    const result = await binding
    if (result.method !== 'did') throw new Error(`expected a did binding, got ${result.method}`)
    expect(result.didUrls[0]).toMatch(/^did:jwk:[\w-]+#0$/)
    expect(created.dids).toEqual([result.didUrls[0].split('#')[0]])
    expect(await agent.dids.getCreatedDids({ did: created.dids[0] })).toHaveLength(1)
  })

  it('binds to a did:key when that is the only DID method the issuer accepts', async () => {
    const result = await bind({ supportedDidMethods: ['did:key'] }).binding

    if (result.method !== 'did') throw new Error(`expected a did binding, got ${result.method}`)
    expect(result.didUrls[0]).toMatch(/^did:key:(z[1-9A-HJ-NP-Za-km-z]+)#\1$/)
  })

  it('refuses issuers it cannot bind to', async () => {
    await expect(bind({ supportedDidMethods: ['did:web'] }).binding).rejects.toThrow(/did:web/)
    await expect(bind({ proofTypes: {} as BindingOptions['proofTypes'] }).binding).rejects.toThrow(/key attestation/)
    await expect(bind({ supportsJwk: true, proofTypes: jwtProof() }).binding).rejects.toThrow(/proof algorithms/)
  })
})

describe('receiveResultMessage', () => {
  it('counts received credentials', () => {
    expect(receiveResultMessage(1, 0)).toBe('Received 1 credential.')
    expect(receiveResultMessage(2, 0)).toBe('Received 2 credentials.')
  })

  it('says when the issuer defers a credential instead of reporting 0 received', () => {
    expect(receiveResultMessage(0, 1)).toMatch(/^The issuer will issue one credential later\./)
    expect(receiveResultMessage(0, 1)).not.toMatch(/Received/)
    expect(receiveResultMessage(1, 2)).toMatch(/^Received 1 credential\. The issuer will issue 2 credentials later\./)
  })
})

// The holder verifies each received SD-JWT VC with type metadata (Credo's receive path).
describe('type metadata at receive', () => {
  const vct = 'https://types.example/vct/Membership'
  const metadata = JSON.stringify({ vct, name: 'Membership' })
  const integrity = `sha256-${createHash('sha256').update(metadata).digest('base64')}`
  let agent: Agent
  let issuerDidUrl: string

  beforeAll(async () => {
    agent = await getOrCreateAgent()
    const key = await agent.kms.createKeyForSignatureAlgorithm({ backend: 'webcrypto-browser', algorithm: 'ES256' })
    const { didState } = await agent.dids.create<KeyDidCreateOptions>({ method: 'key', options: { keyId: key.keyId } })
    if (didState.state !== 'finished') throw new Error('Could not create the issuer DID')
    issuerDidUrl = `${didState.did}#${DidKey.fromDid(didState.did).publicJwk.fingerprint}`
  })

  beforeEach(() => {
    fetchSpy.mockReset().mockImplementation(async () => new Response(metadata, { status: 200 }))
    vi.stubGlobal('chrome', { permissions: { contains: async () => true } })
  })

  const receive = async (payload: Record<string, unknown>) => {
    const { compact } = await agent.sdJwtVc.sign({ issuer: { method: 'did', didUrl: issuerDidUrl }, payload })
    return agent.sdJwtVc.verify({ compactSdJwtVc: compact, fetchTypeMetadata: true })
  }

  it('does not fetch the type metadata of an https vct without integrity', async () => {
    const result = await receive({ vct })

    expect(result.isValid).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fetches it when the credential pins it with integrity on an allowed origin', async () => {
    const result = await receive({ vct, 'vct#integrity': integrity })

    expect(result.isValid).toBe(true)
    expect(fetchSpy).toHaveBeenCalledWith(vct, expect.anything())
    expect(result.sdJwtVc?.typeMetadata).toMatchObject({ vct, name: 'Membership' })
  })
})

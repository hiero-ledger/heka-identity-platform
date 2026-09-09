import { createPublicKey, verify } from 'crypto'

import { cborDecodeFirst, encodeSigStructure } from '../cbor'
import { parseVical } from '../vical'

/**
 * Cross-implementation fixture: a VICAL encoded with cbor-x (the exact encoder the identity service
 * uses) and signed with an ES256 key via node:crypto. Generated once offline; the private key is not
 * retained. The wallet must decode these bytes with its hand-rolled CBOR reader AND rebuild the COSE
 * Sig_structure byte-for-byte so the signature verifies.
 */
const FIXTURE = {
  coseBase64:
    '0oRDoQEmoRghgkUwggEQqkUwggIgu1jlpmd2ZXJzaW9uYzEuMG12aWNhbFByb3ZpZGVyZEhla2FkZGF0ZcEaakBkAGpuZXh0VXBkYXRlwRpqSZ6AbHZpY2FsSXNzdWVJRANwY2VydGlmaWNhdGVJbmZvc4Gna2NlcnRpZmljYXRlRjCCAzDM3WxzZXJpYWxOdW1iZXIbEjRWeJCrze9jc2tpRKq7zN1nZG9jVHlwZYF1b3JnLmlzby4xODAxMy41LjEubURMcGlzc3VpbmdBdXRob3JpdHlkSGVrYW5pc3N1aW5nQ291bnRyeWJVU2hub3RBZnRlcsEacr0MAFhAQ3I5q1rScYNqb5HapylVHTUAwNviPalMQKSUZfhARnJ3rwflGnNZlp4l2l/QD/mIOMgQcrSMcTqBRPbXMVRPTA==',
  signerPublicJwk: {
    kty: 'EC',
    crv: 'P-256',
    x: 'kz6PXQ8LYxgVUYCPp1kkrNLCEbbWj8-jXlDeyn-O5bc',
    y: 'SA7z-sZh5NMHcl8Q1kWVfObxdQQuI-fkdGH5njXOq8k',
  } as const,
  iacaBase64: 'MIIDMMzd',
  leafBase64: 'MIIBEKo=',
  rootBase64: 'MIICILs=',
}

describe('parseVical (cross-impl fixture from cbor-x + ES256)', () => {
  const cose = Uint8Array.from(Buffer.from(FIXTURE.coseBase64, 'base64'))

  test('decodes the COSE_Sign1 parts and the trust list', () => {
    const parsed = parseVical(cose)

    expect(parsed.version).toBe('1.0')
    expect(parsed.vicalProvider).toBe('Heka')
    expect(parsed.vicalIssueID).toBe(3)
    expect(parsed.certificateChainBase64).toEqual([FIXTURE.leafBase64, FIXTURE.rootBase64])
    expect(parsed.signature.length).toBe(64)

    expect(parsed.certificateInfos).toHaveLength(1)
    expect(parsed.certificateInfos[0]).toMatchObject({
      certificateBase64: FIXTURE.iacaBase64,
      docTypes: ['org.iso.18013.5.1.mDL'],
      issuingAuthority: 'Heka',
      issuingCountry: 'US',
    })
  })

  test('rebuilds the Sig_structure byte-for-byte so the ES256 signature verifies', () => {
    const parsed = parseVical(cose)
    const sigStructure = encodeSigStructure(parsed.protectedHeader, parsed.payload)

    const key = createPublicKey({ key: FIXTURE.signerPublicJwk, format: 'jwk' })
    const verified = verify('sha256', sigStructure, { key, dsaEncoding: 'ieee-p1363' }, parsed.signature)
    expect(verified).toBe(true)
  })

  test('rejects non-COSE_Sign1 input', () => {
    expect(() => parseVical(Uint8Array.from([0x01, 0x02]))).toThrow(/COSE_Sign1/)
  })
})

describe('CBOR codec length paths', () => {
  test('encodeSigStructure + decode round-trips a >256-byte payload (2-byte length head)', () => {
    const protectedHeader = Uint8Array.from([0xa1, 0x01, 0x26]) // {1: -7}
    const payload = Uint8Array.from({ length: 500 }, (_, i) => i & 0xff)

    const decoded = cborDecodeFirst(encodeSigStructure(protectedHeader, payload)) as unknown[]

    expect(decoded[0]).toBe('Signature1')
    expect(Buffer.from(decoded[1] as Uint8Array)).toEqual(Buffer.from(protectedHeader))
    expect((decoded[2] as Uint8Array).length).toBe(0)
    expect(Buffer.from(decoded[3] as Uint8Array)).toEqual(Buffer.from(payload))
  })
})

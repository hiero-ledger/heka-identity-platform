import { Key, KeyAlgorithm } from '@openwallet-foundation/askar-nodejs'
import { Encoder } from 'cbor-x'

import { decodeCoseSign1 } from '../cose-sign1'
import { buildSignedVical, decodeVicalPayload, encodeVicalPayload, VicalInput } from '../vical'

const encoder = new Encoder({ useRecords: false, tagUint8Array: false })

const sampleVical = (): VicalInput => ({
  version: '1.0',
  vicalProvider: 'Heka',
  date: '2026-06-28T00:00:00Z',
  nextUpdate: '2026-07-05T00:00:00Z',
  vicalIssueID: 3,
  certificateInfos: [
    {
      certificateDer: new Uint8Array([0x30, 0x82, 0x01, 0x02, 0x03]),
      serialNumber: BigInt('0x1234567890abcdef'),
      ski: new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]),
      docTypes: ['org.iso.18013.5.1.mDL'],
      issuingAuthority: 'Heka',
      issuingCountry: 'US',
      notAfter: '2031-01-01T00:00:00Z',
    },
  ],
})

describe('VICAL encoding', () => {
  test('round-trips the payload fields through CBOR', () => {
    const decoded = decodeVicalPayload(encodeVicalPayload(sampleVical()))

    expect(decoded.version).toBe('1.0')
    expect(decoded.vicalProvider).toBe('Heka')
    expect(decoded.date).toBeInstanceOf(Date) // tag(0) date-time decodes to a Date
    expect((decoded.date as Date).toISOString()).toBe('2026-06-28T00:00:00.000Z')
    expect(decoded.vicalIssueID).toBe(3)

    const infos = decoded.certificateInfos as Array<Record<string, unknown>>
    expect(infos).toHaveLength(1)
    expect(infos[0].serialNumber).toBe(BigInt('0x1234567890abcdef'))
    expect(Buffer.from(infos[0].certificate as Uint8Array).toString('hex')).toBe('3082010203')
    expect(Buffer.from(infos[0].ski as Uint8Array).toString('hex')).toBe('aabbccdd')
    expect(infos[0].docType).toEqual(['org.iso.18013.5.1.mDL'])
    expect(infos[0].issuingCountry).toBe('US')
  })

  test('omits optional top-level fields when absent', () => {
    const decoded = decodeVicalPayload(
      encodeVicalPayload({ version: '1.0', vicalProvider: 'Heka', date: '2026-06-28T00:00:00Z', certificateInfos: [] }),
    )
    expect('nextUpdate' in decoded).toBe(false)
    expect('vicalIssueID' in decoded).toBe(false)
    expect(decoded.certificateInfos).toEqual([])
  })
})

describe('COSE_Sign1 over the VICAL', () => {
  test('produces a COSE_Sign1 whose ES256 signature verifies and whose payload is the VICAL', async () => {
    const key = Key.generate(KeyAlgorithm.EcSecp256r1)

    const signed = await buildSignedVical({
      vical: sampleVical(),
      certificateChain: [new Uint8Array([0xca, 0xfe]), new Uint8Array([0xc0, 0x07])],
      sign: (data) => Promise.resolve(key.signMessage({ message: Buffer.from(data) })),
    })

    const { protectedHeader, unprotectedHeader, payload, signature } = decodeCoseSign1(signed)

    // x5chain present (label 33), leaf-first
    const x5chain = (unprotectedHeader as Map<number, unknown>).get
      ? (unprotectedHeader as Map<number, unknown>).get(33)
      : (unprotectedHeader as Record<string, unknown>)['33']
    expect(x5chain).toBeDefined()

    // payload is the VICAL
    const vical = decodeVicalPayload(payload)
    expect(vical.vicalProvider).toBe('Heka')

    // the signature verifies over the canonical Sig_structure (third-party/real-crypto cross-check)
    const sigStructure = encoder.encode(['Signature1', protectedHeader, new Uint8Array(0), payload])
    expect(signature.length).toBe(64) // raw R||S, COSE-ready
    expect(key.verifySignature({ message: Buffer.from(sigStructure), signature: Buffer.from(signature) })).toBe(true)
  })
})

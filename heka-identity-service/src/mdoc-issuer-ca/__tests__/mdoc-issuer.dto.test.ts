import 'reflect-metadata'

import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'

import { MdocIacaDto, ProvisionIacaDto } from '../dto/mdoc-issuer.dto'
import { MdocIaca } from '../mdoc-issuer-ca.types'

/** Mirrors the global `ValidationPipe({ whitelist: true })`: unknown properties are stripped, not rejected. */
const validateProvision = async (body: Record<string, unknown>) => {
  const instance = plainToInstance(ProvisionIacaDto, body)
  const errors = await validate(instance, { whitelist: true })
  return { instance, errors }
}

describe('ProvisionIacaDto', () => {
  test('keeps the EU provisioning fields through whitelist validation', async () => {
    const { instance, errors } = await validateProvision({
      profile: 'eudi-pid',
      organizationIdentifier: 'VATDE-0123456789',
      certificatePolicyOid: '1.3.6.1.4.1.99999.1.1',
      country: 'DE',
    })
    expect(errors).toHaveLength(0)
    expect(instance).toMatchObject({
      profile: 'eudi-pid',
      organizationIdentifier: 'VATDE-0123456789',
      certificatePolicyOid: '1.3.6.1.4.1.99999.1.1',
      country: 'DE',
    })
  })

  test('accepts an empty body (service-wide defaults apply)', async () => {
    const { errors } = await validateProvision({})
    expect(errors).toHaveLength(0)
  })

  test('rejects an unknown profile name', async () => {
    const { errors } = await validateProvision({ profile: 'eudi_pid' })
    expect(errors.map((error) => error.property)).toEqual(['profile'])
  })

  test.each(['1.3.6.1.4.1.99999', '2.999.1'])('accepts the dotted-decimal OID %s', async (oid) => {
    const { errors } = await validateProvision({ certificatePolicyOid: oid })
    expect(errors).toHaveLength(0)
  })

  test.each(['not-an-oid', '1.', '3.1.2', '1.01.2', ''])(
    'rejects a malformed certificate-policy OID %j',
    async (oid) => {
      const { errors } = await validateProvision({ certificatePolicyOid: oid })
      expect(errors.map((error) => error.property)).toEqual(['certificatePolicyOid'])
    },
  )

  test.each([0, -1, 1.5, 365 * 9 + 1])('rejects validityDays %p', async (validityDays) => {
    const { errors } = await validateProvision({ validityDays })
    expect(errors.map((error) => error.property)).toEqual(['validityDays'])
  })

  test.each([1, 365 * 5, 365 * 9])('accepts validityDays %p', async (validityDays) => {
    const { errors } = await validateProvision({ validityDays })
    expect(errors).toHaveLength(0)
  })

  test('rejects an empty organizationIdentifier', async () => {
    const { errors } = await validateProvision({ organizationIdentifier: '' })
    expect(errors.map((error) => error.property)).toEqual(['organizationIdentifier'])
  })
})

describe('MdocIacaDto', () => {
  const iaca: MdocIaca = {
    id: 'iaca-1',
    keyId: 'kms-1',
    certificateBase64: 'MIIB',
    fingerprint: 'ab'.repeat(32),
    commonName: 'Heka PID IACA',
    country: 'DE',
    authorityName: 'Heka',
    docType: 'eu.europa.ec.eudi.pid.1',
    profile: 'eudi-pid',
    organizationIdentifier: 'VATDE-0123456789',
    certificatePolicyOid: '1.3.6.1.4.1.99999.1.1',
    createdAt: '2026-01-01T00:00:00.000Z',
    notAfter: '2031-01-01T00:00:00.000Z',
  }

  test('exposes the profile, organizationIdentifier and certificatePolicyOid, never the KMS key id', () => {
    const dto = MdocIacaDto.fromIaca(iaca)
    expect(dto).toMatchObject({
      profile: 'eudi-pid',
      organizationIdentifier: 'VATDE-0123456789',
      certificatePolicyOid: '1.3.6.1.4.1.99999.1.1',
    })
    expect('keyId' in dto).toBe(false)
  })

  test('reports legacy records (no stored profile) as the mDL profile', () => {
    const legacy: MdocIaca = {
      ...iaca,
      profile: undefined,
      organizationIdentifier: undefined,
      certificatePolicyOid: undefined,
    }
    expect(MdocIacaDto.fromIaca(legacy)).toMatchObject({
      profile: 'mdl-us',
      organizationIdentifier: undefined,
      certificatePolicyOid: undefined,
    })
  })
})

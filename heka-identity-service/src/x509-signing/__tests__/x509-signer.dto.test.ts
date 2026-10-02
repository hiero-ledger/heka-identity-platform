import 'reflect-metadata'

import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'

import { ProvisionX509SignerDto, RotateX509SignerDto } from '../dto/x509-signer.dto'

const validateWith = async (dto: typeof ProvisionX509SignerDto | typeof RotateX509SignerDto, body: object) =>
  validate(plainToInstance(dto, body), { whitelist: true })

describe.each([
  ['ProvisionX509SignerDto', ProvisionX509SignerDto],
  ['RotateX509SignerDto', RotateX509SignerDto],
])('%s.validityDays', (_name, dto) => {
  test.each([0, -5, 1.5, 365 * 10 + 1, 'a year'])('rejects %p', async (validityDays) => {
    const errors = await validateWith(dto, { validityDays })
    expect(errors.map((error) => error.property)).toEqual(['validityDays'])
  })

  test.each([1, 365, 365 * 10])('accepts %p', async (validityDays) => {
    expect(await validateWith(dto, { validityDays })).toHaveLength(0)
  })

  test('is optional', async () => {
    expect(await validateWith(dto, {})).toHaveLength(0)
  })
})

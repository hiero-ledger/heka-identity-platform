import 'reflect-metadata'

import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'

import {
  defaultCredentialStatusListSize,
  maxCredentialStatusListSize,
} from '../../../common/entities/credential-status-list.entity'
import { CreateStatusListRequest } from '../dto/create-status-list.dto'

const validateRequest = async (payload: Record<string, unknown>) => {
  const instance = plainToInstance(CreateStatusListRequest, payload)
  const errors = await validate(instance)
  return { instance, errors }
}

const sizeConstraints = (errors: Awaited<ReturnType<typeof validateRequest>>['errors']) =>
  Object.keys(errors.find((error) => error.property === 'size')?.constraints ?? {})

describe('CreateStatusListRequest', () => {
  describe('size', () => {
    it('is optional - omitting it falls back to the default', async () => {
      const { errors } = await validateRequest({ issuer: 'did:example:issuer' })

      expect(errors).toHaveLength(0)
    })

    it.each([1, defaultCredentialStatusListSize, maxCredentialStatusListSize])('accepts %i', async (size) => {
      const { errors } = await validateRequest({ issuer: 'did:example:issuer', size })

      expect(errors).toHaveLength(0)
    })

    // `new Bitstring({ length })` throws on a non-positive or fractional length, which would surface
    // as a 500 rather than a 400 if the DTO let these through.
    it.each([0, -1, -131072])('rejects the non-positive size %i', async (size) => {
      const { errors } = await validateRequest({ issuer: 'did:example:issuer', size })

      expect(sizeConstraints(errors)).toContain('min')
    })

    it('rejects a fractional size', async () => {
      const { errors } = await validateRequest({ issuer: 'did:example:issuer', size: 2.5 })

      expect(sizeConstraints(errors)).toContain('isInt')
    })

    it('rejects a size above the maximum, so one request cannot allocate an oversized bitstring', async () => {
      const { errors } = await validateRequest({
        issuer: 'did:example:issuer',
        size: maxCredentialStatusListSize + 1,
      })

      expect(sizeConstraints(errors)).toContain('max')
    })
  })
})

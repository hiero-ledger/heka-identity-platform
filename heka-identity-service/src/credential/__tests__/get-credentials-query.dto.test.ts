import 'reflect-metadata'

import { DidCommCredentialRole, DidCommCredentialState } from '@credo-ts/didcomm'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'

import { GetCredentialsQueryDto } from '../dto'

const validateQuery = async (query: Record<string, unknown>) => {
  const instance = plainToInstance(GetCredentialsQueryDto, query)
  const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true })
  return { instance, errors }
}

const failedProperties = (errors: Awaited<ReturnType<typeof validateQuery>>['errors']) =>
  errors.map((error) => error.property)

describe('GetCredentialsQueryDto', () => {
  it('accepts an empty query', async () => {
    const { errors } = await validateQuery({})

    expect(errors).toHaveLength(0)
  })

  it('accepts threadId, role and state', async () => {
    const { errors, instance } = await validateQuery({
      threadId: 'thread-1',
      role: DidCommCredentialRole.Issuer,
      state: DidCommCredentialState.Done,
    })

    expect(errors).toHaveLength(0)
    expect(instance).toEqual({ threadId: 'thread-1', role: 'issuer', state: 'done' })
  })

  it.each(Object.values(DidCommCredentialRole))('accepts role=%s', async (role) => {
    const { errors } = await validateQuery({ role })

    expect(errors).toHaveLength(0)
  })

  it('rejects an unknown role', async () => {
    const { errors } = await validateQuery({ role: 'foo' })

    expect(failedProperties(errors)).toEqual(['role'])
  })

  it('rejects an unknown state', async () => {
    const { errors } = await validateQuery({ state: 'foo' })

    expect(failedProperties(errors)).toEqual(['state'])
  })
})

import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'

import {
  OpenId4VcVerificationSessionCreateRequestDto,
  VerificationSessionVersion,
} from '../dto/credential-verification.dto'

describe('OpenId4VcVerificationSessionCreateRequestDto', () => {
  test('accepts valid version values', async () => {
    for (const version of Object.values(VerificationSessionVersion)) {
      const dto = plainToInstance(OpenId4VcVerificationSessionCreateRequestDto, {
        publicVerifierId: 'verifier-1',
        requestSigner: {
          method: 'did',
          did: 'did:key:z6MkValid',
        },
        presentationExchange: {
          definition: {
            id: 'def-1',
            input_descriptors: [],
          },
        },
        version,
      })

      const errors = await validate(dto)
      expect(errors).toHaveLength(0)
    }
  })

  test('rejects unknown version value', async () => {
    const dto = plainToInstance(OpenId4VcVerificationSessionCreateRequestDto, {
      publicVerifierId: 'verifier-1',
      requestSigner: {
        method: 'did',
        did: 'did:key:z6MkValid',
      },
      presentationExchange: {
        definition: {
          id: 'def-1',
          input_descriptors: [],
        },
      },
      version: 'v2',
    })

    const errors = await validate(dto)

    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]?.constraints?.isEnum).toBeDefined()
  })
})

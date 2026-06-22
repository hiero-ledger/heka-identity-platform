import 'reflect-metadata'

import { OpenId4VciCredentialFormatProfile } from '@credo-ts/openid4vc'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'

import { DcqlQueryDto } from '../dto/dcql-query.dto'

const validateQuery = async (query: Record<string, unknown>) => {
  const instance = plainToInstance(DcqlQueryDto, query)
  const errors = await validate(instance)
  return { instance, errors }
}

describe('DcqlQueryDto', () => {
  it('accepts an mso_mdoc credential query', async () => {
    const { instance, errors } = await validateQuery({
      credentials: [
        {
          id: 'requested-credential',
          format: OpenId4VciCredentialFormatProfile.MsoMdoc,
          meta: { doctype_value: 'org.iso.18013.5.1.mDL' },
          claims: [{ path: ['org.iso.18013.5.1', 'age_over_18'], intent_to_retain: false }],
        },
      ],
    })

    expect(errors).toHaveLength(0)
    expect(instance.credentials[0].format).toBe('mso_mdoc')
  })

  it('accepts an SD-JWT VC query using the dc+sd-jwt type id', async () => {
    const { instance, errors } = await validateQuery({
      credentials: [
        {
          id: 'requested-credential',
          format: OpenId4VciCredentialFormatProfile.SdJwtDc,
          claims: [{ path: ['age_over_18'] }],
        },
      ],
    })

    expect(errors).toHaveLength(0)
    expect(instance.credentials[0].format).toBe('dc+sd-jwt')
  })

  it('still accepts an SD-JWT VC query using the legacy vc+sd-jwt type id', async () => {
    const { instance, errors } = await validateQuery({
      credentials: [
        {
          id: 'requested-credential',
          format: OpenId4VciCredentialFormatProfile.SdJwtVc,
          claims: [{ path: ['age_over_18'] }],
        },
      ],
    })

    expect(errors).toHaveLength(0)
    expect(instance.credentials[0].format).toBe('vc+sd-jwt')
  })
})

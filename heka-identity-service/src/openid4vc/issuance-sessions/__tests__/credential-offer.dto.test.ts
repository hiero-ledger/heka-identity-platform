import { OpenId4VciCredentialFormatProfile } from '@credo-ts/openid4vc'
import { plainToInstance } from 'class-transformer'
import { validate, ValidationError } from 'class-validator'

import { OpenId4VcIssuanceSessionsCreateOfferDto } from '../dto'

const offer = (credential: Record<string, unknown>) =>
  plainToInstance(OpenId4VcIssuanceSessionsCreateOfferDto, {
    publicIssuerId: 'issuer-1',
    credentials: [
      {
        credentialSupportedId: 'cred-sd-1',
        format: OpenId4VciCredentialFormatProfile.SdJwtVc,
        issuer: { method: 'did', did: 'did:key:z6MkIssuer' },
        payload: { first_name: 'John' },
        disclosureFrame: { _sd: ['first_name'] },
        ...credential,
      },
    ],
  })

const messages = (errors: ValidationError[]): string[] =>
  errors.flatMap((error) => [...Object.values(error.constraints ?? {}), ...messages(error.children ?? [])])

describe('OpenId4VcIssuanceSessionsCreateOfferDto — SD-JWT VC status claim', () => {
  test('accepts an SD-JWT VC credential without status', async () => {
    expect(await validate(offer({}))).toEqual([])
  })

  test('rejects a payload that sets status', async () => {
    const errors = await validate(offer({ payload: { first_name: 'John', status: { status_list: { idx: 1 } } } }))

    expect(messages(errors)).toEqual(['`status` is set by the issuer'])
  })

  test('rejects a disclosure frame that makes status selectively disclosable', async () => {
    const errors = await validate(offer({ disclosureFrame: { _sd: ['first_name', 'status'] } }))

    expect(messages(errors)).toEqual(['`status` is set by the issuer and cannot be selectively disclosed'])
  })

  test('accepts nested claims named status', async () => {
    expect(await validate(offer({ payload: { employment: { status: 'active' } } }))).toEqual([])
  })
})

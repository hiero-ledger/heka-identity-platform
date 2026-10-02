import 'reflect-metadata'

import { plainToInstance } from 'class-transformer'
import { validate, ValidationError } from 'class-validator'

import { OpenId4VcIssuanceSessionsCreateOfferDto } from '../dto/credential-offer.dto'

const validateOffer = async (credential: Record<string, unknown>) => {
  const instance = plainToInstance(OpenId4VcIssuanceSessionsCreateOfferDto, {
    publicIssuerId: 'issuer-1',
    credentials: [credential],
  })
  return validate(instance, { whitelist: true })
}

/** The property names that failed anywhere under `credentials[0]`. */
const failedProperties = (errors: ValidationError[]): string[] => {
  const collect = (error: ValidationError): string[] => [
    ...(error.constraints ? [error.property] : []),
    ...(error.children ?? []).flatMap(collect),
  ]
  return errors.flatMap(collect)
}

const sdJwt = {
  credentialSupportedId: 'cred-sd-1',
  format: 'vc+sd-jwt',
  payload: { first_name: 'Jane' },
  disclosureFrame: {},
}

describe('OpenId4VcIssuanceSessionsCreateOfferDto — issuer', () => {
  test('an SD-JWT VC offered in x5c mode needs no DID issuer', async () => {
    expect(await validateOffer({ ...sdJwt, issuerMode: 'x5c' })).toHaveLength(0)
  })

  test('an SD-JWT VC in (default) did mode requires the DID issuer', async () => {
    expect(failedProperties(await validateOffer(sdJwt))).toEqual(['issuer'])
    expect(failedProperties(await validateOffer({ ...sdJwt, issuerMode: 'did' }))).toEqual(['issuer'])
    expect(
      await validateOffer({ ...sdJwt, issuerMode: 'did', issuer: { method: 'did', did: 'did:key:z6Mk' } }),
    ).toHaveLength(0)
  })

  test('a W3C credential requires the DID issuer regardless of issuerMode', async () => {
    const jwtVc = { credentialSupportedId: 'cred-jwt-1', format: 'jwt_vc_json', credentialSubject: {} }
    expect(failedProperties(await validateOffer(jwtVc))).toEqual(['issuer'])
    expect(await validateOffer({ ...jwtVc, issuer: { method: 'did', did: 'did:key:z6Mk' } })).toHaveLength(0)
  })

  test('an mso_mdoc credential never carries a DID issuer', async () => {
    expect(
      await validateOffer({
        credentialSupportedId: 'cred-mdl-1',
        format: 'mso_mdoc',
        namespaces: { 'org.iso.18013.5.1': { given_name: 'Jane' } },
      }),
    ).toHaveLength(0)
  })
})

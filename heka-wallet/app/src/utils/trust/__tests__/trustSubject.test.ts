jest.mock('@credo-ts/core', () => ({
  Mdoc: class MockMdoc {
    public docType = ''
  },
}))

import { Mdoc } from '@credo-ts/core'

import { trustSubjectFor } from '../trustSubject'

describe('trustSubjectFor', () => {
  test('an mdoc credential → credential-issuer / mso_mdoc / docType', () => {
    const credential = Object.assign(new (Mdoc as unknown as new () => { docType: string })(), {
      docType: 'org.iso.18013.5.1.mDL',
    })
    expect(trustSubjectFor({ type: 'credential', credential })).toEqual({
      role: 'credential-issuer',
      format: 'mso_mdoc',
      credentialType: 'org.iso.18013.5.1.mDL',
    })
  })

  test('an SD-JWT VC credential → credential-issuer / dc+sd-jwt / vct', () => {
    const credential = { compact: 'a.b.c', payload: { vct: 'urn:eudi:pid:1' } }
    expect(trustSubjectFor({ type: 'credential', credential })).toEqual({
      role: 'credential-issuer',
      format: 'dc+sd-jwt',
      credentialType: 'urn:eudi:pid:1',
    })
  })

  test('any other credential → credential-issuer / other, no type', () => {
    expect(trustSubjectFor({ type: 'credential', credential: { jwt: {}, credential: {} } })).toEqual({
      role: 'credential-issuer',
      format: 'other',
    })
    expect(trustSubjectFor({ type: 'credential' })).toEqual({ role: 'credential-issuer', format: 'other' })
  })

  test.each(['oauth2SecuredAuthorizationRequest', 'openId4VciCredentialIssuerMetadata'])(
    '%s → access-certificate',
    (type) => {
      expect(trustSubjectFor({ type })).toEqual({ role: 'access-certificate-authority' })
    }
  )

  test.each(['openId4VciKeyAttestation', 'oauth2ClientAttestation', 'something-new'])(
    '%s → undefined (Credo global set)',
    (type) => {
      expect(trustSubjectFor({ type })).toBeUndefined()
    }
  )
})

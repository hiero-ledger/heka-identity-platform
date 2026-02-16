import {
  AriesCredentialFormat,
  AriesCredentialRegistrationFormat,
  CredentialFormat,
  CredentialRegistrationFormat,
  OpenId4VcCredentialFormat,
  OpenId4VCCredentialRegistrationFormat,
} from 'common/types'

export const generateRandomString = (
  length: number,
  upperEnabled?: boolean,
  lowerEnabled?: boolean,
  digitEnabled?: boolean,
): string => {
  const _upperEnabled = upperEnabled ?? true
  const _lowerEnabled = lowerEnabled ?? true
  const _digitEnabled = digitEnabled ?? false

  let result = ''
  const digits = '0123456789'
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const lower = 'abcdefghijklmnopqrstuvwxyz'
  const characters = (_upperEnabled ? upper : '') + (_lowerEnabled ? lower : '') + (_digitEnabled ? digits : '')
  const charactersLength = characters.length
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength))
  }
  return result
}

export const credentialRegistrationFormatToCredentialFormat = (
  format?: CredentialRegistrationFormat,
): CredentialFormat => {
  switch (format) {
    case OpenId4VCCredentialRegistrationFormat.JwtVcJson:
      return OpenId4VcCredentialFormat.JwtVcJson
    case OpenId4VCCredentialRegistrationFormat.JwtVcJsonLd:
      return OpenId4VcCredentialFormat.JwtVcJsonLd
    case OpenId4VCCredentialRegistrationFormat.LdpVc:
      return OpenId4VcCredentialFormat.LdpVc
    case OpenId4VCCredentialRegistrationFormat.SdJwtVc:
      return OpenId4VcCredentialFormat.SdJwtVc
    case AriesCredentialRegistrationFormat.Anoncreds:
      return AriesCredentialFormat.AnoncredsIndy
    default:
      return OpenId4VcCredentialFormat.JwtVcJson
  }
}

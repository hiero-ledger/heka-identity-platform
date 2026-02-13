import { AriesCredentialFormat, CredentialFormat, OpenId4VcCredentialFormat } from './credential-format'
import { ProtocolType } from './protocol-type'

export enum AriesCredentialRegistrationFormat {
  Anoncreds = 'anoncreds',
}

export enum OpenId4VCCredentialRegistrationFormat {
  JwtVcJson = 'jwt_vc_json',
  JwtVcJsonLd = 'jwt_vc_json-ld',
  LdpVc = 'ldp_vc',
  SdJwtVc = 'vc+sd-jwt',
}

export type CredentialRegistrationFormat = AriesCredentialRegistrationFormat | OpenId4VCCredentialRegistrationFormat

export const protocolCredentialRegistrationFormats: Record<ProtocolType, Array<CredentialRegistrationFormat>> = {
  [ProtocolType.Aries]: [AriesCredentialRegistrationFormat.Anoncreds],
  [ProtocolType.Oid4vc]: [
    OpenId4VCCredentialRegistrationFormat.SdJwtVc,
    OpenId4VCCredentialRegistrationFormat.JwtVcJson,
    OpenId4VCCredentialRegistrationFormat.JwtVcJsonLd,
    OpenId4VCCredentialRegistrationFormat.LdpVc,
  ],
}

export const credentialFormatToCredentialRegistrationFormat = (
  format: CredentialFormat,
): CredentialRegistrationFormat => {
  const map: Record<CredentialFormat, CredentialRegistrationFormat> = {
    [AriesCredentialFormat.AnoncredsIndy]: AriesCredentialRegistrationFormat.Anoncreds,
    [AriesCredentialFormat.AnoncredsW3c]: AriesCredentialRegistrationFormat.Anoncreds,
    [OpenId4VcCredentialFormat.SdJwtVc]: OpenId4VCCredentialRegistrationFormat.SdJwtVc,
    [OpenId4VcCredentialFormat.JwtVcJson]: OpenId4VCCredentialRegistrationFormat.JwtVcJson,
    [OpenId4VcCredentialFormat.JwtVcJsonLd]: OpenId4VCCredentialRegistrationFormat.JwtVcJsonLd,
    [OpenId4VcCredentialFormat.LdpVc]: OpenId4VCCredentialRegistrationFormat.LdpVc,
  }
  return map[format]
}

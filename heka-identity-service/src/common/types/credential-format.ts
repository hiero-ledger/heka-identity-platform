import { ProtocolType } from './protocol-type'

export enum AriesCredentialFormat {
  AnoncredsIndy = 'anoncreds-indy',
  AnoncredsW3c = 'anoncreds-w3c',
}

export enum OpenId4VcCredentialFormat {
  JwtVcJson = 'jwt_vc_json',
  JwtVcJsonLd = 'jwt_vc_json-ld',
  LdpVc = 'ldp_vc',
  SdJwtVc = 'vc+sd-jwt',
}

export type CredentialFormat = AriesCredentialFormat | OpenId4VcCredentialFormat

export const credentialTypes: Record<ProtocolType, Array<CredentialFormat>> = {
  [ProtocolType.Aries]: [AriesCredentialFormat.AnoncredsIndy, AriesCredentialFormat.AnoncredsW3c],
  [ProtocolType.Oid4vc]: [
    OpenId4VcCredentialFormat.SdJwtVc,
    OpenId4VcCredentialFormat.JwtVcJson,
    OpenId4VcCredentialFormat.JwtVcJsonLd,
    OpenId4VcCredentialFormat.LdpVc,
  ],
}

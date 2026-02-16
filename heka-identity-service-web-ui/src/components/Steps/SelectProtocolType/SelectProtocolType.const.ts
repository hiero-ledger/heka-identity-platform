import {
  AriesCredentialFormat,
  Openid4CredentialFormat,
  ProtocolType,
} from '@/entities/Schema/model/types/schema';

export interface Option {
  value: string;
  content: string;
}

export const protocolsTypes: Array<Option> = [
  { value: ProtocolType.Aries, content: ProtocolType.Aries },
  { value: ProtocolType.Oid4vc, content: ProtocolType.Oid4vc },
];

export const credentialTypes: Record<string, Array<Option>> = {
  [ProtocolType.Aries]: [
    {
      value: AriesCredentialFormat.AnoncredsIndy,
      content: AriesCredentialFormat.AnoncredsIndy,
    },
    {
      value: AriesCredentialFormat.AnoncredsW3c,
      content: AriesCredentialFormat.AnoncredsW3c,
    },
  ],
  [ProtocolType.Oid4vc]: [
    {
      value: Openid4CredentialFormat.SdJwt,
      content: Openid4CredentialFormat.SdJwt,
    },
    {
      value: Openid4CredentialFormat.JwtJson,
      content: Openid4CredentialFormat.JwtJson,
    },
    {
      value: Openid4CredentialFormat.JwtJsonLd,
      content: Openid4CredentialFormat.JwtJsonLd,
    },
    {
      value: Openid4CredentialFormat.LdpVc,
      content: Openid4CredentialFormat.LdpVc,
    },
  ],
};

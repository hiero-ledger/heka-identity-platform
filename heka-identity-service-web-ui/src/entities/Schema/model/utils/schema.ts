import {
  Openid4CredentialFormat,
  ProtocolType,
  Schema,
  SchemaRegistration,
} from '@/entities/Schema/model/types/schema';

interface OpenId4VcSdJwtCredentialSchema {
  format: Openid4CredentialFormat.SdJwt;
  id: string;
  vct: string;
  claims: Record<string, unknown>;
}

interface OpenId4VcJwtJsonCredentialSchema {
  format: Openid4CredentialFormat.JwtJson;
  types: string[];
  id: string;
  credentialSubject: Record<string, unknown>;
}

interface OpenId4VcJwtJsonLdCredentialSchema {
  format: Openid4CredentialFormat.JwtJsonLd;
  '@context': Array<string>;
  types: string[];
  id: string;
  credentialSubject: Record<string, unknown>;
}

interface OpenId4VcLdpVcCredentialSchema {
  format: Openid4CredentialFormat.LdpVc;
  '@context': Array<string>;
  types: string[];
  id: string;
  credentialSubject: Record<string, unknown>;
}

export type OpenId4CredentialSchema =
  | OpenId4VcSdJwtCredentialSchema
  | OpenId4VcJwtJsonCredentialSchema
  | OpenId4VcJwtJsonLdCredentialSchema
  | OpenId4VcLdpVcCredentialSchema;

export const convertOpenIdSchema = (schema: OpenId4CredentialSchema) => {
  switch (schema.format) {
    case Openid4CredentialFormat.SdJwt:
      return {
        protocolType: ProtocolType.Oid4vc,
        id: schema.id,
        format: schema.format,
        attributes: Object.keys(schema.claims ?? {}),
      };
    case Openid4CredentialFormat.JwtJson:
      return {
        protocolType: ProtocolType.Oid4vc,
        id: schema.id,
        format: schema.format,
        types: schema.types,
        attributes: Object.keys(schema.credentialSubject ?? {}),
      };
    case Openid4CredentialFormat.JwtJsonLd:
    case Openid4CredentialFormat.LdpVc:
      return {
        protocolType: ProtocolType.Oid4vc,
        id: schema.id,
        format: schema.format,
        types: schema.types,
        context: schema['@context'],
        attributes: Object.keys(schema.credentialSubject ?? {}),
      };
  }
};

export interface AnoncredsSchema {
  id: string;
  name: string;
  version: string;
  issuerId: string;
  attrNames: Array<string>;
}

export const convertAnoncredsSchema = (schema: AnoncredsSchema) => {
  return {
    protocolType: ProtocolType.Aries,
    id: schema.id,
    name: schema.name,
    version: schema.version,
    issuerId: schema.issuerId,
    attributes: schema.attrNames,
  };
};

export const getRegistration = (
  schema: Schema,
  context: {
    network?: string;
    did?: string;
    credentialFormat?: string;
    protocolType?: string;
  },
): SchemaRegistration | undefined => {
  return schema.registrations?.find((registration) => {
    if (registration.protocol === ProtocolType.Aries) {
      return (
        registration.credentialFormat === context.credentialFormat &&
        registration.network === context.network &&
        registration.did === context.did
      );
    } else {
      return (
        registration.credentialFormat === context.credentialFormat &&
        registration.network === context.network &&
        registration.protocol === context.protocolType &&
        registration.did === context.did
      );
    }
  });
};

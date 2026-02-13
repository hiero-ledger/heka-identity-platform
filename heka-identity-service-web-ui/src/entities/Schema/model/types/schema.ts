export enum ProtocolType {
  Aries = 'Aries',
  Oid4vc = 'OpenId4VC',
}

export enum AriesCredentialFormat {
  AnoncredsIndy = 'anoncreds-indy',
  AnoncredsW3c = 'anoncreds-w3c',
}

export enum Openid4CredentialFormat {
  SdJwt = 'vc+sd-jwt',
  JwtJson = 'jwt_vc_json',
  JwtJsonLd = 'jwt_vc_json-ld',
  LdpVc = 'ldp_vc',
}

export type CredentialFormat = AriesCredentialFormat | Openid4CredentialFormat;

export enum AriesCredentialRegistrationFormat {
  Anoncreds = 'anoncreds',
}

export enum Openid4CredentialRegistrationFormat {
  SdJwt = 'vc+sd-jwt',
  JwtJson = 'jwt_vc_json',
  JwtJsonLd = 'jwt_vc_json-ld',
  LdpVc = 'ldp_vc',
}

export type CredentialRegistrationFormat =
  | AriesCredentialRegistrationFormat
  | Openid4CredentialRegistrationFormat;

export const credentialFormatToCredentialRegistrationFormat = (
  format: CredentialFormat,
): CredentialRegistrationFormat => {
  const map: Record<CredentialFormat, CredentialRegistrationFormat> = {
    [AriesCredentialFormat.AnoncredsIndy]:
      AriesCredentialRegistrationFormat.Anoncreds,
    [AriesCredentialFormat.AnoncredsW3c]:
      AriesCredentialRegistrationFormat.Anoncreds,
    [Openid4CredentialFormat.SdJwt]: Openid4CredentialRegistrationFormat.SdJwt,
    [Openid4CredentialFormat.JwtJson]:
      Openid4CredentialRegistrationFormat.JwtJson,
    [Openid4CredentialFormat.JwtJsonLd]:
      Openid4CredentialRegistrationFormat.JwtJsonLd,
    [Openid4CredentialFormat.LdpVc]: Openid4CredentialRegistrationFormat.LdpVc,
  };
  return map[format];
};

export type SchemasParams = Partial<{
  offset: number;
  limit: number;
  text: string;
  isHidden: boolean;
}>;

export interface SchemaResponse {
  id: string;
  name: string;
  logo?: string;
  bgColor?: string;
  isHidden: boolean;
  orderIndex: number;
  fields: { id: string; name: string }[];
  registrationsCount?: number;
  registrations: Array<SchemaRegistration>;
}

export interface SchemasResponse {
  offset: number;
  limit: number;
  total: number;
  items: SchemaResponse[];
}

export interface AriesSchemaRegistration {
  issuerId: string;
  schemaId: string;
  credentialDefinitionId: string;
}
export interface OpenIdVciSchemaRegistration {
  issuerId: string;
  supportedCredentialId: string;
}

export interface SchemaRegistration {
  schemaId: string;
  protocol: string;
  credentialFormat: string;
  network: string;
  did: string;
  credentials?: AriesSchemaRegistration | OpenIdVciSchemaRegistration;
}

export interface SchemaField {
  id: string;
  name: string;
}

export interface Schema {
  id: string;
  name?: string;
  logo?: string;
  bgColor?: string;
  isHidden?: boolean;
  orderIndex?: number;
  fields: SchemaField[];
  issuerId?: string;
  issuerName?: string;
  version?: string;
  format?: string;
  context?: Array<string>;
  json?: string;
  registrationsCount?: number;
  registrations?: Array<SchemaRegistration>;
}

export interface SchemasSchema {
  isLoading: boolean;
  error?: string;
  schemas?: Schema[];
  schema?: Schema;
}

export interface UpdateSchemaParams {
  schemaId: string;
  params: {
    logo?: File;
    bgColor?: string;
    prevSchemaId?: string;
    isHidden?: boolean;
  };
}

export interface UpdateSchemaResult {
  schemaId: string;
  params: {
    logo?: string;
    bgColor?: string;
  };
}

import { ProtocolType } from '@/entities/Schema';
import {
  CredentialFormat,
  SchemaField,
  SchemaRegistration,
} from '@/entities/Schema/model/types/schema';

export interface IssuanceTemplateField {
  id: string;
  schemaFieldId: string;
  schemaFieldName: string;
  value: string;
}

export interface SchemaDetails {
  id: string;
  name: string;
  logo?: string;
  bgColor?: string;
  registrations: Array<SchemaRegistration>;
  fields: SchemaField[];
}

export interface IssuanceTemplate {
  id: string;
  name: string;
  protocol: ProtocolType;
  credentialFormat: CredentialFormat;
  network: string;
  did: string;
  schema: SchemaDetails;
  orderIndex: number;
  fields: Array<IssuanceTemplateField>;
}

export interface IssuanceTemplateList {
  offset: number;
  limit: number;
  total: number;
  items: IssuanceTemplate[];
}

export interface IssuanceTemplateSchema {
  isLoading: boolean;
  error?: string;
  issuanceTemplates?: IssuanceTemplate[];
  issuanceTemplate?: IssuanceTemplate;
}

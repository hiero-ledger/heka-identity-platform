import { ProtocolType } from '@/entities/Schema';
import {
  CredentialFormat,
  SchemaField,
  SchemaRegistration,
} from '@/entities/Schema/model/types/schema';

export interface VerificationTemplateField {
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

export interface VerificationTemplate {
  id: string;
  name: string;
  protocol: ProtocolType;
  credentialFormat: CredentialFormat;
  network: string;
  did: string;
  schema: SchemaDetails;
  orderIndex: number;
  fields: Array<VerificationTemplateField>;
}

export interface VerificationTemplateList {
  offset: number;
  limit: number;
  total: number;
  items: VerificationTemplate[];
}

export interface VerificationTemplateSchema {
  isLoading: boolean;
  error?: string;
  verificationTemplates?: VerificationTemplate[];
  verificationTemplate?: VerificationTemplate;
}

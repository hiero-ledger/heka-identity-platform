import { Schema } from '@/entities/Schema';
import {
  AriesCredentialFormat,
  ProtocolType,
} from '@/entities/Schema/model/types/schema';
import { VerificationTemplate } from '@/entities/VerificationTemplate/model/types/verificationTemplate';

export const makeSchema = (overrides: Partial<Schema> = {}): Schema => ({
  id: 'schema-1',
  name: 'Passport',
  fields: [
    { id: 'f-1', name: 'firstName' },
    { id: 'f-2', name: 'lastName' },
    { id: 'f-3', name: 'age' },
  ],
  registrations: [],
  ...overrides,
});

export const makeVerificationTemplate = (
  overrides: Partial<VerificationTemplate> = {},
): VerificationTemplate => ({
  id: 'tpl-1',
  name: 'KYC check',
  protocol: ProtocolType.Aries,
  credentialFormat: AriesCredentialFormat.AnoncredsIndy,
  network: 'indy',
  did: 'did:indy:issuer',
  orderIndex: 0,
  schema: {
    id: 'schema-1',
    name: 'Passport',
    registrations: [],
    fields: [
      { id: 'f-1', name: 'firstName' },
      { id: 'f-2', name: 'lastName' },
      { id: 'f-3', name: 'age' },
    ],
  },
  fields: [
    {
      id: 'tf-1',
      schemaFieldId: 'f-1',
      schemaFieldName: 'firstName',
      value: '',
    },
  ],
  ...overrides,
});

import { ProtocolType } from '@/entities/Schema';
import {
  AriesCredentialRegistrationFormat,
  AriesSchemaRegistration,
  OpenIdVciSchemaRegistration,
  SchemaResponse,
} from '@/entities/Schema/model/types/schema';

import {
  AnoncredsCredentialRecordResponse,
  IssuedCredential,
  OpenIdIssuanceSessionResponse,
} from '../types/issuedCredential';

export const issuedCredentialKey = (protocol: ProtocolType, id: string) =>
  `${protocol}:${id}`;

const findSchemaName = (
  schemas: SchemaResponse[],
  matches: (credentials: Partial<AriesSchemaRegistration & OpenIdVciSchemaRegistration>) => boolean,
) =>
  schemas.find((schema) =>
    (schema.registrations ?? []).some(
      (registration) =>
        registration.credentials !== undefined &&
        matches(registration.credentials),
    ),
  )?.name;

/** Only the metadata fields are copied: never attributes or claims */
export const mapAnoncredsCredential = (
  record: AnoncredsCredentialRecordResponse,
  schemas: SchemaResponse[],
): IssuedCredential => {
  const { credentialDefinitionId } = record;
  const schemaName = credentialDefinitionId
    ? findSchemaName(
        schemas,
        (credentials) =>
          credentials.credentialDefinitionId === credentialDefinitionId,
      )
    : undefined;

  return {
    key: issuedCredentialKey(ProtocolType.Aries, record.id),
    id: record.id,
    protocol: ProtocolType.Aries,
    name: schemaName ?? credentialDefinitionId ?? record.id,
    formats: [AriesCredentialRegistrationFormat.Anoncreds],
    issuedAt: record.updatedAt ?? record.createdAt,
    credentialDefinitionId,
    revocable: record.revocable === true,
    revoked: record.revoked,
  };
};

/** Only the metadata fields are copied: never claims, the pre-authorized code or the offer URI */
export const mapOpenIdIssuanceSession = (
  session: OpenIdIssuanceSessionResponse,
  schemas: SchemaResponse[],
): IssuedCredential => {
  const credentials = session.issuanceMetadata?.credentials ?? [];
  const offeredIds =
    session.credentialOfferPayload?.credential_configuration_ids ??
    credentials
      .map((credential) => credential.credentialSupportedId)
      .filter((id): id is string => !!id);
  const credentialConfigurationIds = offeredIds.length ? offeredIds : undefined;
  const [firstConfigurationId] = offeredIds;
  const schemaName = firstConfigurationId
    ? findSchemaName(
        schemas,
        (registration) =>
          registration.supportedCredentialId === firstConfigurationId,
      )
    : undefined;

  return {
    key: issuedCredentialKey(ProtocolType.Oid4vc, session.id),
    id: session.id,
    protocol: ProtocolType.Oid4vc,
    name: schemaName ?? credentialConfigurationIds?.join(', ') ?? session.id,
    formats: Array.from(
      new Set(
        credentials
          .map((credential) => credential.format)
          .filter((format): format is string => !!format),
      ),
    ),
    issuedAt: session.updatedAt ?? session.createdAt,
    issuerDid: credentials[0]?.issuer?.did ?? session.publicIssuerId,
    credentialConfigurationIds,
    revocable: session.revocable === true,
  };
};

/** Newest first */
export const sortByIssuedAt = (items: IssuedCredential[]) =>
  [...items].sort(
    (a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime(),
  );

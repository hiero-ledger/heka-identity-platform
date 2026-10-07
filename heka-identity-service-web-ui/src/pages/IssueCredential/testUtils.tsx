import { useLocation } from 'react-router-dom';

import { CredentialConfig } from '@/entities/Credential/model/services/getCredentialConfig';
import { IssuanceTemplate } from '@/entities/IssuanceTemplate';
import { ProtocolType, Schema } from '@/entities/Schema';
import {
  AriesCredentialFormat,
  AriesCredentialRegistrationFormat,
  Openid4CredentialFormat,
  SchemaRegistration,
} from '@/entities/Schema/model/types/schema';
import { DidDocument } from '@/entities/User/model/types/user';
import { MockApi } from '@/shared/lib/tests/renderWithProviders';

export const INDY_DID = 'did:indy:test:issuer1';
export const KEY_DID = 'did:key:z6MkIssuer';

export const credentialConfig: CredentialConfig = {
  [ProtocolType.Aries]: {
    credentials: [
      AriesCredentialFormat.AnoncredsIndy,
      AriesCredentialFormat.AnoncredsW3c,
    ],
    networks: ['indy', 'hedera'],
  },
  [ProtocolType.Oid4vc]: {
    credentials: [Openid4CredentialFormat.SdJwt],
    networks: ['key'],
  },
};

export const didDocuments: DidDocument[] = [
  { id: INDY_DID, verificationMethod: [] },
  { id: KEY_DID, verificationMethod: [] },
];

export const indyRegistration = (schemaId: string): SchemaRegistration => ({
  schemaId,
  protocol: ProtocolType.Aries,
  credentialFormat: AriesCredentialRegistrationFormat.Anoncreds,
  network: 'indy',
  did: INDY_DID,
  credentials: {
    issuerId: INDY_DID,
    schemaId,
    credentialDefinitionId: `${schemaId}-cred-def`,
  },
});

export const registeredSchema: Schema = {
  id: 'schema-passport',
  name: 'Passport',
  bgColor: '#123456',
  fields: [
    { id: 'f1', name: 'firstName' },
    { id: 'f2', name: 'lastName' },
  ],
  registrationsCount: 1,
  registrations: [indyRegistration('schema-passport')],
};

export const unregisteredSchema: Schema = {
  id: 'schema-diploma',
  name: 'Diploma',
  fields: [{ id: 'f3', name: 'degree' }],
  registrationsCount: 0,
  registrations: [],
};

export const issuanceTemplate: IssuanceTemplate = {
  id: 'template-1',
  name: 'My passport template',
  protocol: ProtocolType.Aries,
  credentialFormat: AriesCredentialFormat.AnoncredsIndy,
  network: 'indy',
  did: INDY_DID,
  orderIndex: 0,
  schema: {
    id: registeredSchema.id,
    name: registeredSchema.name!,
    registrations: registeredSchema.registrations!,
    fields: registeredSchema.fields,
  },
  fields: [
    {
      id: 'tf1',
      schemaFieldId: 'f1',
      schemaFieldName: 'firstName',
      value: 'Alice',
    },
    {
      id: 'tf2',
      schemaFieldId: 'f2',
      schemaFieldName: 'lastName',
      value: 'Smith',
    },
  ],
};

export interface AgencyFixtures {
  schemas?: Schema[];
  singleSchema?: (id: string) => Schema | undefined;
  template?: IssuanceTemplate;
  templates?: IssuanceTemplate[];
  dids?: DidDocument[];
}

/** Routes the mock agency API's GET requests by endpoint, like the real identity service. */
export const routeAgencyGets = (
  api: MockApi,
  {
    schemas = [registeredSchema, unregisteredSchema],
    singleSchema = (id) => schemas.find((s) => s.id === id),
    template = issuanceTemplate,
    templates = [issuanceTemplate],
    dids = didDocuments,
  }: AgencyFixtures = {},
) => {
  api.get.mockImplementation(
    (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === '/credentials/config')
        return Promise.resolve({ data: credentialConfig });
      if (url === '/dids') {
        const method = config?.params?.method as string | undefined;
        return Promise.resolve({
          data: dids.filter(
            (d) => !method || d.id.startsWith(`did:${method}:`),
          ),
        });
      }
      if (url === '/v2/schemas')
        return Promise.resolve({
          data: { items: schemas, offset: 0, limit: 100, total: 0 },
        });
      const registration = url.match(/^\/v2\/schemas\/(.+)\/registration$/);
      if (registration)
        return Promise.resolve({ data: indyRegistration(registration[1]) });
      const single = url.match(/^\/v2\/schemas\/(.+)$/);
      if (single) return Promise.resolve({ data: singleSchema(single[1]) });
      if (url === '/issuance-templates')
        return Promise.resolve({
          data: { items: templates, offset: 0, limit: 100, total: 0 },
        });
      if (url.startsWith('/issuance-templates/'))
        return Promise.resolve({ data: template });
      if (url === 'connections') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: undefined });
    },
  );
};

/** Prints the current location so tests can assert on navigation and its state. */
export const LocationProbe = () => {
  const location = useLocation();
  return (
    <>
      <div data-testid="pathname">{location.pathname}</div>
      <div data-testid="location-state">
        {JSON.stringify(location.state ?? null)}
      </div>
    </>
  );
};

export const readLocationState = (element: HTMLElement) =>
  JSON.parse(element.textContent ?? 'null');

import {
  AriesCredentialFormat,
  ProtocolType,
  Schema,
} from '@/entities/Schema/model/types/schema';

import { buildAriesPresentationRequest } from './presentation-request';

const registeredSchema: Schema = {
  id: 'schema-1',
  name: 'Passport',
  fields: [],
  registrations: [
    {
      schemaId: 'schema-1',
      protocol: ProtocolType.Oid4vc,
      credentialFormat: 'vc+sd-jwt',
      network: 'key',
      did: 'did:key:1',
    },
    {
      schemaId: 'schema-1',
      protocol: ProtocolType.Aries,
      credentialFormat: 'anoncreds',
      network: 'indy:test',
      did: 'did:indy:1',
      credentials: {
        issuerId: 'did:indy:1',
        schemaId: 'anon',
        credentialDefinitionId: 'cred-def-1',
      },
    },
  ],
};

describe('buildAriesPresentationRequest — AnonCreds Indy', () => {
  test('binds each attribute to the credential definition of the Aries registration', () => {
    expect(
      buildAriesPresentationRequest({
        format: AriesCredentialFormat.AnoncredsIndy,
        connectionId: 'conn-1',
        attributes: ['name', 'age'],
        schema: registeredSchema,
      }),
    ).toEqual({
      connectionId: 'conn-1',
      comment: 'Passport',
      request: {
        format: AriesCredentialFormat.AnoncredsIndy,
        name: 'Passport',
        proofParams: {
          attributes: [
            { name: 'name', credentialDefinitionId: 'cred-def-1' },
            { name: 'age', credentialDefinitionId: 'cred-def-1' },
          ],
        },
      },
      requestNonRevokedProof: true,
    });
  });

  test('without a schema it requests the attributes from any credential definition', () => {
    expect(
      buildAriesPresentationRequest({
        format: AriesCredentialFormat.AnoncredsIndy,
        attributes: ['name'],
      }),
    ).toMatchObject({
      comment: 'Presentation Request',
      request: {
        name: 'Presentation Request',
        proofParams: {
          attributes: [{ name: 'name', credentialDefinitionId: undefined }],
        },
      },
    });
  });

  test('throws for a schema without an AnonCreds registration', () => {
    expect(() =>
      buildAriesPresentationRequest({
        format: AriesCredentialFormat.AnoncredsIndy,
        attributes: ['name'],
        schema: { id: 'schema-2', fields: [], registrations: [] },
      }),
    ).toThrow('Schema schema-2 is not registered');
  });
});

describe('buildAriesPresentationRequest — AnonCreds W3C', () => {
  test('builds a DIF presentation exchange over the credential subject', () => {
    const request = buildAriesPresentationRequest({
      format: AriesCredentialFormat.AnoncredsW3c,
      connectionId: 'conn-1',
      attributes: ['name'],
      schema: registeredSchema,
    });

    expect(request).toMatchObject({
      connectionId: 'conn-1',
      comment: 'Passport',
      request: {
        format: 'dif-presentation-exchange',
        presentationExchange: {
          name: 'Passport',
          purpose: 'Passport',
          input_descriptors: [
            {
              name: 'Passport',
              schema: [{ uri: 'https://www.w3.org/2018/credentials/v1' }],
              constraints: {
                limit_disclosure: 'required',
                fields: [{ path: ['$.credentialSubject.name'] }],
              },
            },
          ],
        },
      },
    });
  });

  test('falls back to a generic name without a schema', () => {
    const request = buildAriesPresentationRequest({
      format: AriesCredentialFormat.AnoncredsW3c,
    });

    expect(request).toMatchObject({
      comment: 'Presentation Request',
      request: {
        presentationExchange: {
          name: 'Presentation Request',
          purpose: undefined,
          input_descriptors: [
            {
              name: 'Presentation Request',
              constraints: { fields: undefined },
            },
          ],
        },
      },
    });
  });
});

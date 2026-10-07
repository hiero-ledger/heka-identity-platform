import {
  AriesCredentialFormat,
  credentialFormatToCredentialRegistrationFormat,
  Openid4CredentialFormat,
  ProtocolType,
  Schema,
  SchemaRegistration,
} from '@/entities/Schema/model/types/schema';

import {
  convertAnoncredsSchema,
  convertOpenIdSchema,
  getRegistration,
} from './schema';

describe('convertOpenIdSchema', () => {
  test('SD-JWT lists the claim names', () => {
    expect(
      convertOpenIdSchema({
        format: Openid4CredentialFormat.SdJwt,
        id: 'sd',
        vct: 'Passport',
        claims: { given_name: {}, family_name: {} },
      }),
    ).toEqual({
      protocolType: ProtocolType.Oid4vc,
      id: 'sd',
      format: Openid4CredentialFormat.SdJwt,
      attributes: ['given_name', 'family_name'],
    });
  });

  test('JWT JSON keeps the types and lists the subject fields', () => {
    expect(
      convertOpenIdSchema({
        format: Openid4CredentialFormat.JwtJson,
        id: 'jwt',
        types: ['VerifiableCredential'],
        credentialSubject: { name: {} },
      }),
    ).toEqual({
      protocolType: ProtocolType.Oid4vc,
      id: 'jwt',
      format: Openid4CredentialFormat.JwtJson,
      types: ['VerifiableCredential'],
      attributes: ['name'],
    });
  });

  test.each([Openid4CredentialFormat.JwtJsonLd, Openid4CredentialFormat.LdpVc])(
    '%s keeps the context',
    (format) => {
      expect(
        convertOpenIdSchema({
          format,
          id: 'ld',
          '@context': ['https://ctx'],
          types: ['VC'],
          credentialSubject: { age: {} },
        } as Parameters<typeof convertOpenIdSchema>[0]),
      ).toEqual({
        protocolType: ProtocolType.Oid4vc,
        id: 'ld',
        format,
        types: ['VC'],
        context: ['https://ctx'],
        attributes: ['age'],
      });
    },
  );

  test('mdoc keeps the doctype and tolerates missing claims', () => {
    expect(
      convertOpenIdSchema({
        format: Openid4CredentialFormat.MsoMdoc,
        id: 'mdl',
        doctype: 'org.iso.18013.5.1.mDL',
      }),
    ).toEqual({
      protocolType: ProtocolType.Oid4vc,
      id: 'mdl',
      format: Openid4CredentialFormat.MsoMdoc,
      doctype: 'org.iso.18013.5.1.mDL',
      attributes: [],
    });
  });
});

describe('convertAnoncredsSchema', () => {
  test('maps the attribute names', () => {
    expect(
      convertAnoncredsSchema({
        id: 'a1',
        name: 'Passport',
        version: '1.0',
        issuerId: 'did:indy:1',
        attrNames: ['name'],
      }),
    ).toEqual({
      protocolType: ProtocolType.Aries,
      id: 'a1',
      name: 'Passport',
      version: '1.0',
      issuerId: 'did:indy:1',
      attributes: ['name'],
    });
  });
});

describe('getRegistration', () => {
  const aries: SchemaRegistration = {
    schemaId: 's',
    protocol: ProtocolType.Aries,
    credentialFormat: 'anoncreds',
    network: 'indy:test',
    did: 'did:indy:1',
  };
  const oid: SchemaRegistration = {
    schemaId: 's',
    protocol: ProtocolType.Oid4vc,
    credentialFormat: 'vc+sd-jwt',
    network: 'key',
    did: 'did:key:1',
  };
  const schema: Schema = { id: 's', fields: [], registrations: [aries, oid] };

  test('matches an Aries registration by format, network and DID', () => {
    expect(
      getRegistration(schema, {
        credentialFormat: 'anoncreds',
        network: 'indy:test',
        did: 'did:indy:1',
      }),
    ).toBe(aries);
  });

  test('also requires the protocol for OpenID4VC registrations', () => {
    const context = {
      credentialFormat: 'vc+sd-jwt',
      network: 'key',
      did: 'did:key:1',
    };
    expect(getRegistration(schema, context)).toBeUndefined();
    expect(
      getRegistration(schema, {
        ...context,
        protocolType: ProtocolType.Oid4vc,
      }),
    ).toBe(oid);
  });

  test('returns undefined for a schema without registrations', () => {
    expect(getRegistration({ id: 's', fields: [] }, {})).toBeUndefined();
  });
});

describe('credentialFormatToCredentialRegistrationFormat', () => {
  test.each([
    [AriesCredentialFormat.AnoncredsIndy, 'anoncreds'],
    [AriesCredentialFormat.AnoncredsW3c, 'anoncreds'],
    [Openid4CredentialFormat.SdJwt, 'vc+sd-jwt'],
    [Openid4CredentialFormat.MsoMdoc, 'mso_mdoc'],
  ])('%s registers as %s', (format, expected) => {
    expect(credentialFormatToCredentialRegistrationFormat(format)).toBe(
      expected,
    );
  });
});

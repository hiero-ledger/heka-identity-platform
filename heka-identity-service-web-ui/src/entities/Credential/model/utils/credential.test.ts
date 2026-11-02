import { credentialsContext } from '@/const/credentials';
import { Openid4CredentialFormat } from '@/entities/Schema/model/types/schema';

import { buildCredential, buildOpenIdCredentialOffer } from './credential';

const base = {
  did: 'did:key:issuer',
  credentialSupportedId: 'sc-1',
  credentialValues: { name: 'Ada', age: '36' },
};
const issuer = { did: 'did:key:issuer', method: 'did' };

describe('buildCredential', () => {
  test('SD-JWT discloses every claim selectively', () => {
    expect(
      buildCredential({ ...base, format: Openid4CredentialFormat.SdJwt }),
    ).toEqual({
      credentialSupportedId: 'sc-1',
      format: Openid4CredentialFormat.SdJwt,
      issuer,
      payload: base.credentialValues,
      disclosureFrame: { _sd: ['name', 'age'] },
    });
  });

  test('JWT JSON puts the values in the credential subject', () => {
    expect(
      buildCredential({ ...base, format: Openid4CredentialFormat.JwtJson }),
    ).toEqual({
      credentialSupportedId: 'sc-1',
      format: Openid4CredentialFormat.JwtJson,
      issuer,
      credentialSubject: base.credentialValues,
    });
  });

  test.each([Openid4CredentialFormat.JwtJsonLd, Openid4CredentialFormat.LdpVc])(
    '%s uses the given context, or the W3C credentials context',
    (format) => {
      expect(
        buildCredential({ ...base, format, context: ['https://ctx'] }),
      ).toEqual({
        credentialSupportedId: 'sc-1',
        '@context': ['https://ctx'],
        format,
        issuer,
        credentialSubject: base.credentialValues,
      });
      expect(buildCredential({ ...base, format })).toMatchObject({
        '@context': [credentialsContext],
      });
    },
  );

  test('mdoc groups the values under the namespace, ISO mDL by default', () => {
    expect(
      buildCredential({
        ...base,
        format: Openid4CredentialFormat.MsoMdoc,
        namespace: 'org.example',
      }),
    ).toEqual({
      credentialSupportedId: 'sc-1',
      format: Openid4CredentialFormat.MsoMdoc,
      namespaces: { 'org.example': base.credentialValues },
    });
    expect(
      buildCredential({ ...base, format: Openid4CredentialFormat.MsoMdoc }),
    ).toMatchObject({
      namespaces: { 'org.iso.18013.5.1': base.credentialValues },
    });
  });
});

describe('buildOpenIdCredentialOffer', () => {
  test('offers the credentials with the pre-authorized code flow', () => {
    expect(
      buildOpenIdCredentialOffer({ id: 'issuer-1', credentials: [] }),
    ).toEqual({
      publicIssuerId: 'issuer-1',
      preAuthorizedCodeFlowConfig: {},
      credentials: [],
    });
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Openid4CredentialFormat } from '@/entities/Schema/model/types/schema';

import {
  buildSdJwtPresentationRequest,
  buildJwtJsonPresentationRequest,
  buildMsoMdocPresentationRequest,
  buildOpenIdPresentationRequest,
  BuildOpenIdPresentationRequestParams,
} from './presentation-request';

const baseParams: BuildOpenIdPresentationRequestParams = {
  format: Openid4CredentialFormat.SdJwt,
  id: 'verifier-1',
  did: 'did:key:z6Mk123',
  name: 'TestSchema',
  attributes: ['age', 'name'],
};

describe('buildSdJwtPresentationRequest', () => {
  it('builds a signed PEX request for sd-jwt (no DC API fields)', () => {
    const req = buildSdJwtPresentationRequest(baseParams);

    expect(req.publicVerifierId).toBe('verifier-1');
    expect(req.requestSigner).toEqual({
      method: 'did',
      did: 'did:key:z6Mk123',
    });
    expect(
      req.presentationExchange.definition.input_descriptors[0].constraints
        .fields,
    ).toEqual([{ path: ['$.age'] }, { path: ['$.name'] }]);
    expect((req as any).responseMode).toBeUndefined();
    expect((req as any).dcql).toBeUndefined();
    expect((req as any).version).toBeUndefined();
  });
});

describe('buildJwtJsonPresentationRequest', () => {
  it('builds a signed PEX request for jwt-vc-json (no DC API fields)', () => {
    const req = buildJwtJsonPresentationRequest(baseParams);

    expect(req.publicVerifierId).toBe('verifier-1');
    const descriptor = req.presentationExchange.definition.input_descriptors[0];
    expect(descriptor.constraints.fields[0].path).toEqual([
      '$.vc.type.*',
      '$.vct',
      '$.type',
    ]);
    expect((req as any).responseMode).toBeUndefined();
  });
});

describe('buildMsoMdocPresentationRequest', () => {
  it('builds a signed PEX request for mso_mdoc with default doctype/namespace', () => {
    const req = buildMsoMdocPresentationRequest(baseParams);
    const descriptor = req.presentationExchange.definition.input_descriptors[0];

    expect(descriptor.id).toBe('org.iso.18013.5.1.mDL');
    expect(descriptor.format?.mso_mdoc).toBeDefined();
    expect(descriptor.constraints.fields).toEqual([
      { path: ["$['org.iso.18013.5.1']['age']"], intent_to_retain: false },
      { path: ["$['org.iso.18013.5.1']['name']"], intent_to_retain: false },
    ]);
    expect((req as any).responseMode).toBeUndefined();
  });

  it('uses custom doctype and namespace', () => {
    const req = buildMsoMdocPresentationRequest({
      ...baseParams,
      doctype: 'custom.doctype',
      namespace: 'custom.ns',
    });
    const descriptor = req.presentationExchange.definition.input_descriptors[0];

    expect(descriptor.id).toBe('custom.doctype');
    expect(descriptor.constraints.fields[0].path).toEqual([
      "$['custom.ns']['age']",
    ]);
  });
});

describe('buildOpenIdPresentationRequest — PEX dispatch', () => {
  it('dispatches to sdJwt builder', () => {
    const req: any = buildOpenIdPresentationRequest({
      ...baseParams,
      format: Openid4CredentialFormat.SdJwt,
    });
    expect(
      req.presentationExchange.definition.input_descriptors[0].constraints
        .fields[0].path,
    ).toEqual(['$.age']);
  });

  it('dispatches to jwtJson builder for JwtJson format', () => {
    const req: any = buildOpenIdPresentationRequest({
      ...baseParams,
      format: Openid4CredentialFormat.JwtJson,
    });
    const field =
      req.presentationExchange.definition.input_descriptors[0].constraints
        .fields[0];
    expect(field.path).toEqual(['$.vc.type.*', '$.vct', '$.type']);
  });

  it('dispatches to msoMdoc builder for MsoMdoc format', () => {
    const req: any = buildOpenIdPresentationRequest({
      ...baseParams,
      format: Openid4CredentialFormat.MsoMdoc,
    });
    expect(req.presentationExchange.definition.input_descriptors[0].id).toBe(
      'org.iso.18013.5.1.mDL',
    );
  });
});

describe('buildOpenIdPresentationRequest — DC API (DCQL)', () => {
  it('builds a signed DCQL request for mso_mdoc (DID signer, no PEX)', () => {
    const req: any = buildOpenIdPresentationRequest({
      ...baseParams,
      format: Openid4CredentialFormat.MsoMdoc,
      useDcApi: true,
    });

    expect(req.responseMode).toBe('dc_api');
    expect(req.version).toBe('v1');
    // DC API is signed with the verifier DID (a JAR — required by the wallet matcher) and must not
    // carry Presentation Exchange.
    expect(req.requestSigner).toEqual({
      method: 'did',
      did: 'did:key:z6Mk123',
    });
    expect(req.presentationExchange).toBeUndefined();
    // expectedOrigins is only present when the caller passes it (see the dedicated test below).
    expect(req.expectedOrigins).toBeUndefined();

    expect(req.dcql.query.credentials).toEqual([
      {
        id: 'requested-credential',
        format: 'mso_mdoc',
        meta: { doctype_value: 'org.iso.18013.5.1.mDL' },
        claims: [
          { path: ['org.iso.18013.5.1', 'age'], intent_to_retain: false },
          { path: ['org.iso.18013.5.1', 'name'], intent_to_retain: false },
        ],
      },
    ]);
  });

  it('honours custom doctype/namespace in the DCQL mdoc query', () => {
    const req: any = buildOpenIdPresentationRequest({
      ...baseParams,
      format: Openid4CredentialFormat.MsoMdoc,
      doctype: 'custom.doctype',
      namespace: 'custom.ns',
      useDcApi: true,
    });

    const credential = req.dcql.query.credentials[0];
    expect(credential.meta.doctype_value).toBe('custom.doctype');
    expect(credential.claims[0].path).toEqual(['custom.ns', 'age']);
  });

  it('builds a signed DCQL request for SD-JWT VC under the dc+sd-jwt type id (claims only, no vct filter)', () => {
    const req: any = buildOpenIdPresentationRequest({
      ...baseParams,
      format: Openid4CredentialFormat.SdJwt,
      useDcApi: true,
    });

    expect(req.responseMode).toBe('dc_api');
    expect(req.presentationExchange).toBeUndefined();
    // The DC API matches SD-JWT VCs under `dc+sd-jwt` (what Credo signs and wallets register),
    // not the legacy `vc+sd-jwt` used for issuance offers.
    expect(req.dcql.query.credentials).toEqual([
      {
        id: 'requested-credential',
        format: 'dc+sd-jwt',
        claims: [{ path: ['age'] }, { path: ['name'] }],
      },
    ]);
  });

  it('throws for formats not expressible in DCQL (e.g. jwt_vc_json)', () => {
    expect(() =>
      buildOpenIdPresentationRequest({
        ...baseParams,
        format: Openid4CredentialFormat.JwtJson,
        useDcApi: true,
      }),
    ).toThrow(/only mso_mdoc and SD-JWT VC/);
  });

  it('embeds expectedOrigins when provided (signed-request origin binding)', () => {
    const req: any = buildOpenIdPresentationRequest({
      ...baseParams,
      format: Openid4CredentialFormat.MsoMdoc,
      useDcApi: true,
      expectedOrigins: ['https://verifier.example.com'],
    });

    expect(req.requestSigner).toEqual({
      method: 'did',
      did: 'did:key:z6Mk123',
    });
    expect(req.expectedOrigins).toEqual(['https://verifier.example.com']);
  });
});

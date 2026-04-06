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
  it('builds a PEX request for sd-jwt without DC API fields', () => {
    const req = buildSdJwtPresentationRequest(baseParams);

    expect(req.publicVerifierId).toBe('verifier-1');
    expect(req.requestSigner).toEqual({ method: 'did', did: 'did:key:z6Mk123' });
    expect(req.presentationExchange.definition.input_descriptors[0].constraints.fields).toEqual([
      { path: ['$.age'] },
      { path: ['$.name'] },
    ]);
    expect((req as any).responseMode).toBeUndefined();
    expect((req as any).expectedOrigins).toBeUndefined();
    expect((req as any).version).toBeUndefined();
  });

  it('adds dc_api fields when useDcApi is true', () => {
    const req = buildSdJwtPresentationRequest({ ...baseParams, useDcApi: true });

    expect((req as any).responseMode).toBe('dc_api');
    expect((req as any).expectedOrigins).toEqual([window.location.origin]);
    expect((req as any).version).toBe('v1');
  });
});

describe('buildJwtJsonPresentationRequest', () => {
  it('builds a PEX request for jwt-vc-json without DC API fields', () => {
    const req = buildJwtJsonPresentationRequest(baseParams);

    expect(req.publicVerifierId).toBe('verifier-1');
    const descriptor = req.presentationExchange.definition.input_descriptors[0];
    expect(descriptor.constraints.fields[0].path).toEqual(['$.vc.type.*', '$.vct', '$.type']);
    expect((req as any).responseMode).toBeUndefined();
  });

  it('adds dc_api fields when useDcApi is true', () => {
    const req = buildJwtJsonPresentationRequest({ ...baseParams, useDcApi: true });

    expect((req as any).responseMode).toBe('dc_api');
    expect((req as any).expectedOrigins).toEqual([window.location.origin]);
    expect((req as any).version).toBe('v1');
  });
});

describe('buildMsoMdocPresentationRequest', () => {
  it('builds a PEX request for mso_mdoc with default doctype/namespace', () => {
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
    expect(descriptor.constraints.fields[0].path).toEqual(["$['custom.ns']['age']"]);
  });

  it('adds dc_api fields when useDcApi is true', () => {
    const req = buildMsoMdocPresentationRequest({ ...baseParams, useDcApi: true });

    expect((req as any).responseMode).toBe('dc_api');
    expect((req as any).expectedOrigins).toEqual([window.location.origin]);
    expect((req as any).version).toBe('v1');
  });
});

describe('buildOpenIdPresentationRequest', () => {
  it('dispatches to sdJwt builder', () => {
    const req = buildOpenIdPresentationRequest({ ...baseParams, format: Openid4CredentialFormat.SdJwt });
    expect(req.presentationExchange.definition.input_descriptors[0].constraints.fields[0].path).toEqual(['$.age']);
  });

  it('dispatches to jwtJson builder for JwtJson format', () => {
    const req = buildOpenIdPresentationRequest({ ...baseParams, format: Openid4CredentialFormat.JwtJson });
    const field = req.presentationExchange.definition.input_descriptors[0].constraints.fields[0];
    expect(field.path).toEqual(['$.vc.type.*', '$.vct', '$.type']);
  });

  it('dispatches to msoMdoc builder for MsoMdoc format', () => {
    const req = buildOpenIdPresentationRequest({ ...baseParams, format: Openid4CredentialFormat.MsoMdoc });
    expect(req.presentationExchange.definition.input_descriptors[0].id).toBe('org.iso.18013.5.1.mDL');
  });

  it('passes useDcApi through to the underlying builder', () => {
    const req = buildOpenIdPresentationRequest({ ...baseParams, format: Openid4CredentialFormat.SdJwt, useDcApi: true });
    expect((req as any).responseMode).toBe('dc_api');
  });
});

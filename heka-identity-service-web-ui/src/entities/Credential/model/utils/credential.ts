import { credentialsContext } from '@/const/credentials';
import { OpenIdCredential } from '@/entities/Credential/model/types/credential';
import { Openid4CredentialFormat } from '@/entities/Schema/model/types/schema';

const buildIssuer = (did: string) => ({
  did,
  method: 'did',
});

export interface BuildOpenIdCredentialOfferParams {
  id: string;
  credentials: Array<OpenIdCredential>;
}

export const buildOpenIdCredentialOffer = ({
  id,
  credentials,
}: BuildOpenIdCredentialOfferParams) => ({
  publicIssuerId: id,
  preAuthorizedCodeFlowConfig: {},
  credentials,
});

export interface BuildSdJwtCredentialParams {
  did: string;
  credentialSupportedId: string;
  credentialValues: Record<string, unknown>;
}

export const buildSdJwtCredential = ({
  did,
  credentialSupportedId,
  credentialValues,
}: BuildSdJwtCredentialParams) => ({
  credentialSupportedId,
  format: Openid4CredentialFormat.SdJwt,
  issuer: buildIssuer(did),
  payload: credentialValues,
  disclosureFrame: {
    _sd: Object.keys(credentialValues),
  },
});

export interface BuildJwtJsonCredentialParams {
  did: string;
  credentialSupportedId: string;
  credentialValues: Record<string, unknown>;
}

export const buildJwtJsonCredential = ({
  did,
  credentialSupportedId,
  credentialValues,
}: BuildJwtJsonCredentialParams) => ({
  credentialSupportedId,
  format: Openid4CredentialFormat.JwtJson,
  issuer: buildIssuer(did),
  credentialSubject: credentialValues,
});

export interface BuildJwtJsonLdCredentialParams {
  did: string;
  credentialSupportedId: string;
  credentialValues: Record<string, unknown>;
  context?: Array<string>;
}

export const buildJwtJsonLdCredential = ({
  did,
  credentialSupportedId,
  credentialValues,
  context,
}: BuildJwtJsonLdCredentialParams) => ({
  credentialSupportedId,
  '@context': context ?? [credentialsContext],
  format: Openid4CredentialFormat.JwtJsonLd,
  issuer: buildIssuer(did),
  credentialSubject: credentialValues,
});

export interface BuildLdpVcCredentialParams {
  did: string;
  credentialSupportedId: string;
  credentialValues: Record<string, unknown>;
  context?: Array<string>;
}

export const buildLdpVcCredential = ({
  did,
  credentialSupportedId,
  credentialValues,
  context,
}: BuildLdpVcCredentialParams) => ({
  credentialSupportedId,
  '@context': context ?? [credentialsContext],
  format: Openid4CredentialFormat.LdpVc,
  issuer: buildIssuer(did),
  credentialSubject: credentialValues,
});

export interface BuildMsoMdocCredentialParams {
  credentialSupportedId: string;
  credentialValues: Record<string, unknown>;
  namespace?: string;
}

export const buildMsoMdocCredential = ({
  credentialSupportedId,
  credentialValues,
  namespace = 'org.iso.18013.5.1',
}: BuildMsoMdocCredentialParams) => ({
  credentialSupportedId,
  format: Openid4CredentialFormat.MsoMdoc,
  namespaces: { [namespace]: credentialValues },
});

export interface BuildCredentialParams {
  format: Openid4CredentialFormat;
  did: string;
  credentialSupportedId: string;
  credentialValues: Record<string, string>;
  context?: Array<string>;
  namespace?: string;
}

export const buildCredential = (params: BuildCredentialParams): OpenIdCredential => {
  switch (params.format) {
    case Openid4CredentialFormat.SdJwt:
      return buildSdJwtCredential(params);
    case Openid4CredentialFormat.JwtJson:
      return buildJwtJsonCredential(params);
    case Openid4CredentialFormat.JwtJsonLd:
      return buildJwtJsonLdCredential(params);
    case Openid4CredentialFormat.LdpVc:
      return buildLdpVcCredential(params);
    case Openid4CredentialFormat.MsoMdoc:
      return buildMsoMdocCredential(params);
  }
};

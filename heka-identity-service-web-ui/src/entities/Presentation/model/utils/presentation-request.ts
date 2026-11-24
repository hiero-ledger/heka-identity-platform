import { v4 } from 'uuid';

import {
  AriesCredentialFormat,
  AriesCredentialRegistrationFormat,
  AriesSchemaRegistration,
  Openid4CredentialFormat,
  ProtocolType,
  Schema,
  SchemaRegistration,
} from '@/entities/Schema/model/types/schema';

export interface BuildOpenIdPresentationRequestParams {
  format: Openid4CredentialFormat;
  id: string;
  did: string;
  name: string;
  attributes: Array<string>;
  purpose?: string;
  /** doctype for mso_mdoc credentials (e.g. 'org.iso.18013.5.1.mDL') */
  doctype?: string;
  /** namespace for mso_mdoc claim paths (e.g. 'org.iso.18013.5.1') */
  namespace?: string;
  /** When true, builds a signed `dc_api` request for the W3C Digital Credentials API flow */
  useDcApi?: boolean;
  /** Origins (typically `[window.location.origin]`) bound into a signed `dc_api` request */
  expectedOrigins?: Array<string>;
}

// Non-DC-API ("direct_post") requests are signed with the verifier's DID.
// The DC API flow is built separately (see buildDcApiPresentationRequest) — it is also
// signed with the verifier's DID (a JAR, required by the wallet matcher) but MUST use DCQL, not PEX.

export const buildSdJwtPresentationRequest = (
  params: BuildOpenIdPresentationRequestParams,
) => {
  return {
    publicVerifierId: params.id,
    requestSigner: { method: 'did', did: params.did },
    dcql: {
      query: buildDcqlQuery({
        ...params,
        format: Openid4CredentialFormat.SdJwt,
      }),
    },
  };
};

export const buildJwtJsonPresentationRequest = ({
  id,
  did,
  name,
  purpose,
}: BuildOpenIdPresentationRequestParams) => {
  return {
    publicVerifierId: id,
    requestSigner: { method: 'did', did },
    presentationExchange: {
      definition: {
        id: v4(),
        name,
        input_descriptors: [
          {
            id: v4(),
            constraints: {
              fields: [
                {
                  path: ['$.vc.type.*', '$.vct', '$.type'],
                  filter: {
                    type: 'string',
                    pattern: name,
                  },
                },
              ],
            },
            name,
            purpose: purpose ?? 'To obtain credential data',
          },
        ],
      },
    },
  };
};

const MDL_DOCTYPE = 'org.iso.18013.5.1.mDL';
const MDL_NAMESPACE = 'org.iso.18013.5.1';

export const buildMsoMdocPresentationRequest = (
  params: BuildOpenIdPresentationRequestParams,
) => {
  return {
    publicVerifierId: params.id,
    requestSigner: { method: 'did', did: params.did },
    dcql: {
      query: buildDcqlQuery({
        ...params,
        format: Openid4CredentialFormat.MsoMdoc,
      }),
    },
  };
};

const DCQL_CREDENTIAL_ID = 'requested-credential';

const DCQL_SD_JWT_FORMAT = 'dc+sd-jwt' as const;

const buildDcqlQuery = ({
  format,
  attributes,
  doctype = MDL_DOCTYPE,
  namespace = MDL_NAMESPACE,
}: BuildOpenIdPresentationRequestParams) => {
  switch (format) {
    case Openid4CredentialFormat.MsoMdoc:
      return {
        credentials: [
          {
            id: DCQL_CREDENTIAL_ID,
            format: Openid4CredentialFormat.MsoMdoc,
            meta: { doctype_value: doctype },
            claims: attributes.map((attribute) => ({
              path: [namespace, attribute],
              intent_to_retain: false,
            })),
          },
        ],
      };
    case Openid4CredentialFormat.SdJwt:
      return {
        credentials: [
          {
            id: DCQL_CREDENTIAL_ID,
            format: DCQL_SD_JWT_FORMAT,
            // No `meta.vct_values`: SD-JWT VCs are matched on the requested claims alone, as the
            // earlier Presentation Exchange request did. Add vct_values here to restrict by type.
            claims: attributes.map((attribute) => ({ path: [attribute] })),
          },
        ],
      };
    default:
      throw new Error(
        `The Digital Credentials API flow supports only mso_mdoc and SD-JWT VC credentials (received "${format}")`,
      );
  }
};

const buildDcApiPresentationRequest = (
  params: BuildOpenIdPresentationRequestParams,
) => ({
  publicVerifierId: params.id,
  requestSigner: { method: 'did' as const, did: params.did },
  dcql: { query: buildDcqlQuery(params) },
  responseMode: 'dc_api' as const,
  version: 'v1' as const,
  ...(params.expectedOrigins?.length
    ? { expectedOrigins: params.expectedOrigins }
    : {}),
});

export const buildOpenIdPresentationRequest = (
  params: BuildOpenIdPresentationRequestParams,
) => {
  if (params.useDcApi) {
    return buildDcApiPresentationRequest(params);
  }

  switch (params.format) {
    case Openid4CredentialFormat.SdJwt:
      return buildSdJwtPresentationRequest(params);
    case Openid4CredentialFormat.JwtJson:
    case Openid4CredentialFormat.JwtJsonLd:
    case Openid4CredentialFormat.LdpVc:
      return buildJwtJsonPresentationRequest(params);
    case Openid4CredentialFormat.MsoMdoc:
      return buildMsoMdocPresentationRequest(params);
  }
};

export interface BuildAriesPresentationRequestParams {
  format: AriesCredentialFormat;
  connectionId?: string;
  attributes?: Array<string>;
  schema?: Schema;
}

export const buildAnoncredsIndyPresentationRequest = ({
  connectionId,
  attributes,
  schema,
}: BuildAriesPresentationRequestParams) => {
  const registration = schema?.registrations?.find(
    (reg: SchemaRegistration) => {
      return (
        reg.protocol === ProtocolType.Aries &&
        reg.credentialFormat === AriesCredentialRegistrationFormat.Anoncreds
      );
    },
  );

  if (schema && !registration) {
    throw new Error(`Schema ${schema?.id} is not registered`);
  }

  return {
    connectionId,
    comment: schema?.name ?? 'Presentation Request',
    request: {
      format: AriesCredentialFormat.AnoncredsIndy,
      name: schema?.name ?? 'Presentation Request',
      proofParams: {
        attributes: attributes?.map((attribute) => ({
          name: attribute,
          credentialDefinitionId: registration
            ? (registration.credentials as AriesSchemaRegistration)
                .credentialDefinitionId
            : undefined,
        })),
      },
    },
    requestNonRevokedProof: true,
  };
};

export const buildAnoncredsW3cPresentationRequest = ({
  connectionId,
  attributes,
  schema,
}: BuildAriesPresentationRequestParams) => {
  return {
    connectionId,
    comment: schema?.name ?? 'Presentation Request',
    request: {
      format: 'dif-presentation-exchange',
      presentationExchange: {
        id: v4(),
        name: schema?.name ?? 'Presentation Request',
        purpose: schema?.name,
        input_descriptors: [
          {
            id: v4(),
            name: schema?.name ?? 'Presentation Request',
            schema: [
              {
                uri: 'https://www.w3.org/2018/credentials/v1',
              },
            ],
            constraints: {
              limit_disclosure: 'required',
              // Credo builds (holder) and checks (verifier) a non-revocation proof for Data Integrity
              // AnonCreds credentials only when `statuses.active.directive` is `required` or `allowed`.
              // The counterpart of `requestNonRevokedProof` in the anoncreds-indy request.
              statuses: { active: { directive: 'required' } },
              fields: attributes?.map((attribute) => ({
                path: [`$.credentialSubject.${attribute}`],
              })),
            },
          },
        ],
      },
    },
  };
};

export const buildAriesPresentationRequest = (
  params: BuildAriesPresentationRequestParams,
) => {
  switch (params.format) {
    case AriesCredentialFormat.AnoncredsIndy:
      return buildAnoncredsIndyPresentationRequest(params);
    case AriesCredentialFormat.AnoncredsW3c:
      return buildAnoncredsW3cPresentationRequest(params);
  }
};

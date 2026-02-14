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
}

export const buildSdJwtPresentationRequest = ({
  id,
  did,
  name,
  attributes,
  purpose,
}: BuildOpenIdPresentationRequestParams) => {
  return {
    publicVerifierId: id,
    requestSigner: {
      method: 'did',
      did: did,
    },
    presentationExchange: {
      definition: {
        id: v4(),
        name,
        input_descriptors: [
          {
            id: v4(),
            constraints: {
              limit_disclosure: 'required',
              fields: attributes.map((attribute) => ({
                path: [`$.${attribute}`],
              })),
            },
            name,
            purpose: purpose ?? 'To obtain credential data',
          },
        ],
      },
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
    requestSigner: {
      method: 'did',
      did: did,
    },
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

export const buildOpenIdPresentationRequest = (
  params: BuildOpenIdPresentationRequestParams,
) => {
  switch (params.format) {
    case Openid4CredentialFormat.SdJwt:
      return buildSdJwtPresentationRequest(params);
    case Openid4CredentialFormat.JwtJson:
    case Openid4CredentialFormat.JwtJsonLd:
    case Openid4CredentialFormat.LdpVc:
      return buildJwtJsonPresentationRequest(params);
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

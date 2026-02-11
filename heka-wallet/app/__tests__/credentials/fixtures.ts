import { DifPexCredentialsForRequest } from '@credo-ts/core'
import { OpenId4VciResolvedCredentialOffer, OpenId4VcSiopVerifiedAuthorizationRequest } from '@credo-ts/openid4vc'

export const dsrAgencySdJwtVc = {
  credentialOfferUrl:
    'openid-credential-offer://?credential_offer_uri=https%3A%2F%2F70ff-195-98-90-134.ngrok-free.app%2FopenId%2Foid4vci%2Fdid%3Akey%3Az6MkooobRCrvQ1N2fYFNVmvTUCVZhreUqXp69TPLjk7nNgae%2Foffers%2F48cacb0f-1c9a-4340-91d7-85649db26766',
  resolvedCredentialOfferPreAuth: {
    metadata: {
      issuer:
        'https://70ff-195-98-90-134.ngrok-free.app/openId/oid4vci/did:key:z6MkooobRCrvQ1N2fYFNVmvTUCVZhreUqXp69TPLjk7nNgae',
      token_endpoint:
        'https://70ff-195-98-90-134.ngrok-free.app/openId/oid4vci/did:key:z6MkooobRCrvQ1N2fYFNVmvTUCVZhreUqXp69TPLjk7nNgae/token',
      credential_endpoint:
        'https://70ff-195-98-90-134.ngrok-free.app/openId/oid4vci/did:key:z6MkooobRCrvQ1N2fYFNVmvTUCVZhreUqXp69TPLjk7nNgae/credential',
      authorization_server:
        'https://70ff-195-98-90-134.ngrok-free.app/openId/oid4vci/did:key:z6MkooobRCrvQ1N2fYFNVmvTUCVZhreUqXp69TPLjk7nNgae',
      authorizationServerType: 'OID4VCI',
      credentialIssuerMetadata: {
        credential_issuer:
          'https://70ff-195-98-90-134.ngrok-free.app/openId/oid4vci/did:key:z6MkooobRCrvQ1N2fYFNVmvTUCVZhreUqXp69TPLjk7nNgae',
        token_endpoint:
          'https://70ff-195-98-90-134.ngrok-free.app/openId/oid4vci/did:key:z6MkooobRCrvQ1N2fYFNVmvTUCVZhreUqXp69TPLjk7nNgae/token',
        credential_endpoint:
          'https://70ff-195-98-90-134.ngrok-free.app/openId/oid4vci/did:key:z6MkooobRCrvQ1N2fYFNVmvTUCVZhreUqXp69TPLjk7nNgae/credential',
        credentials_supported: [
          {
            id: '635ba519cd19764e84ea67dd',
            format: 'vc+sd-jwt',
            vct: 'empl:pda1',
          },
        ],
      },
    },
    offeredCredentials: [
      {
        id: 'mock-id-1',
        format: 'vc+sd-jwt',
        vct: 'empl:pda1',
      },
      {
        id: 'mock-id-2',
        format: 'vc+sd-jwt',
        vct: 'empl:pda2',
      },
    ],
    offeredCredentialConfigurations: {
      'mock-id-1': {
        proof_types_supported: {
          jwt: {
            proof_signing_alg_values_supported: ['EdDSA', 'ES256', 'ES256K'],
          },
        },
        format: 'vc+sd-jwt',
        vct: 'empl:pda1',
      },
      'mock-id-2': {
        proof_types_supported: {
          jwt: {
            proof_signing_alg_values_supported: ['EdDSA', 'ES256', 'ES256K'],
          },
        },
        format: 'vc+sd-jwt',
        vct: 'empl:pda2',
      },
    },
    credentialOfferPayload: {
      grants: {
        'urn:ietf:params:oauth:grantType:preAuthorized_code': {
          preAuthorized_code: '327011121841989042267220',
          user_pin_required: false,
        },
      },
      credentials: ['635ba519cd19764e84ea67dd'],
      credential_issuer:
        'https://70ff-195-98-90-134.ngrok-free.app/openId/oid4vci/did:key:z6MkooobRCrvQ1N2fYFNVmvTUCVZhreUqXp69TPLjk7nNgae',
    },
    credentialOfferRequestWithBaseUrl: {
      scheme: 'openid-credential-offer',
      baseUrl: 'openid-credential-offer://',
      credential_offer: {
        grants: {
          'urn:ietf:params:oauth:grantType:preAuthorized_code': {
            preAuthorized_code: '327011121841989042267220',
            user_pin_required: false,
          },
        },
        credentials: ['635ba519cd19764e84ea67dd'],
        credential_issuer:
          'https://70ff-195-98-90-134.ngrok-free.app/openId/oid4vci/did:key:z6MkooobRCrvQ1N2fYFNVmvTUCVZhreUqXp69TPLjk7nNgae',
      },
      original_credential_offer: {
        grants: {
          'urn:ietf:params:oauth:grantType:preAuthorized_code': {
            preAuthorized_code: '327011121841989042267220',
            user_pin_required: false,
          },
        },
        credentials: ['635ba519cd19764e84ea67dd'],
        credential_issuer:
          'https://70ff-195-98-90-134.ngrok-free.app/openId/oid4vci/did:key:z6MkooobRCrvQ1N2fYFNVmvTUCVZhreUqXp69TPLjk7nNgae',
      },
      credential_offer_uri:
        'https://70ff-195-98-90-134.ngrok-free.app/openId/oid4vci/did:key:z6MkooobRCrvQ1N2fYFNVmvTUCVZhreUqXp69TPLjk7nNgae/offers/2411df18-9a44-448f-8380-48cc33aa47e1',
      supportedFlows: ['Pre-Authorized Code Flow'],
      version: 1011,
      preAuthorizedCode: '327011121841989042267220',
      userPinRequired: false,
    },
    version: 1011,
  } as OpenId4VciResolvedCredentialOffer,
  resolvedCredentialOfferAuthorizationCode: {
    metadata: {
      issuer: 'https://api-conformance.ebsi.eu/conformance/v3/issuer-mock',
      token_endpoint: 'https://api-conformance.ebsi.eu/conformance/v3/auth-mock/token',
      credential_endpoint: 'https://api-conformance.ebsi.eu/conformance/v3/issuer-mock/credential',
      deferred_credential_endpoint: 'https://api-conformance.ebsi.eu/conformance/v3/issuer-mock/credential_deferred',
      authorization_server: 'https://api-conformance.ebsi.eu/conformance/v3/auth-mock',
      authorization_endpoint: 'https://api-conformance.ebsi.eu/conformance/v3/auth-mock/authorize',
      authorizationServerType: 'OIDC',
      credentialIssuerMetadata: {
        credential_issuer: 'https://api-conformance.ebsi.eu/conformance/v3/issuer-mock',
        authorization_server: 'https://api-conformance.ebsi.eu/conformance/v3/auth-mock',
        credential_endpoint: 'https://api-conformance.ebsi.eu/conformance/v3/issuer-mock/credential',
        deferred_credential_endpoint: 'https://api-conformance.ebsi.eu/conformance/v3/issuer-mock/credential_deferred',
        credentials_supported: [
          {
            format: 'jwt_vc',
            types: ['VerifiableCredential', 'VerifiableAttestation', 'CTWalletCrossAuthorisedDeferred'],
            trust_framework: {
              name: 'ebsi',
              type: 'Accreditation',
              uri: 'TIR link towards accreditation',
            },
            display: [
              {
                name: 'CTWalletCrossAuthorisedDeferred Verifiable Credential',
                locale: 'en-GB',
              },
            ],
          },
          {
            format: 'jwt_vc_json',
            types: ['VerifiableCredential', 'VerifiableAttestation', 'CTWalletCrossAuthorisedInTime'],
            trust_framework: {
              name: 'ebsi',
              type: 'Accreditation',
              uri: 'TIR link towards accreditation',
            },
            display: [
              {
                name: 'CTWalletCrossAuthorisedInTime Verifiable Credential',
                locale: 'en-GB',
              },
            ],
          },
          {
            format: 'jwt_vc_json',
            types: ['VerifiableCredential', 'VerifiableAttestation', 'CTWalletSameAuthorisedInTime'],
            trust_framework: {
              name: 'ebsi',
              type: 'Accreditation',
              uri: 'TIR link towards accreditation',
            },
            display: [
              {
                name: 'CTWalletSameAuthorisedInTime Verifiable Credential',
                locale: 'en-GB',
              },
            ],
          },
          {
            format: 'jwt_vc_json',
            types: ['VerifiableCredential', 'VerifiableAttestation', 'CTWalletCrossPreAuthorisedInTime'],
            trust_framework: {
              name: 'ebsi',
              type: 'Accreditation',
              uri: 'TIR link towards accreditation',
            },
            display: [
              {
                name: 'CTWalletCrossPreAuthorisedInTime Verifiable Credential',
                locale: 'en-GB',
              },
            ],
          },
        ],
      },
      authorizationServerMetadata: {
        redirect_uris: ['https://api-conformance.ebsi.eu/conformance/v3/auth-mock/direct_post'],
        issuer: 'https://api-conformance.ebsi.eu/conformance/v3/auth-mock',
        authorization_endpoint: 'https://api-conformance.ebsi.eu/conformance/v3/auth-mock/authorize',
        token_endpoint: 'https://api-conformance.ebsi.eu/conformance/v3/auth-mock/token',
        jwks_uri: 'https://api-conformance.ebsi.eu/conformance/v3/auth-mock/jwks',
        scopes_supported: ['openid'],
        response_types_supported: ['code', 'vp_token', 'id_token'],
        response_modes_supported: ['query'],
        grant_types_supported: ['authorization_code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['ES256'],
        request_object_signing_alg_values_supported: ['ES256'],
        request_parameter_supported: true,
        request_uri_parameter_supported: true,
        token_endpoint_auth_methods_supported: ['private_key_jwt'],
        request_authentication_methods_supported: {
          authorization_endpoint: ['request_object'],
        },
        vp_formats_supported: {
          jwt_vp: {
            alg_values_supported: ['ES256'],
          },
          jwt_vc: {
            alg_values_supported: ['ES256'],
          },
          jwt_vp_json: {
            alg_values_supported: ['ES256'],
          },
          jwt_vc_json: {
            alg_values_supported: ['ES256'],
          },
        },
        subject_syntax_types_supported: ['did:key', 'did:ebsi'],
        subject_syntax_types_discriminations: ['did:key:jwk_jcs-pub', 'did:ebsi:v1'],
        subject_trust_frameworks_supported: ['ebsi'],
        id_token_types_supported: ['subject_signed_id_token', 'attester_signed_id_token'],
      },
    },
    offeredCredentials: [
      {
        id: '4cc81f2e-e04d-4f28-b071-780ecd92ab00',
        format: 'jwt_vc_json',
        types: ['VerifiableCredential', 'VerifiableAttestation', 'CTWalletCrossAuthorisedInTime'],
        trust_framework: {
          name: 'ebsi',
          type: 'Accreditation',
          uri: 'TIR link towards accreditation',
        },
      },
    ],
    offeredCredentialConfigurations: {
      '4cc81f2eE04d-4f28B071-780ecd92ab00': {
        proof_types_supported: {
          jwt: {
            proof_signing_alg_values_supported: ['EdDSA', 'ES256', 'ES256K'],
          },
        },
        display: [
          {
            name: 'CTWalletCrossAuthorisedInTime Verifiable Credential',
            locale: 'en-GB',
          },
        ],
        format: 'jwt_vc_json',
        credential_definition: {
          type: ['VerifiableCredential', 'VerifiableAttestation', 'CTWalletCrossAuthorisedInTime'],
        },
      },
    },
    credentialOfferPayload: {
      credential_issuer: 'https://api-conformance.ebsi.eu/conformance/v3/issuer-mock',
      credentials: [
        {
          format: 'jwt_vc_json',
          types: ['VerifiableCredential', 'VerifiableAttestation', 'CTWalletCrossAuthorisedInTime'],
          trust_framework: {
            name: 'ebsi',
            type: 'Accreditation',
            uri: 'TIR link towards accreditation',
          },
        },
      ],
      grants: {
        authorization_code: {
          issuer_state:
            'eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiIsImtpZCI6ImRpZDplYnNpOnpqSFpqSjRTeTdyOTJCeFh6RkdzN3FEI1Q2aVBNVy1rOE80dXdaaWQyOUd3TGUtTmpnNDBFNmpOVDdoZExwSjNaU2cifQ.eyJpYXQiOjE3MjY0OTQ5MDQsImV4cCI6MTcyNjQ5NTIwNCwiY2xpZW50X2lkIjoiZGlkOmtleTp6MmRtekQ4MWNnUHg4VmtpN0pidXVNbUZZcldQZ1lveXR5a1VaM2V5cWh0MWo5S2JzaEtMSnFnQ2h0YVpzZEpvSFVSaGNIdlY2eFVISHNhNThyakJxMnpKOUNFb29nelg1d1g4VjlGNHZxS2NuWHQ0bm5iQ25rbkJ5SEh4VVp3eE5mNlA3Y1ZzRk1TMkNKN3VaUkFuRExTMWRxV0RydVNnSkI1d2o0U2twY3plN2MyelJyIiwiY3JlZGVudGlhbF90eXBlcyI6WyJWZXJpZmlhYmxlQ3JlZGVudGlhbCIsIlZlcmlmaWFibGVBdHRlc3RhdGlvbiIsIkNUV2FsbGV0Q3Jvc3NBdXRob3Jpc2VkSW5UaW1lIl0sImlzcyI6Imh0dHBzOi8vYXBpLWNvbmZvcm1hbmNlLmVic2kuZXUvY29uZm9ybWFuY2UvdjMvaXNzdWVyLW1vY2siLCJhdWQiOiJodHRwczovL2FwaS1jb25mb3JtYW5jZS5lYnNpLmV1L2NvbmZvcm1hbmNlL3YzL2F1dGgtbW9jayIsInN1YiI6ImRpZDprZXk6ejJkbXpEODFjZ1B4OFZraTdKYnV1TW1GWXJXUGdZb3l0eWtVWjNleXFodDFqOUtic2hLTEpxZ0NodGFac2RKb0hVUmhjSHZWNnhVSEhzYTU4cmpCcTJ6SjlDRW9vZ3pYNXdYOFY5RjR2cUtjblh0NG5uYkNua25CeUhIeFVad3hOZjZQN2NWc0ZNUzJDSjd1WlJBbkRMUzFkcVdEcnVTZ0pCNXdqNFNrcGN6ZTdjMnpSciJ9.vMBX3xeTY5MV29lnWoX-hlSV20wAjSx0QPW1MWaq8nuh1uB22DxUAEDQtk4sjiLVNtNaNBgUV2doSXk3n9ambQ',
        },
      },
    },
    credentialOfferRequestWithBaseUrl: {
      scheme: 'openid-credential-offer',
      baseUrl: 'openid-credential-offer://',
      clientId:
        'did:key:z2dmzD81cgPx8Vki7JbuuMmFYrWPgYoytykUZ3eyqht1j9KbshKLJqgChtaZsdJoHURhcHvV6xUHHsa58rjBq2zJ9CEoogzX5wX8V9F4vqKcnXt4nnbCnknByHHxUZwxNf6P7cVsFMS2CJ7uZRAnDLS1dqWDruSgJB5wj4Skpcze7c2zRr',
      credential_offer: {
        credential_issuer: 'https://api-conformance.ebsi.eu/conformance/v3/issuer-mock',
        credentials: [
          {
            format: 'jwt_vc_json',
            types: ['VerifiableCredential', 'VerifiableAttestation', 'CTWalletCrossAuthorisedInTime'],
            trust_framework: {
              name: 'ebsi',
              type: 'Accreditation',
              uri: 'TIR link towards accreditation',
            },
          },
        ],
        grants: {
          authorization_code: {
            issuer_state:
              'eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiIsImtpZCI6ImRpZDplYnNpOnpqSFpqSjRTeTdyOTJCeFh6RkdzN3FEI1Q2aVBNVy1rOE80dXdaaWQyOUd3TGUtTmpnNDBFNmpOVDdoZExwSjNaU2cifQ.eyJpYXQiOjE3MjY0OTQ5MDQsImV4cCI6MTcyNjQ5NTIwNCwiY2xpZW50X2lkIjoiZGlkOmtleTp6MmRtekQ4MWNnUHg4VmtpN0pidXVNbUZZcldQZ1lveXR5a1VaM2V5cWh0MWo5S2JzaEtMSnFnQ2h0YVpzZEpvSFVSaGNIdlY2eFVISHNhNThyakJxMnpKOUNFb29nelg1d1g4VjlGNHZxS2NuWHQ0bm5iQ25rbkJ5SEh4VVp3eE5mNlA3Y1ZzRk1TMkNKN3VaUkFuRExTMWRxV0RydVNnSkI1d2o0U2twY3plN2MyelJyIiwiY3JlZGVudGlhbF90eXBlcyI6WyJWZXJpZmlhYmxlQ3JlZGVudGlhbCIsIlZlcmlmaWFibGVBdHRlc3RhdGlvbiIsIkNUV2FsbGV0Q3Jvc3NBdXRob3Jpc2VkSW5UaW1lIl0sImlzcyI6Imh0dHBzOi8vYXBpLWNvbmZvcm1hbmNlLmVic2kuZXUvY29uZm9ybWFuY2UvdjMvaXNzdWVyLW1vY2siLCJhdWQiOiJodHRwczovL2FwaS1jb25mb3JtYW5jZS5lYnNpLmV1L2NvbmZvcm1hbmNlL3YzL2F1dGgtbW9jayIsInN1YiI6ImRpZDprZXk6ejJkbXpEODFjZ1B4OFZraTdKYnV1TW1GWXJXUGdZb3l0eWtVWjNleXFodDFqOUtic2hLTEpxZ0NodGFac2RKb0hVUmhjSHZWNnhVSEhzYTU4cmpCcTJ6SjlDRW9vZ3pYNXdYOFY5RjR2cUtjblh0NG5uYkNua25CeUhIeFVad3hOZjZQN2NWc0ZNUzJDSjd1WlJBbkRMUzFkcVdEcnVTZ0pCNXdqNFNrcGN6ZTdjMnpSciJ9.vMBX3xeTY5MV29lnWoX-hlSV20wAjSx0QPW1MWaq8nuh1uB22DxUAEDQtk4sjiLVNtNaNBgUV2doSXk3n9ambQ',
          },
        },
      },
      original_credential_offer: {
        credential_issuer: 'https://api-conformance.ebsi.eu/conformance/v3/issuer-mock',
        credentials: [
          {
            format: 'jwt_vc_json',
            types: ['VerifiableCredential', 'VerifiableAttestation', 'CTWalletCrossAuthorisedInTime'],
            trust_framework: {
              name: 'ebsi',
              type: 'Accreditation',
              uri: 'TIR link towards accreditation',
            },
          },
        ],
        grants: {
          authorization_code: {
            issuer_state:
              'eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiIsImtpZCI6ImRpZDplYnNpOnpqSFpqSjRTeTdyOTJCeFh6RkdzN3FEI1Q2aVBNVy1rOE80dXdaaWQyOUd3TGUtTmpnNDBFNmpOVDdoZExwSjNaU2cifQ.eyJpYXQiOjE3MjY0OTQ5MDQsImV4cCI6MTcyNjQ5NTIwNCwiY2xpZW50X2lkIjoiZGlkOmtleTp6MmRtekQ4MWNnUHg4VmtpN0pidXVNbUZZcldQZ1lveXR5a1VaM2V5cWh0MWo5S2JzaEtMSnFnQ2h0YVpzZEpvSFVSaGNIdlY2eFVISHNhNThyakJxMnpKOUNFb29nelg1d1g4VjlGNHZxS2NuWHQ0bm5iQ25rbkJ5SEh4VVp3eE5mNlA3Y1ZzRk1TMkNKN3VaUkFuRExTMWRxV0RydVNnSkI1d2o0U2twY3plN2MyelJyIiwiY3JlZGVudGlhbF90eXBlcyI6WyJWZXJpZmlhYmxlQ3JlZGVudGlhbCIsIlZlcmlmaWFibGVBdHRlc3RhdGlvbiIsIkNUV2FsbGV0Q3Jvc3NBdXRob3Jpc2VkSW5UaW1lIl0sImlzcyI6Imh0dHBzOi8vYXBpLWNvbmZvcm1hbmNlLmVic2kuZXUvY29uZm9ybWFuY2UvdjMvaXNzdWVyLW1vY2siLCJhdWQiOiJodHRwczovL2FwaS1jb25mb3JtYW5jZS5lYnNpLmV1L2NvbmZvcm1hbmNlL3YzL2F1dGgtbW9jayIsInN1YiI6ImRpZDprZXk6ejJkbXpEODFjZ1B4OFZraTdKYnV1TW1GWXJXUGdZb3l0eWtVWjNleXFodDFqOUtic2hLTEpxZ0NodGFac2RKb0hVUmhjSHZWNnhVSEhzYTU4cmpCcTJ6SjlDRW9vZ3pYNXdYOFY5RjR2cUtjblh0NG5uYkNua25CeUhIeFVad3hOZjZQN2NWc0ZNUzJDSjd1WlJBbkRMUzFkcVdEcnVTZ0pCNXdqNFNrcGN6ZTdjMnpSciJ9.vMBX3xeTY5MV29lnWoX-hlSV20wAjSx0QPW1MWaq8nuh1uB22DxUAEDQtk4sjiLVNtNaNBgUV2doSXk3n9ambQ',
          },
        },
      },
      credential_offer_uri:
        'https://api-conformance.ebsi.eu/conformance/v3/issuer-mock/offers/0dea54e1-2075-4e4c-90c2-743d8f8f6d6f',
      supportedFlows: ['Authorization Code Flow'],
      version: 1011,
      issuerState:
        'eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiIsImtpZCI6ImRpZDplYnNpOnpqSFpqSjRTeTdyOTJCeFh6RkdzN3FEI1Q2aVBNVy1rOE80dXdaaWQyOUd3TGUtTmpnNDBFNmpOVDdoZExwSjNaU2cifQ.eyJpYXQiOjE3MjY0OTQ5MDQsImV4cCI6MTcyNjQ5NTIwNCwiY2xpZW50X2lkIjoiZGlkOmtleTp6MmRtekQ4MWNnUHg4VmtpN0pidXVNbUZZcldQZ1lveXR5a1VaM2V5cWh0MWo5S2JzaEtMSnFnQ2h0YVpzZEpvSFVSaGNIdlY2eFVISHNhNThyakJxMnpKOUNFb29nelg1d1g4VjlGNHZxS2NuWHQ0bm5iQ25rbkJ5SEh4VVp3eE5mNlA3Y1ZzRk1TMkNKN3VaUkFuRExTMWRxV0RydVNnSkI1d2o0U2twY3plN2MyelJyIiwiY3JlZGVudGlhbF90eXBlcyI6WyJWZXJpZmlhYmxlQ3JlZGVudGlhbCIsIlZlcmlmaWFibGVBdHRlc3RhdGlvbiIsIkNUV2FsbGV0Q3Jvc3NBdXRob3Jpc2VkSW5UaW1lIl0sImlzcyI6Imh0dHBzOi8vYXBpLWNvbmZvcm1hbmNlLmVic2kuZXUvY29uZm9ybWFuY2UvdjMvaXNzdWVyLW1vY2siLCJhdWQiOiJodHRwczovL2FwaS1jb25mb3JtYW5jZS5lYnNpLmV1L2NvbmZvcm1hbmNlL3YzL2F1dGgtbW9jayIsInN1YiI6ImRpZDprZXk6ejJkbXpEODFjZ1B4OFZraTdKYnV1TW1GWXJXUGdZb3l0eWtVWjNleXFodDFqOUtic2hLTEpxZ0NodGFac2RKb0hVUmhjSHZWNnhVSEhzYTU4cmpCcTJ6SjlDRW9vZ3pYNXdYOFY5RjR2cUtjblh0NG5uYkNua25CeUhIeFVad3hOZjZQN2NWc0ZNUzJDSjd1WlJBbkRMUzFkcVdEcnVTZ0pCNXdqNFNrcGN6ZTdjMnpSciJ9.vMBX3xeTY5MV29lnWoX-hlSV20wAjSx0QPW1MWaq8nuh1uB22DxUAEDQtk4sjiLVNtNaNBgUV2doSXk3n9ambQ',
      userPinRequired: false,
    },
    version: 1011,
  } as unknown as OpenId4VciResolvedCredentialOffer,
  requestCredentialsResponse: [
    {
      credential: {
        payload: {
          id: 'test',
          vct: 'empl:pda1',
          cnf: {
            kid: 'did:key:z6MkkQ28Zi3maWiZ9jgVeE4F9v7HUN3U5ZpttRnNDMeTRz4B#z6MkkQ28Zi3maWiZ9jgVeE4F9v7HUN3U5ZpttRnNDMeTRz4B',
          },
          iss: 'did:key:z6MkooobRCrvQ1N2fYFNVmvTUCVZhreUqXp69TPLjk7nNgae',
          iat: 1726502124,
          _sd: ['5PHIvMyBN_Ia08UqXe3ctX8PEJzF_5DxuYcbmmZReYM', 'sF6yW42tQ3dSY2YTe1W3-VS_4TKEZ2WSW2LS_Bi5BHQ'],
          _sd_alg: 'sha-256',
        },
        header: {
          typ: 'vc+sd-jwt',
          alg: 'EdDSA',
          kid: '#z6MkooobRCrvQ1N2fYFNVmvTUCVZhreUqXp69TPLjk7nNgae',
        },
        compact:
          'eyJ0eXAiOiJ2YytzZC1qd3QiLCJhbGciOiJFZERTQSIsImtpZCI6IiN6Nk1rb29vYlJDcnZRMU4yZllGTlZtdlRVQ1ZaaHJlVXFYcDY5VFBMams3bk5nYWUifQ.eyJpZCI6InRlc3QiLCJ2Y3QiOiJlbXBsOnBkYTEiLCJjbmYiOnsia2lkIjoiZGlkOmtleTp6Nk1ra1EyOFppM21hV2laOWpnVmVFNEY5djdIVU4zVTVacHR0Um5ORE1lVFJ6NEIjejZNa2tRMjhaaTNtYVdpWjlqZ1ZlRTRGOXY3SFVOM1U1WnB0dFJuTkRNZVRSejRCIn0sImlzcyI6ImRpZDprZXk6ejZNa29vb2JSQ3J2UTFOMmZZRk5WbXZUVUNWWmhyZVVxWHA2OVRQTGprN25OZ2FlIiwiaWF0IjoxNzI2NTAyMTI0LCJfc2QiOlsiNVBISXZNeUJOX0lhMDhVcVhlM2N0WDhQRUp6Rl81RHh1WWNibW1aUmVZTSIsInNGNnlXNDJ0UTNkU1kyWVRlMVczLVZTXzRUS0VaMldTVzJMU19CaTVCSFEiXSwiX3NkX2FsZyI6InNoYS0yNTYifQ.j0AhnGQC1psDpjbO11G0IIaIuMK6OSlYcOtbow6e27DGJmcTDtmmhhC7jh821CJJMC3PgmR8p7AiXGUL7wBXBA~WyIzOTIyNTY4NjIwNjg4NDkyNDE5NDk0MzQiLCJmaXJzdF9uYW1lIiwiSm9objEiXQ~WyI2ODMwNTg0NDE5OTQ0ODA3MzMwNDM1NzkiLCJhZ2UiLCIyNiJd~',
        prettyClaims: {
          id: 'test',
          vct: 'empl:pda1',
          cnf: {
            kid: 'did:key:z6MkkQ28Zi3maWiZ9jgVeE4F9v7HUN3U5ZpttRnNDMeTRz4B#z6MkkQ28Zi3maWiZ9jgVeE4F9v7HUN3U5ZpttRnNDMeTRz4B',
          },
          iss: 'did:key:z6MkooobRCrvQ1N2fYFNVmvTUCVZhreUqXp69TPLjk7nNgae',
          iat: 1726502124,
          age: '26',
          first_name: 'John1',
        },
      },
    },
  ],
  resolvedIssuanceAuthorizationRequest: {
    scope: [],
    redirectUri: 'openid:',
    clientId:
      'did:key:z2dmzD81cgPx8Vki7JbuuMmFYrWPgYoytykUZ3eyqht1j9KbshKLJqgChtaZsdJoHURhcHvV6xUHHsa58rjBq2zJ9CEoogzX5wX8V9F4vqKcnXt4nnbCnknByHHxUZwxNf6P7cVsFMS2CJ7uZRAnDLS1dqWDruSgJB5wj4Skpcze7c2zRr',
    codeVerifier: '594585732332256629581141844468371187764242967805',
    authorizationRequestUri:
      'https://api-conformance.ebsi.eu/conformance/v3/auth-mock/authorize?response_type=code&code_challenge_method=S256&code_challenge=Xjw8b3Ma8gyFCyNaHbR0vPhSUQK4A2oXZjhZDNp_Q-0&authorization_details=%5B%7B%22type%22%3A%22openid_credential%22%2C%22format%22%3A%22jwt_vc_json%22%2C%22types%22%3A%5B%22VerifiableCredential%22%2C%22VerifiableAttestation%22%2C%22CTWalletCrossAuthorisedInTime%22%5D%2C%22locations%22%3A%5B%22https%3A%2F%2Fapi-conformance%2Eebsi%2Eeu%2Fconformance%2Fv3%2Fauth-mock%22%2C%22https%3A%2F%2Fapi-conformance%2Eebsi%2Eeu%2Fconformance%2Fv3%2Fissuer-mock%22%5D%7D%5D&redirect_uri=openid%3A&client_id=did%3Akey%3Az2dmzD81cgPx8Vki7JbuuMmFYrWPgYoytykUZ3eyqht1j9KbshKLJqgChtaZsdJoHURhcHvV6xUHHsa58rjBq2zJ9CEoogzX5wX8V9F4vqKcnXt4nnbCnknByHHxUZwxNf6P7cVsFMS2CJ7uZRAnDLS1dqWDruSgJB5wj4Skpcze7c2zRr&issuer_state=eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiIsImtpZCI6ImRpZDplYnNpOnpqSFpqSjRTeTdyOTJCeFh6RkdzN3FEI1Q2aVBNVy1rOE80dXdaaWQyOUd3TGUtTmpnNDBFNmpOVDdoZExwSjNaU2cifQ%2EeyJpYXQiOjE3MjY0OTQ5MDQsImV4cCI6MTcyNjQ5NTIwNCwiY2xpZW50X2lkIjoiZGlkOmtleTp6MmRtekQ4MWNnUHg4VmtpN0pidXVNbUZZcldQZ1lveXR5a1VaM2V5cWh0MWo5S2JzaEtMSnFnQ2h0YVpzZEpvSFVSaGNIdlY2eFVISHNhNThyakJxMnpKOUNFb29nelg1d1g4VjlGNHZxS2NuWHQ0bm5iQ25rbkJ5SEh4VVp3eE5mNlA3Y1ZzRk1TMkNKN3VaUkFuRExTMWRxV0RydVNnSkI1d2o0U2twY3plN2MyelJyIiwiY3JlZGVudGlhbF90eXBlcyI6WyJWZXJpZmlhYmxlQ3JlZGVudGlhbCIsIlZlcmlmaWFibGVBdHRlc3RhdGlvbiIsIkNUV2FsbGV0Q3Jvc3NBdXRob3Jpc2VkSW5UaW1lIl0sImlzcyI6Imh0dHBzOi8vYXBpLWNvbmZvcm1hbmNlLmVic2kuZXUvY29uZm9ybWFuY2UvdjMvaXNzdWVyLW1vY2siLCJhdWQiOiJodHRwczovL2FwaS1jb25mb3JtYW5jZS5lYnNpLmV1L2NvbmZvcm1hbmNlL3YzL2F1dGgtbW9jayIsInN1YiI6ImRpZDprZXk6ejJkbXpEODFjZ1B4OFZraTdKYnV1TW1GWXJXUGdZb3l0eWtVWjNleXFodDFqOUtic2hLTEpxZ0NodGFac2RKb0hVUmhjSHZWNnhVSEhzYTU4cmpCcTJ6SjlDRW9vZ3pYNXdYOFY5RjR2cUtjblh0NG5uYkNua25CeUhIeFVad3hOZjZQN2NWc0ZNUzJDSjd1WlJBbkRMUzFkcVdEcnVTZ0pCNXdqNFNrcGN6ZTdjMnpSciJ9%2EvMBX3xeTY5MV29lnWoX-hlSV20wAjSx0QPW1MWaq8nuh1uB22DxUAEDQtk4sjiLVNtNaNBgUV2doSXk3n9ambQ&scope=openid',
  },
  presentationRequestUrl:
    'openid4vp://?request_uri=https%3A%2F%2F70ff-195-98-90-134.ngrok-free.app%2FopenId%2Foid4vp%2Fdid%3Akey%3Az6MkooobRCrvQ1N2fYFNVmvTUCVZhreUqXp69TPLjk7nNgae%2Fauthorization-requests%2F411e9a8a-22f0-49dc-8ad5-d9d5c5b7333e',
  resolvedSiopAuthorizationRequest: {
    authorizationRequest: {
      jwt: 'eyJhbGciOiJFZERTQSIsImtpZCI6ImRpZDprZXk6ejZNa29vb2JSQ3J2UTFOMmZZRk5WbXZUVUNWWmhyZVVxWHA2OVRQTGprN25OZ2FlI3o2TWtvb29iUkNydlExTjJmWUZOVm12VFVDVlpocmVVcVhwNjlUUExqazduTmdhZSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3MjY1MDg4MjQsImV4cCI6MTcyNjUwODk0NCwicmVzcG9uc2VfdHlwZSI6InZwX3Rva2VuIiwic2NvcGUiOiJvcGVuaWQiLCJjbGllbnRfaWQiOiJkaWQ6a2V5Ono2TWtvb29iUkNydlExTjJmWUZOVm12VFVDVlpocmVVcVhwNjlUUExqazduTmdhZSIsInJlZGlyZWN0X3VyaSI6Imh0dHBzOi8vNzBmZi0xOTUtOTgtOTAtMTM0Lm5ncm9rLWZyZWUuYXBwL29wZW5JZC9vaWQ0dnAvZGlkOmtleTp6Nk1rb29vYlJDcnZRMU4yZllGTlZtdlRVQ1ZaaHJlVXFYcDY5VFBMams3bk5nYWUvYXV0aG9yaXplIiwicmVzcG9uc2VfbW9kZSI6InBvc3QiLCJub25jZSI6IjE5ODAxMTkyNzU1NDc1MzA4NzcyMzE5MiIsInN0YXRlIjoiNjAyODI5MzY5OTk3NDI3MTM0Njc2OTEzIiwiY2xpZW50X21ldGFkYXRhIjp7InJlc3BvbnNlX3R5cGVzX3N1cHBvcnRlZCI6WyJ2cF90b2tlbiJdLCJzdWJqZWN0X3N5bnRheF90eXBlc19zdXBwb3J0ZWQiOlsiZGlkOmtleSIsImRpZDppbmR5Il0sInZwX2Zvcm1hdHMiOnsiand0X3ZjIjp7ImFsZyI6WyJFZERTQSIsIkVTMjU2IiwiRVMyNTZLIl19LCJqd3RfdmNfanNvbiI6eyJhbGciOlsiRWREU0EiLCJFUzI1NiIsIkVTMjU2SyJdfSwiand0X3ZwIjp7ImFsZyI6WyJFZERTQSIsIkVTMjU2IiwiRVMyNTZLIl19LCJsZHBfdmMiOnsicHJvb2ZfdHlwZSI6WyJFZDI1NTE5U2lnbmF0dXJlMjAxOCJdfSwibGRwX3ZwIjp7InByb29mX3R5cGUiOlsiRWQyNTUxOVNpZ25hdHVyZTIwMTgiXX0sInZjK3NkLWp3dCI6eyJrYl9qd3RfYWxnX3ZhbHVlcyI6WyJFZERTQSIsIkVTMjU2IiwiRVMyNTZLIl0sInNkX2p3dF9hbGdfdmFsdWVzIjpbIkVkRFNBIiwiRVMyNTYiLCJFUzI1NksiXX19LCJjbGllbnRfaWQiOiJkaWQ6a2V5Ono2TWtvb29iUkNydlExTjJmWUZOVm12VFVDVlpocmVVcVhwNjlUUExqazduTmdhZSJ9LCJwcmVzZW50YXRpb25fZGVmaW5pdGlvbiI6eyJpZCI6IjczNzk3YjBjLWRhZTYtNDZhNy05NzAwLTc4NTA4NTVmZWUyMiIsIm5hbWUiOiJFeGFtcGxlIFByZXNlbnRhdGlvbiBEZWZpbml0aW9uIiwiaW5wdXRfZGVzY3JpcHRvcnMiOlt7ImlkIjoiNjM1YmE1MTljZDE5NzY0ZTg0ZWE2N2RkIiwiY29uc3RyYWludHMiOnsibGltaXRfZGlzY2xvc3VyZSI6InJlcXVpcmVkIiwiZmllbGRzIjpbeyJwYXRoIjpbIiQuYWdlIl19XX0sIm5hbWUiOiJSZXF1ZXN0ZWQgU2QgSnd0IEV4YW1wbGUgQ3JlZGVudGlhbCIsInB1cnBvc2UiOiJUbyBwcm92aWRlIGFuIGV4YW1wbGUgb2YgcmVxdWVzdGluZyBhIGNyZWRlbnRpYWwifV19LCJuYmYiOjE3MjY1MDg4MjQsImp0aSI6IjYzYTNlNWY5LWM0MDQtNDk4Mi1hMTViLWE0MmE4MmNhYzAyOSIsImlzcyI6ImRpZDprZXk6ejZNa29vb2JSQ3J2UTFOMmZZRk5WbXZUVUNWWmhyZVVxWHA2OVRQTGprN25OZ2FlIiwic3ViIjoiZGlkOmtleTp6Nk1rb29vYlJDcnZRMU4yZllGTlZtdlRVQ1ZaaHJlVXFYcDY5VFBMams3bk5nYWUifQ.KPjQfaVNYuDeIwhAXrwvBAcWxNp0zBbFURTEYJHbJeE70F-IjZQUbQAooW5AoU4cU4XOiWXBiZrL0TY-wWE7AA',
      payload: {
        iat: 1726508824,
        exp: 1726508944,
        response_type: 'vp_token',
        scope: 'openid',
        client_id: 'did:key:z6MkooobRCrvQ1N2fYFNVmvTUCVZhreUqXp69TPLjk7nNgae',
        redirect_uri:
          'https://70ff-195-98-90-134.ngrok-free.app/openId/oid4vp/did:key:z6MkooobRCrvQ1N2fYFNVmvTUCVZhreUqXp69TPLjk7nNgae/authorize',
        response_mode: 'post',
        nonce: '198011927554753087723192',
        state: '602829369997427134676913',
        client_metadata: {
          response_types_supported: ['vp_token'],
          subject_syntax_types_supported: ['did:key', 'did:indy'],
          vp_formats: {
            jwt_vc: {
              alg: ['EdDSA', 'ES256', 'ES256K'],
            },
            jwt_vc_json: {
              alg: ['EdDSA', 'ES256', 'ES256K'],
            },
            jwt_vp: {
              alg: ['EdDSA', 'ES256', 'ES256K'],
            },
            ldp_vc: {
              proof_type: ['Ed25519Signature2018'],
            },
            ldp_vp: {
              proof_type: ['Ed25519Signature2018'],
            },
            'vc+sdJwt': {
              kb_jwt_alg_values: ['EdDSA', 'ES256', 'ES256K'],
              sd_jwt_alg_values: ['EdDSA', 'ES256', 'ES256K'],
            },
          },
          client_id: 'did:key:z6MkooobRCrvQ1N2fYFNVmvTUCVZhreUqXp69TPLjk7nNgae',
        },
        presentation_definition: {
          id: '73797b0c-dae6-46a7-9700-7850855fee22',
          name: 'Example Presentation Definition',
          input_descriptors: [
            {
              id: '635ba519cd19764e84ea67dd',
              constraints: {
                limit_disclosure: 'required',
                fields: [
                  {
                    path: ['$.age'],
                  },
                ],
              },
              name: 'Requested Sd Jwt Example Credential',
              purpose: 'To provide an example of requesting a credential',
            },
          ],
        },
        nbf: 1726508824,
        jti: '63a3e5f9-c404-4982-a15b-a42a82cac029',
        iss: 'did:key:z6MkooobRCrvQ1N2fYFNVmvTUCVZhreUqXp69TPLjk7nNgae',
        sub: 'did:key:z6MkooobRCrvQ1N2fYFNVmvTUCVZhreUqXp69TPLjk7nNgae',
      },
      issuer: 'did:key:z6MkooobRCrvQ1N2fYFNVmvTUCVZhreUqXp69TPLjk7nNgae',
      responseURIType: 'redirect_uri',
      responseURI:
        'https://70ff-195-98-90-134.ngrok-free.app/openId/oid4vp/did:key:z6MkooobRCrvQ1N2fYFNVmvTUCVZhreUqXp69TPLjk7nNgae/authorize',
      correlationId: '1c1bd557-0331-4f1f-800f-048ad90dd6f1',
      authorizationRequest: {
        _payload: {
          request_uri:
            'https://70ff-195-98-90-134.ngrok-free.app/openId/oid4vp/did:key:z6MkooobRCrvQ1N2fYFNVmvTUCVZhreUqXp69TPLjk7nNgae/authorization-requests/411e9a8a-22f0-49dc-8ad5-d9d5c5b7333e',
        },
      },
      verifyOpts: {
        verification: {
          revocationOpts: {},
        },
        supportedVersions: [110, 180, 200],
        correlationId: '1c1bd557-0331-4f1f-800f-048ad90dd6f1',
      },
      presentationDefinitions: [
        {
          definition: {
            id: '73797b0c-dae6-46a7-9700-7850855fee22',
            name: 'Example Presentation Definition',
            input_descriptors: [
              {
                id: '635ba519cd19764e84ea67dd',
                constraints: {
                  limit_disclosure: 'required',
                  fields: [
                    {
                      path: ['$.age'],
                    },
                  ],
                },
                name: 'Requested Sd Jwt Example Credential',
                purpose: 'To provide an example of requesting a credential',
              },
            ],
          },
          location: 'presentation_definition',
        },
      ],
      registrationMetadataPayload: {
        response_types_supported: ['vp_token'],
        subject_syntax_types_supported: ['did:key', 'did:indy'],
        vp_formats: {
          jwt_vc: {
            alg: ['EdDSA', 'ES256', 'ES256K'],
          },
          jwt_vc_json: {
            alg: ['EdDSA', 'ES256', 'ES256K'],
          },
          jwt_vp: {
            alg: ['EdDSA', 'ES256', 'ES256K'],
          },
          ldp_vc: {
            proof_type: ['Ed25519Signature2018'],
          },
          ldp_vp: {
            proof_type: ['Ed25519Signature2018'],
          },
          'vc+sdJwt': {
            kb_jwt_alg_values: ['EdDSA', 'ES256', 'ES256K'],
            sd_jwt_alg_values: ['EdDSA', 'ES256', 'ES256K'],
          },
        },
        client_id: 'did:key:z6MkooobRCrvQ1N2fYFNVmvTUCVZhreUqXp69TPLjk7nNgae',
      },
      authorizationRequestPayload: {
        request_uri:
          'https://70ff-195-98-90-134.ngrok-free.app/openId/oid4vp/did:key:z6MkooobRCrvQ1N2fYFNVmvTUCVZhreUqXp69TPLjk7nNgae/authorization-requests/411e9a8a-22f0-49dc-8ad5-d9d5c5b7333e',
      },
      versions: [110],
    } as unknown as OpenId4VcSiopVerifiedAuthorizationRequest,
    presentationExchange: {
      definition: {
        id: '73797b0c-dae6-46a7-9700-7850855fee22',
        name: 'Example Presentation Definition',
        input_descriptors: [
          {
            id: '635ba519cd19764e84ea67dd',
            constraints: {
              limit_disclosure: 'required',
              fields: [
                {
                  path: ['$.age'],
                },
              ],
            },
            name: 'Requested Sd Jwt Example Credential',
            purpose: 'To provide an example of requesting a credential',
          },
        ],
      },
      credentialsForRequest: {
        requirements: [
          {
            rule: 'pick',
            needsCount: 1,
            submissionEntry: [
              {
                inputDescriptorId: '635ba519cd19764e84ea67dd',
                name: 'Requested Sd Jwt Example Credential',
                purpose: 'To provide an example of requesting a credential',
                verifiableCredentials: [
                  {
                    type: 'vc+sd-jwt',
                    credentialRecord: {
                      _tags: {
                        alg: 'EdDSA',
                        sdAlg: 'sha-256',
                        vct: 'empl:pda1',
                      },
                      metadata: {
                        '_dsrWallet/openId4VcCredentialMetadata': {
                          credential: {},
                          issuer: {
                            id: 'https://70ff-195-98-90-134.ngrok-free.app/openId/oid4vci/did:key:z6MkooobRCrvQ1N2fYFNVmvTUCVZhreUqXp69TPLjk7nNgae',
                          },
                        },
                      },
                      id: '351c4c33-7f3f-4b32-91d5-81132459e16b',
                      createdAt: '2024-09-16T17:46:28.486Z',
                      compactSdJwtVc:
                        'eyJ0eXAiOiJ2YytzZC1qd3QiLCJhbGciOiJFZERTQSIsImtpZCI6IiN6Nk1rb29vYlJDcnZRMU4yZllGTlZtdlRVQ1ZaaHJlVXFYcDY5VFBMams3bk5nYWUifQ.eyJpZCI6InRlc3QiLCJ2Y3QiOiJlbXBsOnBkYTEiLCJjbmYiOnsia2lkIjoiZGlkOmtleTp6Nk1rd2RVUjZ2OHRjQW5UeE1SdUxORUp3YTRYeUV2dEpMZkhWTlh4ZExEcHVwQjQjejZNa3dkVVI2djh0Y0FuVHhNUnVMTkVKd2E0WHlFdnRKTGZIVk5YeGRMRHB1cEI0In0sImlzcyI6ImRpZDprZXk6ejZNa29vb2JSQ3J2UTFOMmZZRk5WbXZUVUNWWmhyZVVxWHA2OVRQTGprN25OZ2FlIiwiaWF0IjoxNzI2NTA4Nzg4LCJfc2QiOlsiVXB5dU1NcXZXdk12bl9jbTlKejEteklCT2hpTlgtbm1xYm9kdWVibkFzQSIsImdaS2plOHZHdUloOUJNLXNaQTBJT2MwWTFjV05hQlNfazR1R0JFcDVpRE0iXSwiX3NkX2FsZyI6InNoYS0yNTYifQ.9pBwdNhhhbQB76BrnohY1JfFXbxT_erBNh8gLrlhfq85teA6FtzQ57lZw1dGHYMGNNVmE3bj5txSLfmpGAlJAg~WyIxMTY3ODc3NDIwMDYzNTAwMzgyODkwODYwIiwiZmlyc3RfbmFtZSIsIkpvaG4xIl0~WyI1NDY0MTYzMDkwMzY3NTk4MDE1NTAxMTkiLCJhZ2UiLCIyNiJd~',
                      updatedAt: '2024-09-16T17:46:29.846Z',
                    },
                    disclosedPayload: {
                      id: 'test',
                      vct: 'empl:pda1',
                      cnf: {
                        kid: 'did:key:z6MkwdUR6v8tcAnTxMRuLNEJwa4XyEvtJLfHVNXxdLDpupB4#z6MkwdUR6v8tcAnTxMRuLNEJwa4XyEvtJLfHVNXxdLDpupB4',
                      },
                      iss: 'did:key:z6MkooobRCrvQ1N2fYFNVmvTUCVZhreUqXp69TPLjk7nNgae',
                      iat: 1726508788,
                      age: '26',
                    },
                  },
                ],
              },
            ],
            isRequirementSatisfied: true,
          },
        ],
        areRequirementsSatisfied: true,
        name: 'Example Presentation Definition',
      } as unknown as DifPexCredentialsForRequest,
    },
  },
  presentationSubmissionParams: {
    selectedCredentials: { '635ba519cd19764e84ea67dd': '351c4c33-7f3f-4b32-91d5-81132459e16b' },
  },
  authorizationParams: {
    clientId: 'mock-client-id',
    redirectUri: 'mock-redirect-uri',
  },
  tokenResponse: {
    accessToken:
      'eyJ0eXAiOiJKV1QiLCJhbGciOiJFZERTQSIsImp3ayI6eyJrdHkiOiJPS1AiLCJjcnYiOiJFZDI1NTE5IiwieCI6Ijl3QlZ4Rk40b0xSTTM1eFI3OXh3NkViMVZzbEYxcWlqenJZUmNWM3ZXMUEifX0.eyJwcmVBdXRob3JpemVkQ29kZSI6IjIzMzIzODk3Nzk5MzI2NTM3OTUzNjY4MiIsImlzcyI6Imh0dHBzOi8vNzBmZi0xOTUtOTgtOTAtMTM0Lm5ncm9rLWZyZWUuYXBwL29wZW5JZC9vaWQ0dmNpL2RpZDprZXk6ejZNa29vb2JSQ3J2UTFOMmZZRk5WbXZUVUNWWmhyZVVxWHA2OVRQTGprN25OZ2FlIiwiZXhwIjoxNzI2NDk3NDcyLCJpYXQiOjE3MjY0OTcyOTJ9.ySTbX5eLPYPAS160Z9AAZbDOIV3SON32kT6aPRvB1avmsouETFsGwOppw0_cswBnA1L85t3D7Z-oXVHtUTSSAQ',
    cNonce: '259654279754362217821710',
  },
}

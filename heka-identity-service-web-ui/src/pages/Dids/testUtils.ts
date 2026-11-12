import { DidDocument } from '@/entities/Did';
import { MockApi } from '@/shared/lib/tests/renderWithProviders';

export const KEY_DID =
  'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
export const INDY_DID = 'did:indy:bcovrin:test:7Tqg6BwSSWapxgUDm9KKgg';
export const HEDERA_DID =
  'did:hedera:testnet:z6MkgUv5CvjRP6AsvEYqSRN7djB6p4zK9bcMQ93g5yK6Td7N_0.0.12345';

export const keyDoc: DidDocument = {
  '@context': [
    'https://w3id.org/did/v1',
    'https://w3id.org/security/suites/ed25519-2018/v1',
  ],
  id: KEY_DID,
  verificationMethod: [
    {
      id: `${KEY_DID}#z6Mk`,
      type: 'Ed25519VerificationKey2018',
      controller: KEY_DID,
      publicKeyBase58: 'B12NYF8RrR3h41TDCTJojY59usg3mbtbjnFs7Eud1Y6u',
    },
  ],
  authentication: [`${KEY_DID}#z6Mk`],
};

export const indyDoc: DidDocument = {
  '@context': ['https://www.w3.org/ns/did/v1'],
  id: INDY_DID,
  verificationMethod: [
    {
      id: `${INDY_DID}#verkey`,
      type: 'Ed25519VerificationKey2018',
      controller: INDY_DID,
      publicKeyBase58: 'GJ1SzoWzavQYfNL9XkaJdrQejfztN4XqdsiV4ct3LXKL',
    },
  ],
  service: [
    {
      id: `${INDY_DID}#endpoint`,
      type: 'endpoint',
      serviceEndpoint: 'https://agent.example.com',
    },
  ],
};

/** A hedera-like document with every part the details screen renders. */
export const hederaDoc: DidDocument = {
  '@context': [
    'https://www.w3.org/ns/did/v1',
    'https://w3id.org/security/suites/ed25519-2020/v1',
  ],
  id: HEDERA_DID,
  controller: HEDERA_DID,
  alsoKnownAs: ['https://issuer.example.com'],
  verificationMethod: [
    {
      id: `${HEDERA_DID}#did-root-key`,
      type: 'Ed25519VerificationKey2020',
      controller: HEDERA_DID,
      publicKeyMultibase: 'z6MkgUv5CvjRP6AsvEYqSRN7djB6p4zK9bcMQ93g5yK6Td7N',
    },
    {
      id: `${HEDERA_DID}#key-jwk`,
      type: 'JsonWebKey2020',
      controller: HEDERA_DID,
      publicKeyJwk: { kty: 'OKP', crv: 'Ed25519', x: 'jwk-x-value' },
    },
  ],
  authentication: [`${HEDERA_DID}#did-root-key`],
  assertionMethod: [`${HEDERA_DID}#did-root-key`],
  keyAgreement: [
    {
      id: `${HEDERA_DID}#key-agreement-1`,
      type: 'X25519KeyAgreementKey2019',
      controller: HEDERA_DID,
      publicKeyBase58: 'JhNWeSVLMYccCk7iopQW4guaSJTojqpMEELgSLhKwRr',
    },
  ],
  service: [
    {
      id: `${HEDERA_DID}#did-communication`,
      type: 'did-communication',
      serviceEndpoint: 'javascript:alert(1)',
      recipientKeys: [`${HEDERA_DID}#key-agreement-1`],
      routingKeys: ['did:key:z6MkRouting'],
      accept: ['didcomm/aip2;env=rfc19'],
      priority: 0,
    },
    {
      id: `${HEDERA_DID}#didcomm-v2`,
      type: 'DIDCommMessaging',
      serviceEndpoint: { uri: 'https://mediator.example.com', accept: [] },
    },
  ],
  foo: 'bar',
};

export const apiError = (message: string, status = 500) => ({
  isAxiosError: true,
  response: { status, data: { message } },
});

export interface DidFixtures {
  /** `GET /dids/methods`, or an error to reject it with */
  methods?: string[] | ReturnType<typeof apiError>;
  /** `GET /dids?own=true&method=<m>` per method, or an error to reject it with */
  dids?: Record<string, DidDocument[] | ReturnType<typeof apiError>>;
}

/** Routes the mock agency API's GET requests for DIDs like the identity service does. */
export const routeDidGets = (
  api: MockApi,
  {
    methods = ['indy', 'key', 'hedera'],
    dids = { indy: [indyDoc], key: [keyDoc], hedera: [hederaDoc] },
  }: DidFixtures = {},
) => {
  api.get.mockImplementation(
    (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === '/dids/methods') {
        return Array.isArray(methods)
          ? Promise.resolve({ data: { methods } })
          : Promise.reject(methods);
      }
      if (url === '/dids') {
        const method = config?.params?.method as string;
        const result = dids[method] ?? [];
        return Array.isArray(result)
          ? Promise.resolve({ data: result })
          : Promise.reject(result);
      }
      return Promise.resolve({ data: undefined });
    },
  );
};

/** The `GET /dids` calls made, as their params. */
export const didRequests = (api: MockApi) =>
  api.get.mock.calls
    .filter(([url]) => url === '/dids')
    .map(([, config]) => config?.params);

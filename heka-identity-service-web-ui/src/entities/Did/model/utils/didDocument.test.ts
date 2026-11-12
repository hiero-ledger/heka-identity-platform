import {
  formatValue,
  getDidMethod,
  getPublicKey,
  normalizeDidDocument,
  sortDids,
  toList,
} from './didDocument';
import { DidDocument, DidVerificationMethod } from '../types/did';

const vm = (extra: Partial<DidVerificationMethod>): DidVerificationMethod => ({
  id: 'did:key:z6Mk#z6Mk',
  type: 'Ed25519VerificationKey2018',
  controller: 'did:key:z6Mk',
  ...extra,
});

describe('getDidMethod', () => {
  test.each([
    ['did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK', 'key'],
    ['did:indy:bcovrin:test:7Tqg6BwSSWapxgUDm9KKgg', 'indy'],
    [
      'did:hedera:testnet:z6MkgUv5CvjRP6AsvEYqSRN7djB6p4zK9bcMQ93g5yK6Td7N_0.0.12345',
      'hedera',
    ],
    ['did:indybesu:testnet:0x1234', 'indybesu'],
  ])('%s is a %s DID', (did, method) => {
    expect(getDidMethod(did)).toBe(method);
  });

  test('a string without a method gives an empty method', () => {
    expect(getDidMethod('not-a-did')).toBe('');
  });
});

describe('normalizeDidDocument', () => {
  test('moves `context` to `@context` and keeps every other property', () => {
    const raw = {
      context: ['https://www.w3.org/ns/did/v1'],
      id: 'did:key:z6Mk',
      service: [{ id: '#s', type: 't', serviceEndpoint: 'x', priority: 1 }],
      foo: 'bar',
    } as unknown as DidDocument;

    const doc = normalizeDidDocument(raw);

    expect(doc).toEqual({
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: 'did:key:z6Mk',
      service: [{ id: '#s', type: 't', serviceEndpoint: 'x', priority: 1 }],
      foo: 'bar',
    });
    expect(doc).not.toHaveProperty('context');
  });

  test('keeps an existing `@context` untouched', () => {
    const raw = {
      '@context': 'https://w3id.org/did/v1',
      context: 'something else',
      id: 'did:key:z6Mk',
    } as DidDocument;

    expect(normalizeDidDocument(raw)).toBe(raw);
  });

  test('leaves a document without any context as it is', () => {
    const raw = { id: 'did:key:z6Mk' };

    expect(normalizeDidDocument(raw)).toBe(raw);
  });
});

describe('getPublicKey', () => {
  test('reads publicKeyMultibase', () => {
    expect(getPublicKey(vm({ publicKeyMultibase: 'z6MkX' }))).toEqual({
      label: 'publicKeyMultibase',
      value: 'z6MkX',
    });
  });

  test('reads publicKeyBase58', () => {
    expect(getPublicKey(vm({ publicKeyBase58: 'B12N' }))).toEqual({
      label: 'publicKeyBase58',
      value: 'B12N',
    });
  });

  test('serializes publicKeyJwk as JSON', () => {
    const jwk = { kty: 'OKP', crv: 'Ed25519', x: 'abc' };

    expect(getPublicKey(vm({ publicKeyJwk: jwk }))).toEqual({
      label: 'publicKeyJwk',
      value: JSON.stringify(jwk),
    });
  });

  test('prefers multibase over base58 when both are present', () => {
    expect(
      getPublicKey(vm({ publicKeyBase58: 'B12N', publicKeyMultibase: 'z6' }))
        ?.label,
    ).toBe('publicKeyMultibase');
  });

  test('falls back to a blockchain account id', () => {
    expect(getPublicKey(vm({ blockchainAccountId: 'eip155:1:0xabc' }))).toEqual(
      { label: 'blockchainAccountId', value: 'eip155:1:0xabc' },
    );
  });

  test('is undefined without a key', () => {
    expect(getPublicKey(vm({}))).toBeUndefined();
  });
});

describe('sortDids', () => {
  const doc = (id: string): DidDocument => ({ id });

  test('orders by the configured methods and keeps the server order within a method', () => {
    const docs = [
      doc('did:hedera:testnet:a_0.0.1'),
      doc('did:key:z1'),
      doc('did:indy:bcovrin:test:a'),
      doc('did:key:z2'),
      doc('did:web:example.com'),
      doc('did:indy:bcovrin:test:b'),
    ];

    expect(sortDids(docs, ['indy', 'key', 'hedera']).map((d) => d.id)).toEqual([
      'did:indy:bcovrin:test:a',
      'did:indy:bcovrin:test:b',
      'did:key:z1',
      'did:key:z2',
      'did:hedera:testnet:a_0.0.1',
      'did:web:example.com',
    ]);
  });

  test('does not change its input', () => {
    const docs = [doc('did:key:z1'), doc('did:indy:a')];

    sortDids(docs, ['indy', 'key']);

    expect(docs.map((d) => d.id)).toEqual(['did:key:z1', 'did:indy:a']);
  });
});

describe('formatValue and toList', () => {
  test('formatValue keeps strings and pretty-prints anything else', () => {
    expect(formatValue('javascript:alert(1)')).toBe('javascript:alert(1)');
    expect(formatValue({ uri: 'x' })).toBe('{\n  "uri": "x"\n}');
    expect(formatValue(0)).toBe('0');
  });

  test('toList wraps single values and drops absent ones', () => {
    expect(toList('a')).toEqual(['a']);
    expect(toList(['a', 'b'])).toEqual(['a', 'b']);
    expect(toList(undefined)).toEqual([]);
  });
});

import { DidDocument, DidVerificationMethod } from '../types/did';

export const VERIFICATION_RELATIONSHIPS = [
  'authentication',
  'assertionMethod',
  'keyAgreement',
  'capabilityInvocation',
  'capabilityDelegation',
] as const;

export type VerificationRelationship =
  (typeof VERIFICATION_RELATIONSHIPS)[number];

/** Public key properties of a verification method, in the order they are looked up. */
const PUBLIC_KEY_PROPERTIES = [
  'publicKeyMultibase',
  'publicKeyBase58',
  'publicKeyJwk',
  'publicKeyBase64',
  'publicKeyHex',
  'publicKeyPem',
  'blockchainAccountId',
  'ethereumAddress',
] as const;

/** The method of a DID, e.g. `hedera` for `did:hedera:testnet:...`. */
export const getDidMethod = (did: string): string => did.split(':')[1] ?? '';

/**
 * Returns the document with `@context`: `GET /dids/:did` and `POST /dids` answer with
 * `context` instead. Every other property is kept as it is.
 */
export const normalizeDidDocument = (raw: DidDocument): DidDocument => {
  if (raw['@context'] !== undefined || raw.context === undefined) return raw;

  const { context, ...rest } = raw;
  return { '@context': context as DidDocument['@context'], ...rest };
};

/** The first public key value of a verification method, with the property it was read from. */
export const getPublicKey = (
  verificationMethod: DidVerificationMethod,
): { label: string; value: string } | undefined => {
  for (const property of PUBLIC_KEY_PROPERTIES) {
    const value = verificationMethod[property];
    if (value === undefined || value === null) continue;
    return {
      label: property,
      value: typeof value === 'string' ? value : JSON.stringify(value),
    };
  }
  return undefined;
};

/**
 * Orders DIDs by their method's position in `methods` (unknown methods last). DIDs of the
 * same method keep the server's order.
 */
export const sortDids = (
  docs: DidDocument[],
  methods: string[],
): DidDocument[] => {
  const rank = (doc: DidDocument) => {
    const index = methods.indexOf(getDidMethod(doc.id));
    return index === -1 ? methods.length : index;
  };
  return docs
    .map((doc, index) => ({ doc, index, rank: rank(doc) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ doc }) => doc);
};

/**
 * i18next options for values shown in translated text. React escapes the text already, so the
 * HTML escaping of i18next would only show entities such as `&#39;` in server messages.
 */
export const textInterpolation = { interpolation: { escapeValue: false } };

/** A value as text: strings as they are, anything else as pretty-printed JSON. */
export const formatValue = (value: unknown): string =>
  typeof value === 'string' ? value : JSON.stringify(value, null, 2);

/** A single value or a list of values as a list. */
export const toList = <T>(value: T | T[] | undefined): T[] => {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The object entries of a document property that should hold a list of objects (verification
 * methods, services). A document comes from a ledger, so anything else (`null`, a string, a
 * number) is skipped here instead of breaking the page; the raw JSON still shows it.
 */
export const objectsOf = <T extends object>(value: unknown): T[] =>
  toList(value).filter(isRecord) as unknown as T[];

/** The entries of a verification relationship: id references (strings) and embedded methods. */
export const relationshipEntriesOf = (
  value: unknown,
): Array<string | DidVerificationMethod> =>
  toList(value).filter(
    (entry): entry is string | DidVerificationMethod =>
      typeof entry === 'string' || isRecord(entry),
  );

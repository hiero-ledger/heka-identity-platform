import { X509Signer } from '@/entities/X509Signer';
import { RequestSignerSelection } from '@/shared/lib/dcApi';

// Picker keys for the two non-X.509 choices; any other key is an X.509 identity id.
export const SIGNER_DEFAULT = 'default';
export const SIGNER_DID = 'did';

/**
 * The key the picker should show after the identity list (re)loaded: a chosen X.509 identity that is no
 * longer listed (or has expired meanwhile) falls back to the verifier default, so the UI never shows one
 * signer while the request would be sent with another.
 */
export const reconcileSignerKey = (signerKey: string, identities: ReadonlyArray<X509Signer>): string => {
  if (signerKey === SIGNER_DEFAULT || signerKey === SIGNER_DID) return signerKey;
  const identity = identities.find((item) => item.id === signerKey);
  return identity && !identity.expired ? signerKey : SIGNER_DEFAULT;
};

/** What the request is signed with for a picker key; `undefined` = the build-time `.env` default. */
export const resolveSignerSelection = (
  signerKey: string,
  identities: ReadonlyArray<X509Signer>,
): RequestSignerSelection | undefined => {
  if (signerKey === SIGNER_DEFAULT) return undefined;
  if (signerKey === SIGNER_DID) return { method: 'did' };
  const identity = identities.find((item) => item.id === signerKey);
  return identity && !identity.expired
    ? { method: 'x5c', clientIdPrefix: identity.clientIdPrefix, certificateId: identity.id }
    : undefined;
};

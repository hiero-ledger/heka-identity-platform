import { X509Signer } from '@/entities/X509Signer';

import {
  reconcileSignerKey,
  resolveSignerSelection,
  SIGNER_DEFAULT,
  SIGNER_DID,
} from './signerSelection';

const valid: X509Signer = {
  id: 'signer-1',
  clientIdPrefix: 'x509_san_dns',
  fingerprint: 'abcdef',
  isDefault: true,
  expiresInDays: 200,
  expired: false,
};
const expired: X509Signer = { ...valid, id: 'signer-old', isDefault: false, expiresInDays: -3, expired: true };

describe('signer picker selection', () => {
  test('the default and DID keys survive any identity list', () => {
    expect(reconcileSignerKey(SIGNER_DEFAULT, [])).toBe(SIGNER_DEFAULT);
    expect(reconcileSignerKey(SIGNER_DID, [valid])).toBe(SIGNER_DID);
  });

  test('a chosen X.509 signer persists while listed and falls back to the default once it is gone or expired', () => {
    expect(reconcileSignerKey('signer-1', [valid, expired])).toBe('signer-1');
    expect(reconcileSignerKey('signer-1', [])).toBe(SIGNER_DEFAULT);
    expect(reconcileSignerKey('signer-old', [valid, expired])).toBe(SIGNER_DEFAULT);
  });

  test('the selection sent matches the key shown', () => {
    expect(resolveSignerSelection(SIGNER_DEFAULT, [valid])).toBeUndefined();
    expect(resolveSignerSelection(SIGNER_DID, [valid])).toEqual({ method: 'did' });
    expect(resolveSignerSelection('signer-1', [valid])).toEqual({
      method: 'x5c',
      clientIdPrefix: 'x509_san_dns',
      certificateId: 'signer-1',
    });
  });

  test('an expired or unknown identity never becomes the request signer', () => {
    expect(resolveSignerSelection('signer-old', [valid, expired])).toBeUndefined();
    expect(resolveSignerSelection('unknown', [valid])).toBeUndefined();
  });
});

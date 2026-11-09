import { canRevoke, getIssuedCredentialStatus } from './issuedCredentialView';

describe('canRevoke', () => {
  test.each([
    [{ revocable: true, revoked: false }, true],
    // Status unknown (ledger or status list not readable): the identity service decides
    [{ revocable: true, revoked: undefined }, true],
    [{ revocable: true, revoked: true }, false],
    [{ revocable: false, revoked: undefined }, false],
    [{ revocable: false, revoked: false }, false],
  ])('%j → %s, whatever the protocol', (item, expected) => {
    expect(canRevoke(item)).toBe(expected);
  });
});

describe('getIssuedCredentialStatus', () => {
  test.each([
    [{ revocable: true, revoked: false }, 'active'],
    [{ revocable: true, revoked: true }, 'revoked'],
    [{ revocable: true, revoked: undefined }, 'unknown'],
    [{ revocable: false, revoked: undefined }, 'notRevocable'],
  ] as const)('%j → %s', (item, expected) => {
    expect(getIssuedCredentialStatus(item)).toBe(expected);
  });
});

import { UnauthorizedException } from '@nestjs/common'

import { Role } from 'common/auth'
import { getWalletId } from 'utils/auth'

describe('getWalletId', () => {
  test.each([
    [{ role: Role.Admin, userId: '11' }, 'Administration_11'],
    [{ role: Role.OrgAdmin, userId: '12', orgId: '1' }, 'Organization_1'],
    [{ role: Role.OrgManager, userId: '13', orgId: '1' }, 'Organization_1'],
    [{ role: Role.OrgMember, userId: '14', orgId: '1' }, 'Organization_1'],
    [{ role: Role.Issuer, userId: '15', orgId: '1' }, 'Issuer_15_in_Organization_1'],
    [{ role: Role.Verifier, userId: '16', orgId: '2' }, 'Verifier_16_in_Organization_2'],
    [{ role: Role.User, userId: '17' }, 'User_17'],
  ])("for %o returns '%s'", (params: { role: Role; userId: string; orgId?: string }, expected: string) => {
    const actual = getWalletId(params)
    expect(actual).toBe(expected)
  })

  test.each([
    { role: Role.Admin, userId: '11', orgId: '1' },
    { role: Role.OrgAdmin, userId: '12' },
    { role: Role.OrgManager, userId: '13' },
    { role: Role.OrgMember, userId: '14' },
    { role: Role.Issuer, userId: '15' },
    { role: Role.Verifier, userId: '16' },
    { role: Role.User, userId: '17', orgId: '2' },
  ])('for %o throws UnauthorizedException', (params: { role: Role; userId: string; orgId?: string }) => {
    expect(() => getWalletId(params)).toThrow(UnauthorizedException)
  })
})

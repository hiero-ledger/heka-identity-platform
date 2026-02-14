import { User } from '../entities'

export enum Role {
  Admin = 'Admin',
  OrgAdmin = 'OrgAdmin',
  OrgManager = 'OrgManager',
  OrgMember = 'OrgMember',
  Issuer = 'Issuer',
  Verifier = 'Verifier',
  User = 'User',
}

export function isRole(value: string): value is Role {
  return Object.values(Role).includes(value as Role)
}

export interface AuthInfo {
  userId: string
  user: User
  userName: string
  role: Role
  orgId?: string
  walletId: string
  tenantId: string
}

import { createMock } from '@golevelup/ts-vitest'
import { BadGatewayException, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import { AuthInfo, Role } from 'common/auth'
import { Logger } from 'common/logger'
import OrganizationAdminConfig, { organizationAdminDefaults } from 'config/organization-admin'

import {
  DirectoryError,
  DirectoryMember,
  DirectoryOrganization,
  OrganizationDirectory,
  OrganizationRole,
} from '../directory/directory.types'
import { OrganizationAdminService } from '../organization-admin.service'

const acme: DirectoryOrganization = { id: 'kc-org-1', name: 'acme', hekaOrgId: 'acme-org' }

const member = (id: string, roles: Role[]): DirectoryMember => ({ id, hekaUid: `uid-${id}`, username: id, roles })

/** In-memory directory: one organization, members by id. */
class FakeDirectory implements OrganizationDirectory {
  public members = new Map<string, DirectoryMember>()
  public setRoleCalls: Array<[string, OrganizationRole]> = []
  public failWith?: Error

  public constructor(members: DirectoryMember[]) {
    for (const m of members) this.members.set(m.id, m)
  }

  public findOrganization(hekaOrgId: string) {
    return Promise.resolve(hekaOrgId === acme.hekaOrgId ? acme : undefined)
  }

  public listMembers() {
    if (this.failWith) return Promise.reject(this.failWith)
    return Promise.resolve([...this.members.values()])
  }

  public getMember(_organization: DirectoryOrganization, memberId: string) {
    return Promise.resolve(this.members.get(memberId))
  }

  public setRole(_organization: DirectoryOrganization, target: DirectoryMember, role: OrganizationRole) {
    this.setRoleCalls.push([target.id, role])
    this.members.set(target.id, { ...target, roles: [role] })
    return Promise.resolve()
  }
}

const config = (enabled = true): ConfigType<typeof OrganizationAdminConfig> => ({
  ...organizationAdminDefaults,
  enabled,
  provider: 'keycloak',
  url: 'http://localhost:8080',
  clientId: 'heka-identity-admin',
  clientSecret: 'secret',
})

const authInfo = (role: Role, userId = 'uid-boss', orgId: string | undefined = 'acme-org') =>
  ({ role, userId, orgId, userName: 'boss' }) as AuthInfo

describe('OrganizationAdminService', () => {
  let directory: FakeDirectory
  let logger: Logger
  let service: OrganizationAdminService

  beforeEach(() => {
    directory = new FakeDirectory([
      member('boss', [Role.OrgAdmin]),
      member('alice', [Role.OrgMember]),
      member('newbie', [Role.User]),
      member('operator', [Role.Admin]),
    ])
    logger = createMock<Logger>()
    // The service logs through child loggers; keep them all on this mock
    vi.mocked(logger.child).mockReturnValue(logger)
    service = new OrganizationAdminService(config(), directory, logger)
  })

  describe('listMembers', () => {
    test("lists the caller's organization with each member's role and marks the caller", async () => {
      const result = await service.listMembers(authInfo(Role.OrgAdmin))

      expect(result.organizationId).toBe('acme-org')
      expect(result.members.map((m) => [m.id, m.role, m.self])).toEqual([
        ['boss', Role.OrgAdmin, true],
        ['alice', Role.OrgMember, false],
        ['newbie', Role.User, false],
        ['operator', Role.Admin, false],
      ])
    })

    test('reports no single role for a member with two Heka roles', async () => {
      directory.members.set('twice', member('twice', [Role.User, Role.Issuer]))

      const twice = (await service.listMembers(authInfo(Role.OrgAdmin))).members.find((m) => m.id === 'twice')

      expect(twice?.role).toBeUndefined()
      expect(twice?.roles).toEqual([Role.User, Role.Issuer])
    })
  })

  describe('setRole', () => {
    test('assigns an organization role, logs an audit entry and returns the updated member', async () => {
      const result = await service.setRole(authInfo(Role.OrgAdmin), 'alice', Role.Issuer)

      expect(directory.setRoleCalls).toEqual([['alice', Role.Issuer]])
      expect(result).toMatchObject({ id: 'alice', role: Role.Issuer, roles: [Role.Issuer], self: false })
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          audit: 'organization-role-change',
          organization: 'acme-org',
          from: [Role.OrgMember],
          to: Role.Issuer,
        }),
        expect.any(String),
      )
    })

    test('turns a User member into an organization role', async () => {
      await service.setRole(authInfo(Role.OrgAdmin), 'newbie', Role.Verifier)

      expect(directory.setRoleCalls).toEqual([['newbie', Role.Verifier]])
    })

    test('does nothing when the member already has exactly that role', async () => {
      await service.setRole(authInfo(Role.OrgAdmin), 'alice', Role.OrgMember)

      expect(directory.setRoleCalls).toEqual([])
    })

    test.each([Role.Admin, Role.User, 'Root'])('refuses to assign %s', async (role) => {
      await expect(service.setRole(authInfo(Role.OrgAdmin), 'alice', role)).rejects.toBeInstanceOf(BadRequestException)
      expect(directory.setRoleCalls).toEqual([])
    })

    test('refuses a change of the caller’s own role', async () => {
      await expect(service.setRole(authInfo(Role.OrgAdmin), 'boss', Role.OrgMember)).rejects.toThrow(
        'You cannot change your own role',
      )
    })

    test('never touches a member with Admin', async () => {
      await expect(service.setRole(authInfo(Role.OrgAdmin), 'operator', Role.OrgMember)).rejects.toBeInstanceOf(
        ForbiddenException,
      )
      expect(directory.setRoleCalls).toEqual([])
    })

    test('answers 404 for a user who is not a member of the organization', async () => {
      await expect(service.setRole(authInfo(Role.OrgAdmin), 'stranger', Role.Issuer)).rejects.toBeInstanceOf(
        NotFoundException,
      )
    })
  })

  describe('authorization', () => {
    test.each([Role.Admin, Role.OrgManager, Role.OrgMember, Role.Issuer, Role.Verifier, Role.User])(
      'refuses a %s caller, whatever the role model flag says',
      async (role) => {
        await expect(service.listMembers(authInfo(role))).rejects.toBeInstanceOf(ForbiddenException)
        await expect(service.setRole(authInfo(role), 'alice', Role.Issuer)).rejects.toBeInstanceOf(ForbiddenException)
      },
    )

    test('refuses an OrgAdmin token whose holder was demoted in the provider since', async () => {
      directory.members.set('boss', member('boss', [Role.OrgMember]))

      await expect(service.setRole(authInfo(Role.OrgAdmin), 'alice', Role.Issuer)).rejects.toThrow(
        'You are no longer an OrgAdmin member of acme-org',
      )
      expect(directory.setRoleCalls).toEqual([])
    })

    test('refuses an OrgAdmin token whose holder left the organization', async () => {
      directory.members.delete('boss')

      await expect(service.listMembers(authInfo(Role.OrgAdmin))).rejects.toBeInstanceOf(ForbiddenException)
    })

    test("answers 404 when the token's organization is not in the provider's Organizations", async () => {
      await expect(service.listMembers(authInfo(Role.OrgAdmin, 'uid-boss', 'other-org'))).rejects.toBeInstanceOf(
        NotFoundException,
      )
    })

    test('answers 404 while organization administration is disabled', async () => {
      const disabled = new OrganizationAdminService(config(false), undefined, logger)

      await expect(disabled.listMembers(authInfo(Role.OrgAdmin))).rejects.toThrow(
        'Organization administration is not enabled',
      )
    })

    test('turns a provider failure into 502', async () => {
      directory.failWith = new DirectoryError('GET /organizations failed: 500')

      await expect(service.listMembers(authInfo(Role.OrgAdmin))).rejects.toBeInstanceOf(BadGatewayException)
    })
  })
})

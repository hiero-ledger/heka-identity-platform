import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common'
import { ConfigType } from '@nestjs/config'

import { AuthInfo, Role } from 'common/auth'
import { InjectLogger, Logger } from 'common/logger'
import OrganizationAdminConfig from 'config/organization-admin'

import {
  DirectoryError,
  DirectoryMember,
  DirectoryOrganization,
  isOrganizationRole,
  ORGANIZATION_DIRECTORY,
  ORGANIZATION_ROLES,
  OrganizationDirectory,
} from './directory/directory.types'
import { OrganizationMemberDto, OrganizationMembersDto } from './dto/organization-member.dto'

/**
 * Delegated organization administration: an `OrgAdmin` manages the Heka roles of their own organization's members.
 * The roles stay in the OIDC provider; this service applies the rules heka-auth-service enforced for `OrgAdmin`s:
 * - only an `OrgAdmin` may call it, always, whatever `ROLE_MODEL_ENABLED` says, because it changes other users' roles;
 * - only for the organization of their token, whose membership comes from the provider's Organizations;
 * - only organization roles (`OrgAdmin`, `OrgManager`, `OrgMember`, `Issuer`, `Verifier`) can be assigned;
 * - nobody changes their own role, and members with `Admin` are never touched;
 * - the caller's current role is read again from the provider before every change, so a token issued before the
 *   caller was demoted can't be used to change roles.
 * Every change is logged with the caller, the member and the old and new role.
 */
@Injectable()
export class OrganizationAdminService implements OnModuleInit {
  public constructor(
    @Inject(OrganizationAdminConfig.KEY)
    private readonly config: ConfigType<typeof OrganizationAdminConfig>,
    @Inject(ORGANIZATION_DIRECTORY)
    private readonly directory: OrganizationDirectory | undefined,
    @InjectLogger(OrganizationAdminService)
    private readonly logger: Logger,
  ) {}

  public onModuleInit(): void {
    const logger = this.logger.child('onModuleInit')
    if (this.config.enabled) {
      logger.info(
        { provider: this.config.provider, url: this.config.url, clientId: this.config.clientId },
        'Organization administration enabled: OrgAdmins manage their organization members through GET/PUT /organization/members',
      )
    } else {
      logger.info(
        'Organization administration disabled (set ORG_ADMIN_PROVIDER, ORG_ADMIN_URL, ORG_ADMIN_CLIENT_ID, ORG_ADMIN_CLIENT_SECRET)',
      )
    }
  }

  public async listMembers(authInfo: AuthInfo): Promise<OrganizationMembersDto> {
    const { directory, organization } = await this.authorize(authInfo)
    const members = await this.call(() => directory.listMembers(organization))
    return {
      organizationId: organization.hekaOrgId,
      organizationName: organization.name,
      members: members.map((member) => this.toDto(member, authInfo)),
    }
  }

  public async setRole(authInfo: AuthInfo, memberId: string, role: string): Promise<OrganizationMemberDto> {
    const logger = this.logger.child('setRole')
    if (!isOrganizationRole(role)) {
      throw new BadRequestException(`role must be one of ${ORGANIZATION_ROLES.join(', ')}`)
    }
    const { directory, organization } = await this.authorize(authInfo)

    const member = await this.call(() => directory.getMember(organization, memberId))
    if (!member) {
      throw new NotFoundException(`No member ${memberId} in organization ${organization.hekaOrgId}`)
    }
    if (member.hekaUid === authInfo.userId) {
      throw new ForbiddenException('You cannot change your own role')
    }
    if (member.roles.includes(Role.Admin)) {
      throw new ForbiddenException('Members with the Admin role are managed by platform operators')
    }
    if (member.roles.length === 1 && member.roles[0] === role) {
      return this.toDto(member, authInfo)
    }

    await this.call(() => directory.setRole(organization, member, role))
    logger.info(
      {
        audit: 'organization-role-change',
        actor: authInfo.userId,
        actorName: authInfo.userName,
        organization: organization.hekaOrgId,
        member: member.id,
        memberHekaUid: member.hekaUid,
        from: member.roles,
        to: role,
      },
      `${authInfo.userName} changed the role of ${member.username} in ${organization.hekaOrgId} from ${member.roles.join(', ') || 'none'} to ${role}`,
    )
    const updated = await this.call(() => directory.getMember(organization, memberId))
    return this.toDto(updated ?? { ...member, roles: [role] }, authInfo)
  }

  /** The directory and the caller's organization, after checking that the caller may manage it now. */
  private async authorize(
    authInfo: AuthInfo,
  ): Promise<{ directory: OrganizationDirectory; organization: DirectoryOrganization }> {
    const directory = this.directory
    if (!this.config.enabled || !directory) {
      throw new NotFoundException('Organization administration is not enabled')
    }
    if (authInfo.role !== Role.OrgAdmin || !authInfo.orgId) {
      throw new ForbiddenException('Only an OrgAdmin can manage organization members')
    }
    const orgId = authInfo.orgId
    const organization = await this.call(() => directory.findOrganization(orgId))
    if (!organization) {
      throw new NotFoundException(
        `Organization ${authInfo.orgId} is not managed in the OIDC provider's Organizations (no organization with ${this.config.orgIdField} = ${authInfo.orgId})`,
      )
    }
    // The token may predate a demotion: the caller must still be an OrgAdmin member of this organization
    const caller = (await this.call(() => directory.listMembers(organization))).find(
      (member) => member.hekaUid === authInfo.userId,
    )
    if (!caller || caller.roles.length !== 1 || caller.roles[0] !== Role.OrgAdmin) {
      throw new ForbiddenException(`You are no longer an OrgAdmin member of ${authInfo.orgId}`)
    }
    return { directory, organization }
  }

  private async call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof DirectoryError) {
        this.logger.child('call').error({ err: error }, '! OIDC provider admin API call failed')
        throw new BadGatewayException('The OIDC provider admin API call failed')
      }
      throw error
    }
  }

  private toDto(member: DirectoryMember, authInfo: AuthInfo): OrganizationMemberDto {
    return {
      id: member.id,
      hekaUid: member.hekaUid,
      username: member.username,
      role: member.roles.length === 1 ? member.roles[0] : undefined,
      roles: member.roles,
      self: member.hekaUid === authInfo.userId,
    }
  }
}

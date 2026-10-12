import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common'
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'

import { AuthInfo, JwtAuthGuard, ReqAuthInfo, Role } from 'common/auth'
import { RoleGuard, Roles } from 'common/authz'
import { InjectLogger, Logger } from 'common/logger'

import {
  OrganizationMemberDto,
  OrganizationMembersDto,
  SetOrganizationRoleRequestDto,
} from './dto/organization-member.dto'
import { OrganizationAdminService } from './organization-admin.service'

/**
 * Delegated organization administration for `OrgAdmin`s. The `OrgAdmin` check is made by the service on every call,
 * also when the role model is disabled; `@Roles` only adds it to the role guard and the API docs.
 */
@ApiTags('Organization administration')
@ApiBearerAuth()
@Controller('organization')
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles(Role.OrgAdmin)
@ApiUnauthorizedResponse({ description: 'Missing or invalid token' })
@ApiForbiddenResponse({ description: 'The caller is not (or no longer) an OrgAdmin member of the organization' })
@ApiNotFoundResponse({
  description: 'Organization administration is not enabled, or the organization or member is unknown',
})
@ApiBadGatewayResponse({ description: 'The OIDC provider admin API call failed' })
export class OrganizationAdminController {
  public constructor(
    private readonly service: OrganizationAdminService,
    @InjectLogger(OrganizationAdminController)
    private readonly logger: Logger,
  ) {
    this.logger.child('constructor').trace('<>')
  }

  @ApiOperation({ summary: "Members of the caller's organization and their Heka roles" })
  @ApiOkResponse({ type: OrganizationMembersDto })
  @Get('members')
  public async listMembers(@ReqAuthInfo() authInfo: AuthInfo): Promise<OrganizationMembersDto> {
    return await this.service.listMembers(authInfo)
  }

  @ApiOperation({
    summary: "Set the Heka role of a member of the caller's organization",
    description:
      'Assigns one organization role (OrgAdmin, OrgManager, OrgMember, Issuer, Verifier) and removes any other Heka role. ' +
      'Not for the caller themselves, and not for members with Admin. The change applies with the member’s next token.',
  })
  @ApiParam({ name: 'memberId', description: "The member's id as listed by GET /organization/members" })
  @ApiOkResponse({ type: OrganizationMemberDto })
  @ApiBadRequestResponse({ description: 'Not an organization role' })
  @Put('members/:memberId/role')
  public async setRole(
    @ReqAuthInfo() authInfo: AuthInfo,
    @Param('memberId') memberId: string,
    @Body() body: SetOrganizationRoleRequestDto,
  ): Promise<OrganizationMemberDto> {
    return await this.service.setRole(authInfo, memberId, body.role)
  }
}

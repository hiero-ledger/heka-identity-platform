import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn } from 'class-validator'

import { Role } from 'common/auth'

import { ORGANIZATION_ROLES, OrganizationRole } from '../directory/directory.types'

export class OrganizationMemberDto {
  @ApiProperty({ description: "The OIDC provider's user id; use it in PUT /organization/members/{id}/role" })
  public id!: string

  @ApiProperty({ description: 'Heka user id (the token user id that wallets are derived from)' })
  public hekaUid!: string

  @ApiProperty()
  public username!: string

  @ApiPropertyOptional({ enum: Role, description: 'The Heka role in this organization; absent unless exactly one' })
  public role?: Role

  @ApiProperty({
    enum: Role,
    isArray: true,
    description: 'Every Heka role found; a token is only accepted with exactly one',
  })
  public roles!: Role[]

  @ApiProperty({ description: 'True for the caller' })
  public self!: boolean
}

export class OrganizationMembersDto {
  @ApiProperty({ description: 'Heka organization id (names the organization wallet)' })
  public organizationId!: string

  @ApiProperty({ description: "The organization's name in the OIDC provider" })
  public organizationName!: string

  @ApiProperty({ type: [OrganizationMemberDto] })
  public members!: OrganizationMemberDto[]
}

export class SetOrganizationRoleRequestDto {
  @ApiProperty({ enum: ORGANIZATION_ROLES })
  @IsIn(ORGANIZATION_ROLES)
  public role!: OrganizationRole
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

import { ContributorAuditEventType } from '../contributor-audit-event.entity'

export class GithubIdentityDto {
  @ApiProperty({ description: 'GitHub numeric account id, as a string', example: '583231' })
  public accountId!: string

  @ApiProperty({ description: 'GitHub login at link time', example: 'octocat' })
  public username!: string
}

/** Binding fields returned to the user who owns the binding. */
export class ContributorBindingDto {
  @ApiProperty({ example: '583231' })
  public githubAccountId!: string

  @ApiProperty({ example: 'octocat' })
  public githubUsername!: string

  @ApiProperty({ description: 'Wallet of the last link or verification' })
  public walletId!: string

  @ApiPropertyOptional({ description: 'Fingerprint of the verified GPG key (uppercase hex)' })
  public gpgFingerprint?: string

  @ApiPropertyOptional({ description: 'ISO-8601 time of the GPG verification' })
  public verifiedAt?: string

  @ApiProperty({ description: 'ISO-8601 time of the first link' })
  public linkedAt!: string

  @ApiProperty({ description: 'ISO-8601 time of the last change' })
  public updatedAt!: string
}

export class ContributorAuditEventDto {
  @ApiProperty()
  public id!: string

  @ApiProperty({ enum: ContributorAuditEventType })
  public eventType!: ContributorAuditEventType

  @ApiPropertyOptional()
  public githubAccountId?: string

  @ApiPropertyOptional()
  public githubUsername?: string

  @ApiPropertyOptional()
  public walletId?: string

  @ApiPropertyOptional()
  public gpgFingerprint?: string

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  public metadata?: Record<string, unknown>

  @ApiProperty({ description: 'ISO-8601 time of the event' })
  public createdAt!: string
}

export class ContributorOnboardingStatusDto {
  @ApiPropertyOptional({ type: GithubIdentityDto })
  public github?: GithubIdentityDto

  @ApiPropertyOptional({ type: ContributorBindingDto })
  public binding?: ContributorBindingDto

  @ApiProperty({ enum: ['NotConnected', 'GitHubConnected', 'GpgVerified'] })
  public verificationStatus!: 'NotConnected' | 'GitHubConnected' | 'GpgVerified'

  @ApiProperty({ type: [ContributorAuditEventDto], description: 'The 20 most recent events, newest first' })
  public auditEvents!: ContributorAuditEventDto[]
}

import { ContributorAuditEvent, ContributorAuditEventType } from './contributor-audit-event.entity'
import { ContributorBinding } from './contributor-binding.entity'

/** JWT payload shape for contributor tokens issued by the GitHub OAuth flow. */
export interface AuthInfo {
  sub: string
  name: string
  walletId: string
}

export interface GithubIdentity {
  accountId: string
  username: string
}

export interface ContributorBindingDto {
  githubAccountId: string
  githubUsername: string
  walletId: string
  gpgFingerprint?: string
  verifiedAt?: Date
  updatedAt: Date
}

export interface ContributorAuditEventDto {
  id: string
  eventType: ContributorAuditEventType
  githubAccountId?: string
  githubUsername?: string
  walletId?: string
  gpgFingerprint?: string
  metadata?: Record<string, unknown>
  createdAt: Date
}

export interface ContributorOnboardingStatusDto {
  github?: GithubIdentity
  binding?: ContributorBindingDto
  verificationStatus: 'GitHubConnected' | 'GpgVerified' | 'NotConnected'
  auditEvents: ContributorAuditEventDto[]
}

export function toContributorBindingDto(binding: ContributorBinding): ContributorBindingDto {
  return {
    githubAccountId: binding.githubAccountId,
    githubUsername: binding.githubUsername,
    walletId: binding.walletId,
    gpgFingerprint: binding.gpgFingerprint,
    verifiedAt: binding.verifiedAt,
    updatedAt: binding.updatedAt,
  }
}

export function toContributorAuditEventDto(event: ContributorAuditEvent): ContributorAuditEventDto {
  return {
    id: event.id,
    eventType: event.eventType,
    githubAccountId: event.githubAccountId,
    githubUsername: event.githubUsername,
    walletId: event.walletId,
    gpgFingerprint: event.gpgFingerprint,
    metadata: event.metadata,
    createdAt: event.createdAt,
  }
}

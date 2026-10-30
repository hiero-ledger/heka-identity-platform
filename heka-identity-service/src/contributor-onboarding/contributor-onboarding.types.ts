import { ContributorAuditEvent, ContributorAuditEventType } from './contributor-audit-event.entity'
import { ContributorBinding } from './contributor-binding.entity'

export interface GithubIdentity {
  accountId: string
  username: string
}

/** Binding fields safe to return to the authenticated user. */
export interface ContributorBindingView {
  githubAccountId: string
  githubUsername: string
  walletId: string
  gpgFingerprint?: string
  verifiedAt?: string
  linkedAt: string
  updatedAt: string
}

export interface ContributorAuditEventView {
  id: string
  eventType: ContributorAuditEventType
  githubAccountId?: string
  githubUsername?: string
  walletId?: string
  gpgFingerprint?: string
  metadata?: Record<string, unknown>
  createdAt: string
}

export interface ContributorOnboardingStatus {
  github?: GithubIdentity
  binding?: ContributorBindingView
  verificationStatus: 'GitHubConnected' | 'GpgVerified' | 'NotConnected'
  auditEvents: ContributorAuditEventView[]
}

/**
 * Verified binding used when issuing a GithubContributorCredential.
 * `githubAccountId` always comes from this record, never from the caller.
 */
export interface VerifiedContributor {
  githubAccountId: string
  githubUsername: string
  gpgFingerprint: string
  verifiedAt: string
  walletId: string
}

export function toContributorBindingView(binding: ContributorBinding): ContributorBindingView {
  return {
    githubAccountId: binding.githubAccountId,
    githubUsername: binding.githubUsername,
    walletId: binding.walletId,
    gpgFingerprint: binding.gpgFingerprint ?? undefined,
    verifiedAt: binding.verifiedAt ? binding.verifiedAt.toISOString() : undefined,
    linkedAt: binding.linkedAt.toISOString(),
    updatedAt: binding.updatedAt.toISOString(),
  }
}

export function toContributorAuditEventView(event: ContributorAuditEvent): ContributorAuditEventView {
  return {
    id: event.id,
    eventType: event.eventType,
    githubAccountId: event.githubAccountId,
    githubUsername: event.githubUsername,
    walletId: event.walletId,
    gpgFingerprint: event.gpgFingerprint,
    metadata: event.metadata,
    createdAt: event.createdAt.toISOString(),
  }
}

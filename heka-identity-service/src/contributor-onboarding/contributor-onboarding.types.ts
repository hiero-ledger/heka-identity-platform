import { ContributorAuditEvent } from './contributor-audit-event.entity'
import { ContributorBinding } from './contributor-binding.entity'
import { ContributorAuditEventDto, ContributorBindingDto } from './dto/contributor-onboarding-status.dto'

/**
 * Verified binding used when issuing a GithubContributorCredential.
 * `githubAccountId` always comes from this record, never from the caller.
 */
export interface VerifiedContributor {
  githubAccountId: string
  githubUsername: string
  gpgFingerprint: string
  verifiedAt: string
}

export function toContributorBindingView(binding: ContributorBinding): ContributorBindingDto {
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

export function toContributorAuditEventView(event: ContributorAuditEvent): ContributorAuditEventDto {
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

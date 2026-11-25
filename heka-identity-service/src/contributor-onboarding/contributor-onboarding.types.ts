import { ContributorAuditEvent } from './contributor-audit-event.entity'
import { ContributorBinding } from './contributor-binding.entity'
import { ContributorAuditEventDto, ContributorBindingDto } from './dto/contributor-onboarding-status.dto'

/**
 * Verified binding used when issuing the contributor credential.
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
    githubAccountId: event.githubAccountId ?? undefined,
    githubUsername: event.githubUsername ?? undefined,
    walletId: event.walletId ?? undefined,
    gpgFingerprint: event.gpgFingerprint ?? undefined,
    metadata: event.metadata ?? undefined,
    createdAt: event.createdAt.toISOString(),
  }
}

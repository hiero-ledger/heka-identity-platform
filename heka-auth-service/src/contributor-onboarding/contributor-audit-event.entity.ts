import { Entity, Enum, Index, Property } from '@mikro-orm/decorators/legacy'

import { CustomBaseEntity } from '@core/database/entities/custom-base-entity'

export enum ContributorAuditEventType {
  ChallengeRequested = 'ChallengeRequested',
  ProofAccepted = 'ProofAccepted',
  ProofRejected = 'ProofRejected',
  BindingUpdated = 'BindingUpdated',
}

@Entity({ tableName: 'contributor_onboarding_audit_events' })
export class ContributorAuditEvent extends CustomBaseEntity {
  @Enum({ items: () => ContributorAuditEventType })
  public eventType!: ContributorAuditEventType

  @Index()
  @Property({ nullable: true, type: 'string' })
  public githubAccountId?: string

  @Property({ nullable: true, type: 'string' })
  public githubUsername?: string

  @Index()
  @Property({ nullable: true, type: 'string' })
  public walletId?: string

  @Property({ nullable: true, type: 'string' })
  public gpgFingerprint?: string

  @Property({ type: 'json', nullable: true })
  public metadata?: Record<string, unknown>

  @Property({ onCreate: () => new Date(), type: 'Date' })
  public createdAt: Date = new Date()

  public constructor(props: Pick<ContributorAuditEvent, 'eventType'> &
    Partial<Pick<ContributorAuditEvent, 'githubAccountId' | 'githubUsername' | 'walletId' | 'gpgFingerprint' | 'metadata'>>) {
    super()
    Object.assign(this, props)
  }
}

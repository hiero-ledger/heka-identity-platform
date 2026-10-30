import { Entity, Enum, Index, Property } from '@mikro-orm/decorators/legacy'

import { Identified } from 'common/entities/identified.entity'

export enum ContributorAuditEventType {
  ChallengeRequested = 'ChallengeRequested',
  ProofAccepted = 'ProofAccepted',
  ProofRejected = 'ProofRejected',
  BindingUpdated = 'BindingUpdated',
}

@Entity({ tableName: 'contributor_onboarding_audit_events' })
export class ContributorAuditEvent extends Identified {
  @Enum({ items: () => ContributorAuditEventType })
  public eventType!: ContributorAuditEventType

  @Index()
  @Property({ type: 'string' })
  public userId!: string

  @Property({ type: 'string' })
  public tenantId!: string

  @Property({ nullable: true, type: 'string' })
  public githubAccountId?: string

  @Property({ nullable: true, type: 'string' })
  public githubUsername?: string

  @Index()
  @Property({ nullable: true, type: 'string' })
  public walletId?: string

  @Property({ nullable: true, type: 'string' })
  public gpgFingerprint?: string

  @Property({ nullable: true, type: 'json' })
  public metadata?: Record<string, unknown>

  @Property({ type: 'Date' })
  public createdAt: Date = new Date()
}

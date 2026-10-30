import { Entity, Index, Property, Unique } from '@mikro-orm/decorators/legacy'

import { Identified } from 'common/entities/identified.entity'

/**
 * One Heka user linked to one GitHub account inside a tenant.
 *
 * `githubAccountId` is unique across every tenant. `(tenantId, userId)` is
 * unique, so a user has at most one linked GitHub account per tenant.
 * Pointing an existing binding at a different GitHub account clears
 * `gpgFingerprint` and `verifiedAt`.
 */
@Entity({ tableName: 'contributor_bindings' })
@Unique({ properties: ['githubAccountId'] })
@Unique({ properties: ['tenantId', 'userId'] })
export class ContributorBinding extends Identified {
  /** Heka user who linked this GitHub account. */
  @Property({ type: 'string' })
  public userId!: string

  /** Wallet id taken from the user's AuthInfo at link time. */
  @Property({ type: 'string' })
  public walletId!: string

  @Property({ type: 'string' })
  public tenantId!: string

  /** GitHub's immutable numeric account id, stored as a string. */
  @Property({ type: 'string' })
  public githubAccountId!: string

  @Index()
  @Property({ type: 'string' })
  public githubUsername!: string

  @Property({ nullable: true, type: 'string' })
  public gpgFingerprint?: string | null

  @Property({ nullable: true, type: 'Date' })
  public verifiedAt?: Date | null

  @Property({ type: 'Date' })
  public linkedAt: Date = new Date()

  @Property({ onUpdate: () => new Date(), type: 'Date' })
  public updatedAt: Date = new Date()
}

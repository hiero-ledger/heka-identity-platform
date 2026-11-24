import { Entity, Index, Property, Unique } from '@mikro-orm/decorators/legacy'

import { Identified } from 'common/entities/identified.entity'

/**
 * One Heka user (the OIDC subject) linked to one GitHub account.
 *
 * Both `userId` and `githubAccountId` are unique. The wallet and tenant are
 * those of the last link or verification: they follow the user's role and
 * organization, so a role change keeps the binding.
 * Pointing an existing binding at a different GitHub account clears
 * `gpgFingerprint` and `verifiedAt`.
 */
@Entity()
@Unique({ properties: ['githubAccountId'] })
@Unique({ properties: ['userId'] })
export class ContributorBinding extends Identified {
  /** OIDC subject (`AuthInfo.userId`) of the user who linked this GitHub account. */
  @Property({ type: 'string' })
  public userId!: string

  /** Wallet from the user's AuthInfo at the last link or verification. */
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

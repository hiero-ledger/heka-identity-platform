import { Entity, Index, ManyToOne, Property } from '@mikro-orm/decorators/legacy'

import { Identified } from 'common/entities/identified.entity'
import { User } from 'common/entities/user.entity'

/**
 * Single-use GPG ownership challenge.
 *
 * The row is created for an authenticated Heka user who already linked GitHub.
 * `consumed` is set before signature verification so a nonce cannot be replayed,
 * including when verification fails or the process stops mid-request.
 * `verifiedAt` is set only after the signature checks out.
 * Expired challenges are purged when new ones are created.
 */
@Entity()
export class GpgChallenge extends Identified {
  /** Deleted with the user (see `ContributorBinding.user`). */
  @Index()
  @ManyToOne(() => User, { deleteRule: 'cascade' })
  public user!: User

  @Property({ type: 'string' })
  public tenantId!: string

  @Property({ type: 'string' })
  public walletId!: string

  @Property({ type: 'string' })
  public githubAccountId!: string

  @Index()
  @Property({ type: 'string' })
  public githubUsername!: string

  /** 64-character hex nonce the contributor must clear-sign. */
  @Property({ type: 'string' })
  public nonce!: string

  @Property({ type: 'Date' })
  public expiresAt!: Date

  @Property({ default: false, type: 'boolean' })
  public consumed: boolean = false

  @Property({ nullable: true, type: 'Date' })
  public verifiedAt?: Date

  @Property({ nullable: true, type: 'string' })
  public gpgFingerprint?: string

  @Property({ type: 'Date' })
  public createdAt: Date = new Date()
}

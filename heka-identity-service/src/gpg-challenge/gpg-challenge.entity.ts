import { Entity, Index, Property } from '@mikro-orm/decorators/legacy'

import { Identified } from 'common/entities/identified.entity'

/**
 * Single-use GPG ownership challenge.
 *
 * The row is created for an authenticated Heka user who already linked GitHub.
 * `consumed` is set before signature verification so a nonce cannot be replayed,
 * including when verification fails or the process stops mid-request.
 * `verifiedAt` is set only after the signature checks out.
 */
@Entity({ tableName: 'gpg_challenges' })
export class GpgChallenge extends Identified {
  @Index()
  @Property({ type: 'string' })
  public userId!: string

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

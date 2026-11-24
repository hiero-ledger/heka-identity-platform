import { Entity, Enum, Property, Unique } from '@mikro-orm/decorators/legacy'

import { Identified } from 'common/entities/identified.entity'

export enum LinkAttemptStatus {
  Pending = 'pending',
  Consumed = 'consumed',
}

/**
 * One-time GitHub link attempt bound to the Heka user who started it.
 * Only the SHA-256 hash of the state token is stored. The PKCE verifier stays on the server
 * and is cleared when the attempt is consumed. Expired attempts are purged when new ones are created.
 */
@Entity()
@Unique({ properties: ['stateHash'] })
export class OAuthLinkAttempt extends Identified {
  @Property({ type: 'string' })
  public userId!: string

  @Property({ type: 'string' })
  public walletId!: string

  @Property({ type: 'string' })
  public tenantId!: string

  @Property({ type: 'string' })
  public stateHash!: string

  @Property({ nullable: true, type: 'string' })
  public codeVerifier?: string | null

  @Property({ type: 'Date' })
  public expiresAt!: Date

  @Enum({ items: () => LinkAttemptStatus })
  public status: LinkAttemptStatus = LinkAttemptStatus.Pending

  @Property({ type: 'Date' })
  public createdAt: Date = new Date()
}

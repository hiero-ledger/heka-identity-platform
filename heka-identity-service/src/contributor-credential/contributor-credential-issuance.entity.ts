import { Entity, Index, ManyToOne, Property, Unique } from '@mikro-orm/decorators/legacy'

import { Identified } from 'common/entities/identified.entity'
import { User } from 'common/entities/user.entity'

/**
 * A contributor credential offer: who requested it and the claims it carries. The Credo issuance session in the
 * issuer organization's wallet holds the rest, including the status list entry operators revoke it by.
 * Rows stay after an unlink, since they document what was issued.
 */
@Entity()
@Unique({ properties: ['issuanceSessionId'] })
export class ContributorCredentialIssuance extends Identified {
  /** Deleted with the user (see `ContributorBinding.user`). */
  @Index()
  @ManyToOne(() => User, { deleteRule: 'cascade' })
  public user!: User

  @Property({ type: 'string' })
  public issuanceSessionId!: string

  @Property({ type: 'string' })
  public githubAccountId!: string

  @Property({ type: 'string' })
  public githubUsername!: string

  @Property({ type: 'string' })
  public gpgFingerprint!: string

  @Property({ type: 'Date' })
  public createdAt: Date = new Date()
}

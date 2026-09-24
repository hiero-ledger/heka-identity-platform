import { Entity, Index, Property, Unique } from '@mikro-orm/decorators/legacy'

import { Identified } from 'common/entities/identified.entity'

@Entity({ tableName: 'contributor_bindings' })
@Unique({ properties: ['githubAccountId'] })
@Unique({ properties: ['walletId'] })
export class ContributorBinding extends Identified {
  @Property({ type: 'string' })
  public githubAccountId!: string

  @Index()
  @Property({ type: 'string' })
  public githubUsername!: string

  @Property({ type: 'string' })
  public walletId!: string

  @Property({ nullable: true, type: 'string' })
  public gpgFingerprint?: string

  @Property({ nullable: true, type: 'Date' })
  public verifiedAt?: Date

  @Property({ onCreate: () => new Date(), type: 'Date' })
  public createdAt: Date = new Date()

  @Property({ onCreate: () => new Date(), onUpdate: () => new Date(), type: 'Date' })
  public updatedAt: Date = new Date()

  public constructor(props: Partial<ContributorBinding>) {
    super(props)
    Object.assign(this, props)
  }
}

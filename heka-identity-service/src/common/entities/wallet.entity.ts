import { Collection } from '@mikro-orm/core'
import { Entity, Index, ManyToMany, Property } from '@mikro-orm/decorators/legacy'

import { Identified } from './identified.entity'
import { User } from './user.entity'

@Entity()
export class Wallet extends Identified {
  @Index()
  @Property({ type: 'string' })
  public tenantId: string

  @Index()
  @Property({ nullable: true, type: 'string' })
  public publicDid?: string

  @ManyToMany({ entity: () => User, mappedBy: 'wallets' })
  public users = new Collection<User>(this)

  public constructor(props: Omit<Wallet, 'users'>) {
    super(props)
    this.tenantId = props.tenantId
  }
}

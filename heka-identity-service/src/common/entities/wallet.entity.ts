import { Collection, Entity, Index, ManyToMany, Property } from '@mikro-orm/core'

import { Identified } from './identified.entity'
import { User } from './user.entity'

@Entity()
export class Wallet extends Identified {
  @Index()
  @Property()
  public tenantId: string

  @Index()
  @Property({ nullable: true })
  public publicDid?: string

  @ManyToMany({ entity: () => User, mappedBy: 'wallets' })
  public users = new Collection<User>(this)

  public constructor(props: Omit<Wallet, 'users'>) {
    super(props)
    this.tenantId = props.tenantId
  }
}

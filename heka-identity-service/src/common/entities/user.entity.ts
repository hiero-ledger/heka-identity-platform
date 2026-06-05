import { Collection } from '@mikro-orm/core'
import { Entity, Enum, ManyToMany, Property } from '@mikro-orm/decorators/legacy'

import { Identified } from './identified.entity'
import { Wallet } from './wallet.entity'

@Entity()
export class User extends Identified {
  @Enum({ items: () => MessageDeliveryType, nullable: true })
  public messageDeliveryType?: MessageDeliveryType

  @Property({ nullable: true, type: 'string' })
  public webHook?: string

  @ManyToMany({ entity: () => Wallet, inversedBy: 'users' })
  public wallets = new Collection<Wallet>(this)

  @Property({ nullable: true, type: 'string' })
  public name?: string

  @Property({ nullable: true, type: 'string' })
  public logo?: string

  @Property({ nullable: true, type: 'string' })
  public backgroundColor?: string

  @Property({ type: 'timestamp', nullable: true })
  public registeredAt?: Date

  public constructor(props: Omit<User, 'wallets' | 'registeredAt'>) {
    super(props)

    this.messageDeliveryType = props.messageDeliveryType
    this.webHook = props.webHook
    this.name = props.name
    this.backgroundColor = props.backgroundColor
    this.logo = props.logo
  }
}

export enum MessageDeliveryType {
  // Deliver messages using registered web hook
  WebHook = 'WebHook',

  // Deliver messages using websocket connection
  WebSocket = 'WebSocket',
}

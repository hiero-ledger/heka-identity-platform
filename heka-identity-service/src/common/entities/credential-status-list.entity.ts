import { Entity, Enum, ManyToOne, Property } from '@mikro-orm/decorators/legacy'

import { Identified } from './identified.entity'
import { User } from './user.entity'

export enum StatusListPurpose {
  Revocation = 'revocation',
  Suspension = 'suspension',
}

interface CredentialStatusListProps {
  id?: string
  encodedList: string
  issuer: string
  size?: number
  lastIndex?: number
  purpose?: StatusListPurpose
  owner: User
}

export const defaultCredentialStatusListSize = 100

@Entity()
export class CredentialStatusList extends Identified {
  @Property({ nullable: false, type: 'string' })
  public issuer: string

  @Property({ nullable: false, type: 'string' })
  public encodedList: string

  @Property({ nullable: false, type: 'number' })
  public size: number

  @Property({ nullable: false, type: 'number' })
  public lastIndex: number

  @Property({ nullable: false, type: 'string' })
  @Enum(() => StatusListPurpose)
  public purpose: StatusListPurpose

  @ManyToOne(() => User, { nullable: false, lazy: true })
  public owner!: User

  public constructor(props: CredentialStatusListProps) {
    super(props)
    this.issuer = props.issuer
    this.encodedList = props.encodedList
    this.size = props.size ?? defaultCredentialStatusListSize
    this.lastIndex = props.lastIndex ?? 0
    this.purpose = props.purpose ?? StatusListPurpose.Revocation
    this.owner = props.owner
  }
}

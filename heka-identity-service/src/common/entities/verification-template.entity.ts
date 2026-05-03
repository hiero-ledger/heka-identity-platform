import { OpenId4VciCredentialFormatProfile } from '@credo-ts/openid4vc'
import { Collection, Entity, Enum, ManyToOne, OneToMany, Property, Index } from '@mikro-orm/core'

import { AriesCredentialFormat, CredentialFormat, DidMethod, ProtocolType } from '../types'

import { Identified } from './identified.entity'
import { Schema } from './schema.entity'
import { User } from './user.entity'
import { VerificationTemplateField } from './verification-template-field.entity'

@Entity()
export class VerificationTemplate extends Identified {
  @ManyToOne(() => User, { nullable: false, lazy: true })
  @Index()
  public owner!: User

  @Property({ nullable: false, length: 500 })
  public name!: string

  @Property({ nullable: false, type: 'string' })
  @Enum(() => ProtocolType)
  public protocol!: ProtocolType

  @Property({ nullable: false, type: 'string' })
  @Enum(() => AriesCredentialFormat || OpenId4VciCredentialFormatProfile)
  public credentialFormat!: CredentialFormat

  @Property({ nullable: true, type: 'string' })
  @Enum(() => DidMethod)
  public network?: DidMethod

  @Property({ nullable: true, type: 'string' })
  public did?: string

  @ManyToOne(() => Schema, { nullable: false, lazy: true })
  @Index()
  public schema!: Schema

  @Property({ nullable: false, type: 'boolean' })
  public isPinned = false

  @Property({ nullable: true, type: 'number' })
  public orderIndex?: number

  @OneToMany(() => VerificationTemplateField, 'template', { orphanRemoval: true })
  public fields = new Collection<VerificationTemplateField>(this)

  public constructor(props: Partial<VerificationTemplate>) {
    super()
    Object.assign(this, props)
  }
}

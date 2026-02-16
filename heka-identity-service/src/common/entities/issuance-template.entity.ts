import { OpenId4VciCredentialFormatProfile } from '@credo-ts/openid4vc'
import { Collection, Entity, Enum, ManyToOne, OneToMany, Property } from '@mikro-orm/core'

import { AriesCredentialFormat, CredentialFormat, DidMethod, ProtocolType } from '../types'

import { Identified } from './identified.entity'
import { IssuanceTemplateField } from './issuance-template-field.entity'
import { Schema } from './schema.entity'
import { User } from './user.entity'

@Entity()
export class IssuanceTemplate extends Identified {
  @ManyToOne(() => User, { nullable: false, lazy: true })
  // FIXME: Attribute index is unsupported for SqlLite for e2e tests, because this indexes made automatically for SQLLite. But for Postgres @Index() is required.
  // @Index()
  public owner!: User

  @Property({ nullable: false, length: 500 })
  public name!: string

  @Property({ nullable: false, type: 'string' })
  @Enum(() => ProtocolType)
  public protocol!: ProtocolType

  @Property({ nullable: false, type: 'string' })
  @Enum(() => AriesCredentialFormat || OpenId4VciCredentialFormatProfile)
  public credentialFormat!: CredentialFormat

  @Property({ nullable: false, type: 'string' })
  @Enum(() => DidMethod)
  public network!: DidMethod

  @Property({ nullable: false, type: 'string' })
  public did!: string

  @ManyToOne(() => Schema, { nullable: false, lazy: true })
  // FIXME: Attribute index is unsupported for SqlLite for e2e tests, because this indexes made automatically for SQLLite. But for Postgres @Index() is required.
  // @Index()
  public schema!: Schema

  @Property({ nullable: false, type: 'boolean' })
  public isPinned = false

  @Property({ nullable: true, type: 'number' })
  public orderIndex?: number

  @OneToMany(() => IssuanceTemplateField, 'template', { orphanRemoval: true })
  public fields = new Collection<IssuanceTemplateField>(this)

  public constructor(props: Partial<IssuanceTemplate>) {
    super()
    Object.assign(this, props)
  }
}

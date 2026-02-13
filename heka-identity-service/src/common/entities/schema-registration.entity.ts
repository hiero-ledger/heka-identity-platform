import { Entity, Enum, ManyToOne, Property } from '@mikro-orm/core'

import {
  AriesCredentialRegistrationFormat,
  CredentialRegistrationFormat,
  DidMethod,
  OpenId4VCCredentialRegistrationFormat,
  ProtocolType,
} from '../types'
import { AriesRegistrationCredentials, OID4VCRegistrationCredentials } from '../types/registration-credentials'

import { Identified } from './identified.entity'
import { Schema } from './schema.entity'

@Entity()
export class SchemaRegistration extends Identified {
  @ManyToOne(() => Schema, { nullable: false })
  // FIXME: Attribute index is unsupported for SqlLite for e2e tests, because this indexes made automatically for SQLLite. But for Postgres @Index() is required.
  // @Index()
  public schema!: Schema

  @Property({ nullable: false, type: 'string' })
  @Enum(() => ProtocolType)
  public protocol!: ProtocolType

  @Property({ nullable: true, type: 'string' })
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  @Enum(() => AriesCredentialRegistrationFormat || OpenId4VCCredentialRegistrationFormat)
  public credentialFormat?: CredentialRegistrationFormat

  @Property({ nullable: true, type: 'string' })
  @Enum(() => DidMethod)
  public network?: DidMethod

  @Property({ nullable: false, type: 'string' })
  public did!: string

  @Property({ type: 'json', nullable: true })
  public credentials?: AriesRegistrationCredentials | OID4VCRegistrationCredentials

  public constructor(props: Partial<SchemaRegistration>) {
    super()
    Object.assign(this, props)
  }
}

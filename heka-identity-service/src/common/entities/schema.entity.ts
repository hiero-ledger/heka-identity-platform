import { Collection, Entity, ManyToOne, OneToMany, Property } from '@mikro-orm/core'

import { Identified } from './identified.entity'
import { SchemaField } from './schema-field.entity'
import { SchemaRegistration } from './schema-registration.entity'
import { User } from './user.entity'

@Entity()
export class Schema extends Identified {
  @ManyToOne(() => User, { nullable: false, lazy: true })
  // FIXME: Attribute index is unsupported for SqlLite for e2e tests, because this indexes made automatically for SQLLite. But for Postgres @Index() is required.
  // @Index()
  public owner!: User

  @Property({ nullable: false, length: 500 })
  public name!: string

  @Property({ nullable: true, length: 4000 })
  public logo?: string

  @Property({ nullable: true, length: 8 })
  public bgColor?: string

  @Property({ nullable: true, type: 'number' })
  public orderIndex?: number

  @Property({ nullable: false, type: 'boolean' })
  public isHidden = false

  @OneToMany(() => SchemaField, 'schema', { orphanRemoval: true })
  public fields = new Collection<SchemaField>(this)

  @OneToMany(() => SchemaRegistration, 'schema', { orphanRemoval: true })
  public registrations = new Collection<SchemaRegistration>(this)

  public constructor(props: Partial<Schema>) {
    super()
    Object.assign(this, props)
  }
}

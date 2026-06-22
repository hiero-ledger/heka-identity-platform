import { Collection } from '@mikro-orm/core'
import { Entity, ManyToOne, OneToMany, Property, Index } from '@mikro-orm/decorators/legacy'

import { Identified } from './identified.entity'
import { SchemaField } from './schema-field.entity'
import { SchemaRegistration } from './schema-registration.entity'
import { User } from './user.entity'

@Entity()
export class Schema extends Identified {
  @ManyToOne(() => User, { nullable: false, lazy: true })
  @Index()
  public owner!: User

  @Property({ nullable: false, length: 500, type: 'string' })
  public name!: string

  @Property({ nullable: true, length: 4000, type: 'string' })
  public logo?: string

  @Property({ nullable: true, length: 8, type: 'string' })
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

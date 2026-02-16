import { Entity, ManyToOne, Property } from '@mikro-orm/core'

import { Identified } from './identified.entity'
import { Schema } from './schema.entity'

@Entity()
export class SchemaField extends Identified {
  @ManyToOne(() => Schema, { nullable: false })
  // FIXME: Attribute index is unsupported for SqlLite for e2e tests, because this indexes made automatically for SQLLite. But for Postgres @Index() is required.
  // @Index()
  public schema!: Schema

  @Property({ nullable: false, length: 250 })
  public name!: string

  @Property({ nullable: true, type: 'number' })
  public orderIndex?: number

  public constructor(props: Partial<SchemaField>) {
    super()
    Object.assign(this, props)
  }
}

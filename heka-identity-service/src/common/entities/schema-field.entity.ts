import { Entity, ManyToOne, Property, Index } from '@mikro-orm/core'

import { Identified } from './identified.entity'
import { Schema } from './schema.entity'

@Entity()
export class SchemaField extends Identified {
  @ManyToOne(() => Schema, { nullable: false })
  @Index()
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

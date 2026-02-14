import { Entity, ManyToOne, Property } from '@mikro-orm/core'

import { Identified } from './identified.entity'
import { IssuanceTemplate } from './issuance-template.entity'
import { SchemaField } from './schema-field.entity'

@Entity()
export class IssuanceTemplateField extends Identified {
  @ManyToOne(() => IssuanceTemplate, { nullable: false })
  // FIXME: Attribute index is unsupported for SqlLite for e2e tests, because this indexes made automatically for SQLLite. But for Postgres @Index() is required.
  // @Index()
  public template!: IssuanceTemplate

  @ManyToOne(() => SchemaField, { nullable: false })
  // FIXME: Attribute index is unsupported for SqlLite for e2e tests, because this indexes made automatically for SQLLite. But for Postgres @Index() is required.
  // @Index()
  public schemaField!: SchemaField

  @Property({ nullable: true })
  public value?: string

  public constructor(props: Partial<IssuanceTemplateField>) {
    super()
    Object.assign(this, props)
  }
}

import { Entity, ManyToOne } from '@mikro-orm/core'

import { Identified } from './identified.entity'
import { SchemaField } from './schema-field.entity'
import { VerificationTemplate } from './verification-template.entity'

@Entity()
export class VerificationTemplateField extends Identified {
  @ManyToOne(() => VerificationTemplate, { nullable: false })
  // FIXME: Attribute index is unsupported for SqlLite for e2e tests, because this indexes made automatically for SQLLite. But for Postgres @Index() is required.
  // @Index()
  public template!: VerificationTemplate

  @ManyToOne(() => SchemaField, { nullable: false })
  // FIXME: Attribute index is unsupported for SqlLite for e2e tests, because this indexes made automatically for SQLLite. But for Postgres @Index() is required.
  // @Index()
  public schemaField!: SchemaField

  public constructor(props: Partial<VerificationTemplateField>) {
    super()
    Object.assign(this, props)
  }
}

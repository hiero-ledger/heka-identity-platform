import { Entity, ManyToOne, Index } from '@mikro-orm/core'

import { Identified } from './identified.entity'
import { SchemaField } from './schema-field.entity'
import { VerificationTemplate } from './verification-template.entity'

@Entity()
export class VerificationTemplateField extends Identified {
  @ManyToOne(() => VerificationTemplate, { nullable: false })
  @Index()
  public template!: VerificationTemplate

  @ManyToOne(() => SchemaField, { nullable: false })
  @Index()
  public schemaField!: SchemaField

  public constructor(props: Partial<VerificationTemplateField>) {
    super()
    Object.assign(this, props)
  }
}

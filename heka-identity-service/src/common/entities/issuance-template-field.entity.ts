import { Entity, ManyToOne, Property, Index } from '@mikro-orm/core'

import { Identified } from './identified.entity'
import { IssuanceTemplate } from './issuance-template.entity'
import { SchemaField } from './schema-field.entity'

@Entity()
export class IssuanceTemplateField extends Identified {
  @ManyToOne(() => IssuanceTemplate, { nullable: false })
 @Index()
  public template!: IssuanceTemplate

  @ManyToOne(() => SchemaField, { nullable: false })
  @Index()
  public schemaField!: SchemaField

  @Property({ nullable: true })
  public value?: string

  public constructor(props: Partial<IssuanceTemplateField>) {
    super()
    Object.assign(this, props)
  }
}

import { BaseEntity } from '@mikro-orm/core'
import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy'
import { v4 } from 'uuid'

@Entity({ abstract: true })
export abstract class CustomBaseEntity extends BaseEntity {
  @PrimaryKey({ type: 'uuid' })
  public id = v4()

  @Property({ type: 'datetime' })
  public createdAt: Date = new Date()

  @Property({ onUpdate: () => new Date(), type: 'datetime' })
  public updatedAt: Date = new Date()
}

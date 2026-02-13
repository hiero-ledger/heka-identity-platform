import { BaseEntity, Entity, PrimaryKey, Property } from '@mikro-orm/core'
import { v4 } from 'uuid'

@Entity({ abstract: true })
export abstract class CustomBaseEntity extends BaseEntity {
  @PrimaryKey({ type: 'uuid' })
  public id = v4()

  @Property()
  public createdAt: Date = new Date()

  @Property({ onUpdate: () => new Date() })
  public updatedAt: Date = new Date()
}

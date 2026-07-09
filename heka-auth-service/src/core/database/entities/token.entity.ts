import { CustomBaseEntity } from '@core/database/entities/custom-base-entity'
import { Entity, Enum, Index, Property } from '@mikro-orm/decorators/legacy'

import { TokenRepository } from '../repositories'

export enum TokenType {
  AccessToken = 'access',
  RefreshToken = 'refresh',
  PasswordChangeToken = 'password-change',
}

@Entity({ repository: () => TokenRepository })
export class Token extends CustomBaseEntity {
  @Property({ nullable: false, type: 'string' })
  @Enum(() => TokenType)
  @Index()
  public type!: TokenType

  @Property({ nullable: false, type: 'string' })
  @Index()
  public subject!: string

  @Property({ nullable: false, columnType: 'text', type: 'string' })
  @Index()
  public token!: string

  @Property({ nullable: true, columnType: 'text', type: 'string' })
  public payload?: string

  @Property({ nullable: false, type: 'boolean' })
  @Index()
  public isRevoked: boolean = false

  @Property({
    nullable: true,
    type: 'datetime',
  })
  @Index()
  public expireIn?: Date

  public constructor(partial?: Partial<Token>) {
    super()
    Object.assign(this, partial)
  }
}

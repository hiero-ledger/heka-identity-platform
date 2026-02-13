import { CustomBaseEntity } from '@core/database/entities/custom-base-entity'
import { Entity, Enum, Index, Property } from '@mikro-orm/postgresql'

import { TokenRepository } from '../repositories'

export enum TokenType {
  AccessToken = 'access',
  RefreshToken = 'refresh',
  PasswordChangeToken = 'password-change',
}

@Entity({ repository: () => TokenRepository })
export class Token extends CustomBaseEntity {
  @Property({ nullable: false })
  @Enum(() => TokenType)
  @Index()
  public type!: TokenType

  @Property({ nullable: false })
  @Index()
  public subject!: string

  @Property({ nullable: false, columnType: 'text' })
  @Index()
  public token!: string

  @Property({ nullable: true, columnType: 'text' })
  public payload?: string

  @Property({ nullable: false })
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

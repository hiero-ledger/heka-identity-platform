import { JwtConfig } from '@config'
import { Entity, Enum, Index, Property } from '@mikro-orm/decorators/legacy'

import { UserRepository } from '../repositories'
import { CustomBaseEntity } from './custom-base-entity'

export enum UserRole {
  Admin = 'Admin',
  OrgAdmin = 'OrgAdmin',
  OrgManager = 'OrgManager',
  OrgMember = 'OrgMember',
  Issuer = 'Issuer',
  Verifier = 'Verifier',
  User = 'User',
}

@Entity({ tableName: 'auth_user', repository: () => UserRepository })
export class User extends CustomBaseEntity {
  @Property({ unique: true, nullable: false, type: 'string' })
  @Index()
  public name!: string

  @Property({ nullable: false, columnType: 'text', lazy: true, type: 'string' })
  public password!: string

  @Property({ nullable: false, type: 'string' })
  @Enum(() => UserRole)
  public role!: UserRole

  public constructor(partial?: Partial<User>) {
    super()
    Object.assign(this, partial)
  }

  public isDemoUser(config: JwtConfig): boolean {
    return this.name === config.demoUser
  }
}

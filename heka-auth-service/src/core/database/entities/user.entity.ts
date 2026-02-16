import { JwtConfig } from '@config'
import { Entity, Enum, Property } from '@mikro-orm/core'
import { Index } from '@mikro-orm/postgresql'

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
  @Property({ unique: true, nullable: false })
  @Index()
  public name!: string

  @Property({ nullable: false, columnType: 'text', lazy: true })
  public password!: string

  @Property({ nullable: false })
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

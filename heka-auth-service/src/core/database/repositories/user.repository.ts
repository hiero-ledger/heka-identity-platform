import { EntityRepository } from '@mikro-orm/core'

import { User } from '../entities'

export class UserRepository extends EntityRepository<User> {
  public async persistAndFlush(users: User | User[]) {
    return await this.em.persistAndFlush(users)
  }
}

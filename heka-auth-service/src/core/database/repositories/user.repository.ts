import { EntityRepository } from '@mikro-orm/core'

import { User } from '../entities'

export class UserRepository extends EntityRepository<User> {
  public async persistAndFlush(users: User | User[]) {
    this.em.persist(users)
    await this.em.flush()
  }
}

import { MikroORM, ReflectMetadataProvider } from '@mikro-orm/core'
import { SqliteDriver } from '@mikro-orm/sqlite'

import { User, Token } from '../../src/core/database'
import TestMikroOrmConfig from '../config/mikro-orm'

export async function initializeMikroOrm(): Promise<MikroORM<SqliteDriver>> {
  return await MikroORM.init<SqliteDriver>({
    ...TestMikroOrmConfig(),
    entities: [User, Token],
    metadataProvider: ReflectMetadataProvider,
  })
}

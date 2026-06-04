import { MikroORM, ReflectMetadataProvider } from '@mikro-orm/core'
import { PostgreSqlDriver } from '@mikro-orm/postgresql'

import { User, Token } from '../../src/core/database'
import TestMikroOrmConfig from '../config/mikro-orm'

export async function initializeMikroOrm(): Promise<MikroORM<PostgreSqlDriver>> {
  return await MikroORM.init<PostgreSqlDriver>({
    ...TestMikroOrmConfig(),
    entities: [User, Token],
    metadataProvider: ReflectMetadataProvider,
  })
}

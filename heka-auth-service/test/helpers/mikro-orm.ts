import { MikroORM } from '@mikro-orm/core'
import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy'
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

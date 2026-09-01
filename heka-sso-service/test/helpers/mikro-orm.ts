import { MikroORM } from '@mikro-orm/core'
import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy'
import { PostgreSqlDriver } from '@mikro-orm/postgresql'

import TestMikroOrmConfig from '../config/mikro-orm'

export async function initializeMikroOrm(): Promise<MikroORM<PostgreSqlDriver>> {
  return await MikroORM.init<PostgreSqlDriver>({
    ...TestMikroOrmConfig(),
    // No concrete entities yet — see src/core/database/database.options.ts
    entities: [],
    discovery: { warnWhenNoEntities: false },
    metadataProvider: ReflectMetadataProvider,
  })
}

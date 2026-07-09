import { MikroORM } from '@mikro-orm/core'
import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy'
import { PostgreSqlDriver } from '@mikro-orm/postgresql'

import { testLogger } from 'src/__tests__/helpers'
import entities from 'src/common/entities'
import PinoConfig from 'src/config/pino'
import TestMikroOrmConfig from 'test/config/mikro-orm'

export async function initializeMikroOrm(): Promise<MikroORM<PostgreSqlDriver>> {
  const logger = testLogger(PinoConfig())

  return await MikroORM.init<PostgreSqlDriver>({
    ...TestMikroOrmConfig(),
    driver: PostgreSqlDriver,
    logger: (message: string) => logger.trace(message),
    entities,
    metadataProvider: ReflectMetadataProvider,
  })
}

import { DbConfig } from '@core/config/configs/db.config'
import { Token, User } from '@core/database/entities'
import { Migrator } from '@mikro-orm/migrations'
import { LoadStrategy, ReflectMetadataProvider } from '@mikro-orm/postgresql'
import { SqlHighlighter } from '@mikro-orm/sql-highlighter'
import { Logger, NotFoundException } from '@nestjs/common'

const logger = new Logger('MikroORM')

export const databaseOptions = (config: DbConfig) => ({
  host: config.host,
  port: config.port,
  dbName: config.name,
  user: config.user,
  password: config.password,
  entities: [User, Token],
  findOneOrFailHandler: (entityName: string, key: any) => {
    return new NotFoundException(`${entityName} not found for ${JSON.stringify(key)}`)
  },
  migrations: {
    migrations: {
      fileName: (timestamp: string, name?: string) => {
        if (!name) return `Migration${timestamp}`
        return `Migration${timestamp}_${name}`
      },
    },
    tableName: 'migrations',
    path: 'migrations',
    pathTs: undefined,
    glob: '!(*.d).{js,ts}',
    transactional: true,
    allOrNothing: true,
    snapshot: true,
  },
  logger: logger.log.bind(logger),
  metadataProvider: ReflectMetadataProvider,
  highlighter: new SqlHighlighter(),
  debug: false,
  loadStrategy: LoadStrategy.JOINED,
  forceUtcTimezone: true,
  registerRequestContext: true,
  pool: { min: 2, max: 10 },
  extensions: [Migrator],
})

import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy'
import { Migrator } from '@mikro-orm/migrations'

import entities from './src/common/entities'
import commonConfig from './src/config/mikro-orm'

export default {
  ...commonConfig(),
  entities,
  metadataProvider: ReflectMetadataProvider,
  extensions: [Migrator],
  migrations: {
    tableName: 'migrations', // name of database table with log of executed transactions
    path: './migrations', // path to the folder with migrations
    transactional: true, // wrap each migration in a transaction
    disableForeignKeys: true, // wrap statements with `set foreign_key_checks = 0` or equivalent
    allOrNothing: true, // wrap all migrations in master transaction
  },
  metadataCache: {
    enabled: false,
  },
}

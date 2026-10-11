import { ConfigModule, ConfigService } from '@config'
import { MikroORM } from '@mikro-orm/core'
import { MikroOrmModule } from '@mikro-orm/nestjs'
import { defineConfig, PostgreSqlDriver } from '@mikro-orm/postgresql'
import { Global, Module, OnApplicationBootstrap } from '@nestjs/common'

import { databaseOptions } from './database.options'

@Global()
@Module({
  imports: [
    MikroOrmModule.forRootAsync({
      driver: PostgreSqlDriver,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        defineConfig({
          ...databaseOptions(configService.dbConfig),
        }),
    }),
  ],
  providers: [ConfigService],
})
export class DatabaseModule implements OnApplicationBootstrap {
  public constructor(private readonly orm: MikroORM) {}

  // MikroORM v7 connects lazily on the first query, so the terminus
  // MikroOrmHealthIndicator reports "Not connected to database" until then.
  // Connect eagerly on startup (also fails fast if the DB is unreachable).
  public async onApplicationBootstrap(): Promise<void> {
    await this.orm.connect()
  }
}

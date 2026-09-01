import { ConfigModule, ConfigService } from '@config'
import { MikroOrmModule } from '@mikro-orm/nestjs'
import { defineConfig, PostgreSqlDriver } from '@mikro-orm/postgresql'
import { Global, Module } from '@nestjs/common'

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
export class DatabaseModule {}

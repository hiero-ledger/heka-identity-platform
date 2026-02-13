import { ConfigModule, ConfigService } from '@config'
import { MikroOrmModule } from '@mikro-orm/nestjs'
import { defineConfig } from '@mikro-orm/postgresql'
import { Global, Module } from '@nestjs/common'

import { databaseOptions } from './database.options'

@Global()
@Module({
  imports: [
    MikroOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        defineConfig({
          ...databaseOptions(configService.dbConfig),
        }),
    }),
  ],
  providers: [ConfigService],
  exports: [MikroOrmModule],
})
export class DatabaseModule {}

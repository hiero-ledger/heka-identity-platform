import { Module } from '@nestjs/common'
import { ConfigModule as NestConfigModule } from '@nestjs/config'

import { configFactory, ConfigService } from './config.service'
import { validate } from './config.type'

@Module({
  imports: [
    NestConfigModule.forRoot({
      envFilePath: [`${process.cwd()}/env/.env.${process.env.NODE_ENV}`, `${process.cwd()}/env/.env`],
      load: [configFactory],
      isGlobal: true,
      cache: true,
      expandVariables: true,
      validate,
    }),
  ],
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}

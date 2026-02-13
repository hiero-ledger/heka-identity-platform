import { ConfigModule, ConfigService } from '@config'
import { Module } from '@nestjs/common'
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino'
import { LoggerModuleAsyncParams } from 'nestjs-pino/params'

import loggerFactory from './logger.factory'

@Module({
  imports: [
    PinoLoggerModule.forRootAsync(<LoggerModuleAsyncParams>{
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: loggerFactory,
    }),
  ],
  providers: [ConfigService],
})
export class LoggerModule {}

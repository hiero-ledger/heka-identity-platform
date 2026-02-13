import { ReflectMetadataProvider } from '@mikro-orm/core'
import { MikroOrmModule } from '@mikro-orm/nestjs'
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common'
import { ConfigModule, ConfigType } from '@nestjs/config'

import { AgentModule } from 'common/agent'
import { AnoncredsRegistryModule } from 'common/anoncreds-registry'
import { AuthModule } from 'common/auth'
import entities from 'common/entities'
import { LoggerProvider } from 'common/logger'
import { NotificationModule } from 'common/notification'
import config from 'config'
import MikroOrmConfig from 'config/mikro-orm'

import { DidRegistrarModule } from '../common/did-registrar'

import { ExceptionMapperModule } from './exception-mapper'
import { MikroOrmMiddleware } from './mikro-orm'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: config,
    }),
    MikroOrmModule.forRootAsync({
      useFactory: (mikroOrmConfig: ConfigType<typeof MikroOrmConfig>, loggerProvider: LoggerProvider) => {
        const logger = loggerProvider.getLogger().child('MikroORM')
        return {
          ...(mikroOrmConfig as any),
          logger: (message: string) => logger.trace(message),
          entities,
          metadataProvider: ReflectMetadataProvider,
        }
      },
      inject: [MikroOrmConfig.KEY, LoggerProvider],
    }),
    AgentModule,
    NotificationModule,
    AuthModule,
    ExceptionMapperModule,
    DidRegistrarModule,
    AnoncredsRegistryModule,
  ],
})
export class CoreModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(MikroOrmMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL })
  }
}

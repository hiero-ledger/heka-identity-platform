import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy'
import { MikroOrmModule } from '@mikro-orm/nestjs'
import { PostgreSqlDriver } from '@mikro-orm/postgresql'
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common'
import { ConfigModule, ConfigType } from '@nestjs/config'

import { AgentModule } from 'common/agent'
import { AnoncredsRegistryModule } from 'common/anoncreds-registry'
import { AuthModule } from 'common/auth'
import entities from 'common/entities'
import { LoggerProvider } from 'common/logger'
import { NotificationModule } from 'common/notification'
import config from 'config'
import { assertSecureConfiguration } from 'config/insecure-defaults'
import MikroOrmConfig from 'config/mikro-orm'

import { DidRegistrarModule } from '../common/did-registrar'

import { ExceptionMapperModule } from './exception-mapper'
import { MikroOrmMiddleware } from './mikro-orm'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: config,
      // Warns about publicly known default secrets and refuses to start unless NODE_ENV is unset, empty, development or test.
      // Returns the env record unchanged so `.env` values are still assigned to `process.env`.
      validate: (env) => {
        assertSecureConfiguration(env)
        return env
      },
    }),
    MikroOrmModule.forRootAsync({
      driver: PostgreSqlDriver,
      useFactory: (mikroOrmConfig: ConfigType<typeof MikroOrmConfig>, loggerProvider: LoggerProvider) => {
        const logger = loggerProvider.getLogger().child('MikroORM')
        return {
          ...mikroOrmConfig,
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

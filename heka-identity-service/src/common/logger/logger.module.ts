import { DynamicModule, Global, Inject, Module, Type } from '@nestjs/common'
import { ConfigType } from '@nestjs/config'
import { LoggerModule as NestPinoLoggerModule } from 'nestjs-pino'

import PinoConfig from 'config/pino'

import { LoggerProvider } from './logger.provider'

const loggerSuppliedTypes = new Set<Type>()

function getLoggerToken(type: Type) {
  return `${type.name}Logger`
}

export const InjectLogger = (type: Type) => {
  loggerSuppliedTypes.add(type)
  return Inject(getLoggerToken(type))
}

@Global()
@Module({
  imports: [
    NestPinoLoggerModule.forRootAsync({
      useFactory: (pinoConfig: ConfigType<typeof PinoConfig>) => {
        return {
          pinoHttp: pinoConfig,
        }
      },
      inject: [PinoConfig.KEY],
    }),
  ],
  providers: [LoggerProvider],
  exports: [LoggerProvider],
})
export class LoggerModule {
  public static forRoot(): DynamicModule {
    // When LoggerModule is dynamic and the last initialized module in the app,
    // all the logger-supplied types have already been added to loggerSuppliedTypes set.
    // In such case now we know all the tokens to provide loggers for.
    const providers = Array.from(loggerSuppliedTypes).map((type) => ({
      provide: getLoggerToken(type),
      useFactory: (loggerProvider: LoggerProvider) => {
        const logger = loggerProvider.getLogger()
        return logger.child(type.name)
      },
      inject: [LoggerProvider],
    }))

    return {
      module: LoggerModule,
      providers,
      exports: providers,
    }
  }
}

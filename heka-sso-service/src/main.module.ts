import { ConfigModule, ConfigService } from '@config'
import { DatabaseModule } from '@core/database'
import { LoggerModule } from '@core/logger'
import { CorrelationIdMiddleware } from '@eropple/nestjs-correlation-id'
import { ClassSerializerInterceptor, INestApplication, Module, ValidationPipe, VersioningType } from '@nestjs/common'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import chalk from 'chalk'
import { Logger, LoggerErrorInterceptor } from 'nestjs-pino'

import { HealthModule } from './health'
import { OidcModule } from './oidc'

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    DatabaseModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            ttl: configService.throttleConfig.ttl,
            limit: configService.throttleConfig.limit,
          },
        ],
      }),
    }),
    OidcModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class MainModule {
  public static appConfigure = (app: INestApplication) => {
    const config = app.get(ConfigService).config

    app.use(CorrelationIdMiddleware())

    // Deliberately no global body-parser middleware here: the oidc-provider
    // instance (Phase 1, INTEGRATION.md §5) parses its own request bodies from
    // the raw stream; interaction routes parse selectively.

    app.enableShutdownHooks()

    app.enableVersioning({
      type: VersioningType.URI,
    })

    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )

    app.useGlobalInterceptors(new LoggerErrorInterceptor())
    app.useGlobalInterceptors(new ClassSerializerInterceptor(new Reflector()))

    if (config.app.enableCors) {
      app.enableCors({
        credentials: false,
        methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
        maxAge: 3600,
        // origin: config.app.allowedOrigins,
        exposedHeaders: ['Content-Disposition'],
      })
    }
  }

  public static swaggerConfigure = (app: INestApplication) => {
    const config = app.get(ConfigService).config.app

    const options = new DocumentBuilder().setTitle(`Heka SSO Service`).setVersion(config.version).build()

    const document = SwaggerModule.createDocument(app, options)
    SwaggerModule.setup(`${config.prefix}/docs`, app, document, { swaggerOptions: { defaultModelsExpandDepth: -1 } })
  }

  public static async bootstrap(app: INestApplication) {
    const logger = app.get(Logger)
    app.useLogger(logger)

    this.appConfigure(app)

    this.swaggerConfigure(app)

    // Start app
    const configService = app.get(ConfigService)
    const config = configService.appConfig

    await app.listen(config.port)

    logger.verbose(`==========================================================`)
    logger.verbose(`Configuration:`)
    logger.verbose(configService.config)

    const url = (await app.getUrl()).replace('[::1]', 'localhost')

    logger.log(`==========================================================`)
    const appUrl = `${url}`
    logger.log(`Application is running on: ${chalk.green(appUrl)}`)

    const swaggerUrl = config.prefix ? `${url}/${config.prefix}/docs` : `${url}/docs`
    logger.log(`==========================================================`)
    logger.log(`Swagger is running on: ${chalk.green(swaggerUrl)}`)
  }
}

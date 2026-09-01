import { securityHeaders } from '@common/middleware'
import { ConfigModule, ConfigService } from '@config'
import { DatabaseModule } from '@core/database'
import { LoggerModule } from '@core/logger'
import { CorrelationIdMiddleware } from '@eropple/nestjs-correlation-id'
import { ClassSerializerInterceptor, INestApplication, Module, ValidationPipe, VersioningType } from '@nestjs/common'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { ScheduleModule } from '@nestjs/schedule'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import chalk from 'chalk'
import { Logger, LoggerErrorInterceptor } from 'nestjs-pino'
import type Provider from 'oidc-provider'

import { HealthModule } from './health'
import { OidcModule } from './oidc'
import { OIDC_PROVIDER } from './oidc/provider.factory'

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    DatabaseModule,
    ScheduleModule.forRoot(),
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
    // Security headers for every response — ahead of the provider mount below,
    // which short-circuits the middleware chain for the OP's own paths.
    app.use(securityHeaders())

    // The whole service is the OP (INTEGRATION.md §5-Decide-2): the provider
    // is mounted at the app root and owns every path except the Nest surface.
    // This middleware is registered before Nest's init-time body parsers, so
    // no body parser sits in front of the provider (§5-Decide-3) — it parses
    // its own request bodies from the raw stream; requests that fall through
    // to Nest still get the standard parsers.
    // /interaction is the wallet-login interaction surface (Nest controllers,
    // INTEGRATION.md P1.3) — everything else outside /health and the API
    // prefix belongs to the provider.
    const nestPrefixes = ['/health', '/interaction', `/${config.app.prefix}`]
    const oidcCallback = app.get<Provider>(OIDC_PROVIDER).callback()
    app.use((req: { path?: string; url: string }, res: any, next: () => void) => {
      const path = req.path ?? req.url.split('?')[0]
      if (nestPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return next()
      return oidcCallback(req as any, res)
    })

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

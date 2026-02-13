import { ConfigModule, ConfigService } from '@config'
import { DatabaseModule } from '@core/database'
import { LoggerModule } from '@core/logger'
import { ScheduledTaskModule } from '@core/scheduled-tasks/scheduled-tasks.module'
import { CorrelationIdMiddleware } from '@eropple/nestjs-correlation-id'
import { ClassSerializerInterceptor, INestApplication, Module, ValidationPipe, VersioningType } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import bodyParser from 'body-parser'
import chalk from 'chalk'
import { Logger, LoggerErrorInterceptor } from 'nestjs-pino'

import { OAuthModule } from './oauth'
import { UserModule } from './user'
import { HealthModule } from './health'

@Module({
  imports: [ConfigModule, LoggerModule, DatabaseModule, ScheduledTaskModule, OAuthModule, UserModule, HealthModule],
})
export class MainModule {
  public static appConfigure = (app: INestApplication) => {
    const config = app.get(ConfigService).config

    app.use(CorrelationIdMiddleware())

    app.use(bodyParser.json({ type: 'application/json', limit: config.app.requestSizeLimit }))

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

    const options = new DocumentBuilder()
      .setTitle(`Heka Auth Service`)
      .setVersion(config.version)
      .addBearerAuth({
        type: 'http',
        name: 'bearer',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      })
      .build()

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

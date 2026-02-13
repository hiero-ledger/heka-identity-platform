import fs from 'fs'

import {
  ClassSerializerInterceptor,
  INestApplication,
  ValidationPipe,
  VERSION_NEUTRAL,
  VersioningType,
} from '@nestjs/common'
import { ConfigType } from '@nestjs/config'
import { Reflector } from '@nestjs/core'
import { WsAdapter } from '@nestjs/platform-ws'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import chalk from 'chalk'
import yaml from 'yaml'

import { LoggerProvider } from 'common/logger'
import ExpressConfig from 'config/express'
import { ExceptionMapperInterceptor } from 'core/exception-mapper'

import { AppModule } from './app.module'
import { CredoExceptionFilter } from './common/agent'
import { OCAFilesService } from './common/oca/oca.files.service'
import { getPackageVersion, isNonVersionPath, isVersionPath } from './utils/version'

const addSwagger = (app: INestApplication, appConfig: ConfigType<typeof ExpressConfig>, appVersion: string) => {
  const API_PREFIX = appConfig.prefix ?? ''
  const API_VERSIONS = [undefined, '', '2']
  const API_TITLE = `Heka Identity Service`
  const API_DESCRIPTION = `${API_TITLE} API`

  const DOC_PREFIX = `${API_PREFIX ? `${API_PREFIX}/` : ''}docs`
  const DOC_PREFIX_ALL = `all`
  const DOC_PREFIX_NONE = `none`

  const docName = (version: string | undefined): string => {
    const v = version === DOC_PREFIX_ALL ? undefined : version === DOC_PREFIX_NONE ? '' : version
    return v === undefined ? 'All versions' : !v ? 'Without version' : `Version ${version}`
  }

  const docPath = (version: string | undefined): string => {
    return `${DOC_PREFIX}/v-${version !== undefined ? `${version ? `${version}` : DOC_PREFIX_NONE}` : DOC_PREFIX_ALL}`
  }

  const config = new DocumentBuilder()
    .setTitle(API_TITLE)
    .setVersion(appVersion)
    .setDescription(API_DESCRIPTION)
    .addBearerAuth()
    .addSecurityRequirements('bearer')
    .build()

  const document = SwaggerModule.createDocument(app, config, {
    include: [AppModule],
    deepScanRoutes: true,
    autoTagControllers: true,
  })

  SwaggerModule.setup(`${DOC_PREFIX}`, app, document, {
    customSiteTitle: API_TITLE,
    explorer: true,
    swaggerOptions: {
      useGlobalPrefix: true,
      defaultModelsExpandDepth: -1,
      urls: API_VERSIONS.map((v) => ({
        name: docName(v),
        url: `/${docPath(v)}/swagger.yaml`,
      })),
    },
  })

  fs.writeFileSync('./docs/swagger-spec.yaml', yaml.stringify(document))

  API_VERSIONS.forEach((version) => {
    const config = new DocumentBuilder()
      .setTitle(API_TITLE)
      .setDescription(API_DESCRIPTION)
      .setVersion(`app: ${appVersion}`)
      .addBearerAuth()
      .addSecurityRequirements('bearer')
      .build()

    const document = SwaggerModule.createDocument(app, config)

    SwaggerModule.setup(`${docPath(version)}`, app, document, {
      customSiteTitle: API_TITLE,
      yamlDocumentUrl: `/${docPath(version)}/swagger.yaml`,
      patchDocumentOnRequest: (req, _res, document) => {
        const copyDocument = yaml.parse(yaml.stringify(document))

        // @ts-expect-error @typescript-eslint/ban-ts-comment
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        const version = req.url.replace(`/${DOC_PREFIX}/`, '').split('/')[0]
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        const v: string = version.replace(/^v-/, '')

        document.info.version = `App: ${appVersion}. ${docName(v)}`

        if (v === DOC_PREFIX_ALL) return copyDocument

        for (const route in document.paths) {
          const cleanRoute = API_PREFIX ? route.replace(`/${API_PREFIX}`, '') : route
          if (v !== DOC_PREFIX_NONE ? isVersionPath(cleanRoute, v) : isNonVersionPath(cleanRoute)) {
            continue
          }
          delete copyDocument.paths[route]
        }

        return copyDocument
      },
    })
  })
}

export async function startApp(app: INestApplication, { withSwaggerUi }: { withSwaggerUi?: boolean } = {}) {
  const appVersion = getPackageVersion()
  const expressConfig = app.get<ConfigType<typeof ExpressConfig>>(ExpressConfig.KEY)

  const logger = app.get(LoggerProvider).getNestLogger()
  app.useLogger(logger)

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

  app.useGlobalFilters(new CredoExceptionFilter())
  app.useGlobalInterceptors(new ClassSerializerInterceptor(new Reflector()), app.get(ExceptionMapperInterceptor))

  if (expressConfig.prefix) {
    app.setGlobalPrefix(expressConfig.prefix)
  }

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: VERSION_NEUTRAL,
  })

  if (expressConfig.enableCors) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    app.enableCors(expressConfig.corsOptions)
  }

  app.useWebSocketAdapter(new WsAdapter(app))

  if (withSwaggerUi) addSwagger(app, expressConfig, appVersion)

  app.enableShutdownHooks()

  // process.on('unhandledRejection', (err) => {
  //   logger.error(`Unhandled Rejection: ${err}`)
  // })

  // Recreate OCA files for Aries
  await app.get(OCAFilesService)?.run()

  await app.listen(expressConfig.port)

  const url = (await app.getUrl()).replace('[::1]', 'localhost')

  logger.log(`==========================================================`)
  const appUrl = `${url}`
  logger.log(`Application is running on: ${chalk.green(appUrl)}`)
  logger.log(`Application version: ${appVersion}`)

  const swaggerUrl = expressConfig.prefix ? `${url}/${expressConfig.prefix}/docs` : `${url}/docs`
  logger.log(`==========================================================`)
  logger.log(`Swagger is running on: ${chalk.green(swaggerUrl)}`)
}

import { ConfigService, LoggerConfig } from '@config'
import { RequestMethod } from '@nestjs/common'
import { isDev } from '@utils'
import { Params } from 'nestjs-pino/params'
import pino from 'pino'

function consoleTransport(config: LoggerConfig): pino.TransportTargetOptions[] {
  return [
    {
      target: 'pino-pretty',
      level: config.level,
      options: {
        translateTime: true,
        singleLine: true,
        colorize: isDev,
        redact: config.redactFields,
        messageFormat: '[{req.headers.x-correlation-id}][{context}] {msg}',
        ignore: 'pid,hostname,req,res,context,responseTime',
      },
    },
  ]
}

export default (configService: ConfigService): Params => {
  const conf = configService.loggerConfig
  return {
    pinoHttp: {
      base: null,
      autoLogging: false,
      quietReqLogger: !isDev,
      level: conf.level,
      genReqId: function (req: any) {
        return req.get('X-Correlation-Id')
      },
      timestamp: () => `,"timestamp":"${new Date(Date.now()).toISOString()}"`,
      redact: {
        paths: conf.redactFields,
        censor: '******',
      },
      ...(isDev
        ? {
            transport: {
              targets: [...consoleTransport(conf)],
            },
          }
        : {}),
    },
    exclude: conf.excludeUrls.map((path) => ({ method: RequestMethod.ALL, path: path })),
  }
}

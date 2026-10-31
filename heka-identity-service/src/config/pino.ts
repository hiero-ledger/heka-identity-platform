import { registerAs } from '@nestjs/config'

import { maskSecretsInRequest } from 'common/logger/mask-request'

const transport =
  process.env.NODE_ENV === 'production'
    ? {
        target: 'pino/file',
        options: {
          // If `destination` is `undefined` rather than set to a file path, logs will be written to STDOUT (console)
          destination: process.env.PINO_FILE_DESTINATION,
          mkdir: true,
        },
      }
    : {
        target: 'pino-pretty',
        options: {
          translateTime: true,
          colorize: true,
          ignore: 'context',
          singleLine: true,
        },
      }

export default registerAs('pino', () => ({
  transport,
  level: process.env.PINO_LEVEL || 'info',
  redact: {
    paths: [
      'password',
      '*.password',
      // pino-http logs the serialized request and response on every line of a request
      'req.headers.authorization',
      'req.headers["proxy-authorization"]',
      'req.headers.cookie',
      // the notifications WebSocket carries the access token in this header; redacted in case a request with it reaches pino-http
      'req.headers["sec-websocket-protocol"]',
      'res.headers["set-cookie"]',
    ],
    censor: '******',
  },
  // pino-http logs the request URL and query on every line of a request; this masks the OID4VC session secrets in them
  serializers: { req: maskSecretsInRequest },
}))

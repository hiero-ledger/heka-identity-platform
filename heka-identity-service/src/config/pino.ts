import { registerAs } from '@nestjs/config'

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
    paths: ['password', '*.password'],
    censor: '******',
  },
}))

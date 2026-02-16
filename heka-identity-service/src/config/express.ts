import { registerAs } from '@nestjs/config'

export default registerAs('express', () => {
  const port = process.env.EXPRESS_PORT || 3000
  const host = process.env.EXPRESS_HOST || 'localhost'
  const prefix = process.env.EXPRESS_PREFIX
  const appEndpoint = process.env.APP_ENDPOINT ?? `http://${host}:${port}${prefix ? `/${prefix}` : ''}`
  const enableCors = process.env.EXPRESS_ENABLE_CORS ? process.env.EXPRESS_ENABLE_CORS === 'true' : true
  const corsOptions = process.env.EXPRESS_CORS_OPTIONS ? JSON.parse(process.env.EXPRESS_CORS_OPTIONS) : {}
  return {
    port,
    host,
    appEndpoint,
    prefix,
    enableCors,
    corsOptions,
  }
})
